const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function le(size, values) { const out = new Uint8Array(size); const view = new DataView(out.buffer); for (const [offset, value, bytes] of values) { if (bytes === 2) view.setUint16(offset, value, true); else view.setUint32(offset, value, true); } return out; }
function dosDateTime(date = new Date()) { return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }
function uniqueFilename(original, used, index) {
  let name = String(original || `photo-${index + 1}.jpg`).replace(/[\\/\\\\:*?"<>|\x00-\x1f]/g, "_").trim();
  if (!name || name === "." || name === "..") name = `photo-${index + 1}.jpg`;
  if (name.length > 180) name = name.slice(-180);
  const dot = name.lastIndexOf("."); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name, n = 2; while (used.has(candidate.toLowerCase())) candidate = `${base} (${n++})${ext}`;
  used.add(candidate.toLowerCase()); return candidate;
}
function localHeader(name, crc, size, dt) { return le(30, [[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[8,0,2],[10,dt.time,2],[12,dt.date,2],[14,crc,4],[18,size,4],[22,size,4],[26,name.length,2],[28,0,2]]); }
function centralHeader(name, crc, size, offset, dt) { return le(46, [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[10,0,2],[12,dt.time,2],[14,dt.date,2],[16,crc,4],[20,size,4],[24,size,4],[28,name.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,offset,4]]); }
function endRecord(count, centralSize, centralOffset) { return le(22, [[0,0x06054b50,4],[4,0,2],[6,0,2],[8,count,2],[10,count,2],[12,centralSize,4],[16,centralOffset,4],[20,0,2]]); }
export async function downloadGalleryZip(request, env, slug) {
  const gallery = await env.DB.prepare("SELECT id,slug,title,status,downloads_enabled,password_hash FROM galleries WHERE slug=?").bind(slug).first();
  if (!gallery || gallery.status !== "published") return json({ error: "This gallery is unavailable." }, 404);
  if (!gallery.downloads_enabled) return json({ error: "Downloads are disabled for this gallery." }, 403);
  let body = {}; try { body = await request.json(); } catch {}
  if (gallery.password_hash) {
    const supplied = await crypto.subtle.digest("SHA-256", encoder.encode(String(body.password || "")));
    const digest = [...new Uint8Array(supplied)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== gallery.password_hash) return json({ error: "Unlock this gallery before downloading." }, 401);
  }
  const result = await env.DB.prepare("SELECT id,original_filename,storage_key FROM photos WHERE gallery_id=? ORDER BY sort_order,created_at").bind(gallery.id).all();
  const photos = result.results || [];
  if (photos.length > 65535) return json({ error: "This gallery has too many files for a single ZIP archive." }, 413);
  const safeSlug = String(gallery.slug || "gallery").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "gallery";
  const chunks = [];
  const central = [];
  let offset = 0;
  const used = new Set();
  const dt = dosDateTime();
  let included = 0;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const object = await env.PHOTOS.get(photo.storage_key);
    if (!object) {
      console.error("Gallery ZIP photo missing from R2", { slug, photoId: photo.id, storageKey: photo.storage_key });
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > 0xffffffff || offset + bytes.byteLength > 0xffffffff) return json({ error: "This gallery is too large for a single ZIP file. Please download photos individually." }, 413);
    const name = encoder.encode(uniqueFilename(photo.original_filename, used, i));
    const crc = crc32(bytes);
    const local = localHeader(name, crc, bytes.byteLength, dt);
    const entryOffset = offset;
    chunks.push(local, name, bytes);
    offset += local.byteLength + name.byteLength + bytes.byteLength;
    central.push({ header: centralHeader(name, crc, bytes.byteLength, entryOffset, dt), name });
    included++;
  }
  if (included === 0) {
    console.error("Gallery ZIP contains no retrievable photo objects", { slug, databasePhotoCount: photos.length });
    return json({ error: photos.length ? "We found the gallery photos but could not retrieve their image files. Please contact the gallery owner." : "There are no photos available to download in this gallery." }, 404);
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const entry of central) {
    chunks.push(entry.header, entry.name);
    offset += entry.header.byteLength + entry.name.byteLength;
    centralSize += entry.header.byteLength + entry.name.byteLength;
  }
  chunks.push(endRecord(central.length, centralSize, centralOffset));
  const archive = new Uint8Array(offset + 22);
  let cursor = 0;
  for (const chunk of chunks) { archive.set(chunk, cursor); cursor += chunk.byteLength; }
  return new Response(archive, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${safeSlug}-photos.zip"`, "content-length": String(archive.byteLength), "x-snapapp-zip-photos": String(included), "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
