const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const encoder = new TextEncoder();
// Slicing-by-8 keeps ZIP checksum work fast enough for large photo batches.
const crcTables = Array.from({ length: 8 }, () => new Uint32Array(256));
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTables[0][n] = c >>> 0; }
for (let table = 1; table < crcTables.length; table++) {
  for (let n = 0; n < 256; n++) {
    const previous = crcTables[table - 1][n];
    crcTables[table][n] = (crcTables[0][previous & 0xff] ^ (previous >>> 8)) >>> 0;
  }
}
function updateCrc(crc, bytes) {
  let index = 0;
  const limit = bytes.length - 7;
  for (; index < limit; index += 8) {
    const value = crc ^ (bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24));
    crc = crcTables[7][value & 0xff] ^ crcTables[6][(value >>> 8) & 0xff] ^
      crcTables[5][(value >>> 16) & 0xff] ^ crcTables[4][value >>> 24] ^
      crcTables[3][bytes[index + 4]] ^ crcTables[2][bytes[index + 5]] ^
      crcTables[1][bytes[index + 6]] ^ crcTables[0][bytes[index + 7]];
  }
  const table = crcTables[0];
  for (; index < bytes.length; index++) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}
function le(size, values) { const out = new Uint8Array(size); const view = new DataView(out.buffer); for (const [offset, value, bytes] of values) { if (bytes === 2) view.setUint16(offset, value, true); else view.setUint32(offset, value, true); } return out; }
function dosDateTime(date = new Date()) { return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }
function uniqueFilename(original, used, index) {
  let name = String(original || ("photo-" + (index + 1) + ".jpg")).replace(/[\\/\\\\:*?"<>|\x00-\x1f]/g, "_").trim();
  if (!name || name === "." || name === "..") name = "photo-" + (index + 1) + ".jpg";
  if (name.length > 180) name = name.slice(-180);
  const dot = name.lastIndexOf("."); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name, n = 2; while (used.has(candidate.toLowerCase())) candidate = base + " (" + (n++) + ")" + ext;
  used.add(candidate.toLowerCase()); return candidate;
}
function localHeader(name, dt) { return le(30, [[0,0x04034b50,4],[4,20,2],[6,0x0808,2],[8,0,2],[10,dt.time,2],[12,dt.date,2],[14,0,4],[18,0,4],[22,0,4],[26,name.length,2],[28,0,2]]); }
function dataDescriptor(crc, size) { return le(16, [[0,0x08074b50,4],[4,crc,4],[8,size,4],[12,size,4]]); }
function centralHeader(name, crc, size, offset, dt) { return le(46, [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0808,2],[10,0,2],[12,dt.time,2],[14,dt.date,2],[16,crc,4],[20,size,4],[24,size,4],[28,name.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,offset,4]]); }
function endRecord(count, centralSize, centralOffset) { return le(22, [[0,0x06054b50,4],[4,0,2],[6,0,2],[8,count,2],[10,count,2],[12,centralSize,4],[16,centralOffset,4],[20,0,2]]); }

async function buildGalleryZip(request, env, slug, reference) {
  const gallery = await env.DB.prepare("SELECT id,slug,title,status,downloads_enabled,password_hash,download_pin_hash FROM galleries WHERE slug=?").bind(slug).first();
  if (!gallery || gallery.status !== "published") return json({ error: "This gallery is unavailable." }, 404);
  if (!gallery.downloads_enabled) return json({ error: "Downloads are disabled for this gallery." }, 403);
  let body = {}; try { body = await request.json(); } catch {}
  if (gallery.password_hash) {
    const supplied = await crypto.subtle.digest("SHA-256", encoder.encode(String(body.password || "")));
    const digest = [...new Uint8Array(supplied)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== gallery.password_hash) return json({ error: "Unlock this gallery before downloading." }, 401);
  }
  if (gallery.download_pin_hash) {
    const suppliedPin = await crypto.subtle.digest("SHA-256", encoder.encode(String(body.downloadPin || "")));
    const pinDigest = [...new Uint8Array(suppliedPin)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (pinDigest !== gallery.download_pin_hash) return json({ error: "Enter the correct download PIN to download this gallery.", code: "INVALID_DOWNLOAD_PIN" }, 401);
  }

  let requestedIds = null;
  if (body.photoIds !== undefined) {
    if (!Array.isArray(body.photoIds) || body.photoIds.length < 1 || body.photoIds.length > 50 ||
        body.photoIds.some(id => typeof id !== "string" || !id || id.length > 120)) {
      return json({ error: "Choose between 1 and 50 valid photos for each ZIP part.", code: "INVALID_ZIP_PHOTO_LIST" }, 400);
    }
    requestedIds = [...new Set(body.photoIds)];
    if (requestedIds.length !== body.photoIds.length) return json({ error: "A photo was included more than once in this ZIP part." }, 400);
  }
  const photoSql = "SELECT id,original_filename,storage_key,bytes FROM photos WHERE gallery_id=?" +
    (requestedIds ? " AND id IN (" + requestedIds.map(() => "?").join(",") + ")" : "") +
    " ORDER BY sort_order,created_at";
  const result = await env.DB.prepare(photoSql).bind(gallery.id, ...(requestedIds || [])).all();
  const photos = result.results || [];
  if (requestedIds && photos.length !== requestedIds.length) return json({ error: "One or more selected photos are no longer available in this gallery." }, 404);
  const knownBytes = photos.reduce((total, photo) => total + Math.max(0, Number(photo.bytes) || 0), 0);
  if (knownBytes > 96 * 1024 * 1024) return json({ error: "This ZIP part is too large. Select fewer photos and try again.", code: "ZIP_PART_TOO_LARGE" }, 413);
  if (photos.length > 65535) return json({ error: "This gallery has too many files for a single ZIP archive." }, 413);
  if (!photos.length) return json({ error: "There are no photos available to download in this gallery." }, 404);

  const safeSlug = String(gallery.slug || "gallery").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "gallery";
  async function* zipChunks() {
    const central = []; let offset = 0; const used = new Set(); const dt = dosDateTime();
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const object = await env.PHOTOS.get(photo.storage_key);
      if (!object || !object.body) {
        const error = new Error("A gallery photo is missing from R2 storage.");
        error.zipFailureCode = "PHOTO_MISSING";
        throw error;
      }
      if (Number.isFinite(object.size) && (object.size > 0xffffffff || offset + 30 + 180 + object.size + 16 > 0xffffffff)) {
        const error = new Error("This gallery is too large for a single ZIP file.");
        error.zipFailureCode = "ZIP64_REQUIRED";
        throw error;
      }

      const name = encoder.encode(uniqueFilename(photo.original_filename, used, i));
      const entryOffset = offset;
      const local = localHeader(name, dt);
      offset += local.byteLength + name.byteLength;
      yield local;
      yield name;

      let crc = 0xffffffff, size = 0;
      const reader = object.body.getReader();
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          const bytes = item.value instanceof Uint8Array ? item.value : new Uint8Array(item.value);
          size += bytes.byteLength;
          if (size > 0xffffffff || offset + bytes.byteLength + 16 > 0xffffffff) {
            const error = new Error("This gallery is too large for a single ZIP file.");
            error.zipFailureCode = "ZIP64_REQUIRED";
            throw error;
          }
          crc = updateCrc(crc, bytes);
          offset += bytes.byteLength;
          yield bytes;
        }
      } finally {
        reader.releaseLock();
      }
      crc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = dataDescriptor(crc, size);
      offset += descriptor.byteLength;
      yield descriptor;
      central.push({ header: centralHeader(name, crc, size, entryOffset, dt), name });
    }

    const centralOffset = offset; let centralSize = 0;
    for (const entry of central) {
      yield entry.header; offset += entry.header.byteLength; centralSize += entry.header.byteLength;
      yield entry.name; offset += entry.name.byteLength; centralSize += entry.name.byteLength;
    }
    yield endRecord(central.length, centralSize, centralOffset);
  }
  const iterator = zipChunks();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (item.done) controller.close();
        else controller.enqueue(item.value);
      } catch (error) {
        console.error("Gallery ZIP generation failed", { reference, slug, code: error?.zipFailureCode || "ZIP_STREAM_FAILED", error: String(error?.stack || error) });
        controller.error(error);
      }
    },
    async cancel() { if (iterator.return) await iterator.return(); }
  });
  return new Response(stream, { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"" + safeSlug + "-photos.zip\"", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-snapapp-zip-photos": String(photos.length), "x-snapapp-zip-reference": reference } });
}

/**
 * Convert unexpected D1/R2/ZIP failures into a traceable JSON response.
 * Cloudflare's default HTML 500 page hides the cause from the gallery UI.
 */
export async function downloadGalleryZip(request, env, slug) {
  const reference = crypto.randomUUID();
  try {
    return await buildGalleryZip(request, env, slug, reference);
  } catch (error) {
    const code = error?.zipFailureCode || "ZIP_BUILD_FAILED";
    console.error("Gallery ZIP request failed", { reference, code, slug, error: String(error?.stack || error) });
    const message = code === "PHOTO_MISSING"
      ? "A gallery photo is missing from storage. Ask the gallery owner to re-upload it."
      : code === "ZIP64_REQUIRED"
        ? "This gallery exceeds the supported single-ZIP size. Please download photos in smaller groups."
        : "The ZIP could not be prepared because the gallery or its images could not be read. Please retry.";
    return json({ error: message + " Reference: " + reference, code, reference }, code === "ZIP64_REQUIRED" ? 413 : 500);
  }
}
