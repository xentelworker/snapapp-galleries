import { manageGalleries } from "./manage.js";
import { archiveDue, lifecycleValues } from "./lifecycle.js";
import { browserUpload } from "./browser-upload.js";
import { adminUser, handleAuth } from "./auth.js";
import { downloadGalleryZip } from "./zip.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const hex = (bytes) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function requireAdmin(request, env) {
  return !!(await adminUser(request, env));
}

async function galleryBySlug(env, slug) {
  await archiveDue(env);
  return env.DB.prepare("SELECT * FROM galleries WHERE slug = ? AND status = 'published'").bind(slug).first();
}

async function listPhotos(env, galleryId) {
  try {
    const result = await env.DB.prepare(
      `SELECT p.id,p.original_filename,p.storage_key,p.thumbnail_key,p.cover_key,p.width,p.height,p.bytes,p.created_at,
              s.name AS set_name,s.slug AS set_slug
         FROM photos p LEFT JOIN gallery_sets s ON s.id=p.set_id
        WHERE p.gallery_id=? ORDER BY p.sort_order,p.created_at`
    ).bind(galleryId).all();
    return result.results || [];
  } catch {
    const result = await env.DB.prepare(
      `SELECT p.id,p.original_filename,p.storage_key,p.thumbnail_key,p.width,p.height,p.bytes,p.created_at,
              s.name AS set_name,s.slug AS set_slug
         FROM photos p LEFT JOIN gallery_sets s ON s.id=p.set_id
        WHERE p.gallery_id=? ORDER BY p.sort_order,p.created_at`
    ).bind(galleryId).all();
    return result.results || [];
  }
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(archiveDue(env)); },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/auth/")) return handleAuth(request, env);

    const upload = await browserUpload(request, env);
    if (upload) return upload;

    const management = await manageGalleries(request, env);
    if (management) return management;

    if (path === "/api/health") {
      return json({ ok: true, service: "snapapp-galleries", domain: "gallery.snapapp.ca" });
    }

    if (path === "/api/admin/galleries" && request.method === "GET") {
      if (!(await requireAdmin(request, env))) return json({ error: "unauthorized" }, 401);
      const rows = await env.DB.prepare("SELECT * FROM galleries ORDER BY created_at DESC").all();
      return json({ galleries: rows.results || [] });
    }

    if (path === "/api/admin/galleries" && request.method === "POST") {
      if (!(await requireAdmin(request, env))) return json({ error: "unauthorized" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid gallery details." }, 400); }
      if (!body || typeof body.title !== "string" || !body.title.trim()) return json({ error: "Enter a gallery title." }, 400);
      if (body.title.length > 200) return json({ error: "Keep the gallery title under 200 characters." }, 400);
      for (const field of ["slug", "subtitle", "password", "downloadPin", "brandName", "accentColor"]) {
        if (body[field] != null && typeof body[field] !== "string") return json({ error: "Invalid gallery details." }, 400);
      }
      if (body.status && !["draft", "published", "archived"].includes(body.status)) return json({ error: "Choose a valid gallery status." }, 400);
      if (body.visibility && !["public", "unlisted", "private"].includes(body.visibility)) return json({ error: "Choose a valid visibility." }, 400);
      let lifecycle;
      try { lifecycle = lifecycleValues(body); } catch (e) { return json({error:e.message},400); }
      const galleryId = id("gal");
      const setId = id("set");
      const customSlug = !!body.slug?.trim();
      const baseSlug = slugify(body.slug || body.title) || galleryId;
      const passwordHash = body.password ? await sha256(body.password) : null;
      const pinHash = body.downloadPin ? await sha256(body.downloadPin) : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const slug = attempt === 0 ? baseSlug : baseSlug + "-" + crypto.randomUUID().slice(0, 8);
        try {
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO galleries
                (id,slug,title,subtitle,status,visibility,password_hash,download_pin_hash,downloads_enabled,show_branding,brand_name,accent_color,event_date,auto_archive_enabled,auto_archive_started_at,expires_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(
              galleryId, slug, body.title.trim(), body.subtitle || "", body.status || "draft",
              body.visibility || "unlisted", passwordHash, pinHash,
              body.downloadsEnabled === false ? 0 : 1, body.showBranding === false ? 0 : 1,
              body.brandName || "SnapApp", body.accentColor || "#171717",
              lifecycle.event_date,lifecycle.auto_archive_enabled,lifecycle.auto_archive_started_at,lifecycle.expires_at
            ),
            env.DB.prepare("INSERT INTO gallery_sets (id,gallery_id,name,slug,sort_order) VALUES (?,?,?,?,0)")
              .bind(setId, galleryId, "Highlights", "highlights")
          ]);
          return json({ id: galleryId, slug, title: body.title.trim(), defaultSetId: setId }, 201);
        } catch (error) {
          const detail = String(error.message || "") + " " + String(error.cause?.message || "");
          if (/UNIQUE constraint failed: galleries.slug/i.test(detail)) {
            if (customSlug) return json({ error: "That gallery address is already in use. Choose another address." }, 409);
            continue;
          }
          return json({ error: "We couldn't save the gallery. Please try again." }, 500);
        }
      }
      return json({ error: "Couldn't choose an available gallery address. Please try again." }, 409);
    }

    const zipMatch = path.match(/^\/api\/galleries\/([^/]+)\/download\.zip$/);
    if (zipMatch && request.method === "POST") return downloadGalleryZip(request, env, decodeURIComponent(zipMatch[1]));

    const publicMatch = path.match(/^\/api\/galleries\/([^/]+)$/);
    if (publicMatch && request.method === "GET") {
      const gallery = await galleryBySlug(env, decodeURIComponent(publicMatch[1]));
      if (!gallery) return json({ error: "gallery_not_found" }, 404);
      if (gallery.password_hash) return json({
        gallery: { slug: gallery.slug, title: gallery.title, subtitle: gallery.subtitle, locked: true, showBranding: !!gallery.show_branding, brandName: gallery.brand_name, has_download_pin: !!gallery.download_pin_hash }
      });
      return json({ gallery: { ...gallery, has_download_pin: !!gallery.download_pin_hash, password_hash: undefined, download_pin_hash: undefined }, photos: await listPhotos(env, gallery.id) });
    }

    const unlockMatch = path.match(/^\/api\/galleries\/([^/]+)\/unlock$/);
    if (unlockMatch && request.method === "POST") {
      const gallery = await galleryBySlug(env, decodeURIComponent(unlockMatch[1]));
      if (!gallery) return json({ error: "gallery_not_found" }, 404);
      if (!gallery.password_hash) return json({ ok: true });
      const body = await request.json();
      if (await sha256(body.password || "") !== gallery.password_hash) return json({ error: "invalid_password" }, 401);
      return json({ ok: true, gallery: { ...gallery, password_hash: undefined, download_pin_hash: undefined }, photos: await listPhotos(env, gallery.id) });
    }

    const uploadMatch = path.match(/^\/api\/upload\/([^/]+)$/);
    if (uploadMatch && request.method === "POST") {
      const token = request.headers.get("x-device-token");
      if (!token) return json({ error: "missing_device_token" }, 401);
      const tokenHash = await sha256(token);
      const device = await env.DB.prepare("SELECT * FROM device_tokens WHERE token_hash=? AND revoked_at IS NULL").bind(tokenHash).first();
      if (!device) return json({ error: "invalid_device_token" }, 401);
      const setId = decodeURIComponent(uploadMatch[1]);
      const set = await env.DB.prepare("SELECT * FROM gallery_sets WHERE id=?").bind(setId).first();
      if (!set || (device.gallery_id && device.gallery_id !== set.gallery_id)) return json({ error: "invalid_destination" }, 403);
      await archiveDue(env);
      const destination = await env.DB.prepare("SELECT status FROM galleries WHERE id=?").bind(set.gallery_id).first();
      if (destination?.status === "archived") return json({error:"Restore this gallery before uploading photos."},409);

      const filename = request.headers.get("x-file-name") || `${Date.now()}.jpg`;
      const mime = request.headers.get("content-type") || "application/octet-stream";
      const bytes = await request.arrayBuffer();
      const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
      const existing = await env.DB.prepare("SELECT id FROM photos WHERE gallery_id=? AND sha256=?").bind(set.gallery_id, digest).first();
      if (existing) return json({ ok: true, duplicate: true, photoId: existing.id });

      const photoId = id("pho");
      const key = `galleries/${set.gallery_id}/originals/${photoId}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mime } });
      await env.DB.prepare(
        "INSERT INTO photos (id,gallery_id,set_id,storage_key,original_filename,mime_type,bytes,sha256) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(photoId, set.gallery_id, set.id, key, filename, mime, bytes.byteLength, digest).run();
      await env.DB.prepare("UPDATE device_tokens SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(device.id).run();
      return json({ ok: true, photoId, key }, 201);
    }

    const variantsMatch = path.match(/^\/api\/admin\/galleries\/([^/]+)\/photos\/([^/]+)\/variants$/);
    if (variantsMatch && request.method === "POST") {
      if (!(await requireAdmin(request, env))) return json({ error: "unauthorized" }, 401);
      const galleryId = decodeURIComponent(variantsMatch[1]);
      const photoId = decodeURIComponent(variantsMatch[2]);
      const photo = await env.DB.prepare("SELECT id,storage_key FROM photos WHERE id=? AND gallery_id=?").bind(photoId, galleryId).first();
      if (!photo) return json({ error: "Photo not found in this gallery." }, 404);
      let form;
      try { form = await request.formData(); } catch { return json({ error: "Invalid image variants." }, 400); }
      const thumbnail = form.get("thumbnail");
      const coverVariant = form.get("cover");
      const valid = file => file instanceof File && /^image\/(webp|jpeg|png)$/.test(file.type) && file.size > 0 && file.size <= 3 * 1024 * 1024;
      if (!valid(thumbnail) || !valid(coverVariant)) return json({ error: "Optimized thumbnail and cover images are required (up to 3 MB each)." }, 400);
      const thumbnailKey = `galleries/${galleryId}/previews/${photoId}-thumb`;
      const coverKey = `galleries/${galleryId}/previews/${photoId}-cover`;
      try {
        await Promise.all([
          env.PHOTOS.put(thumbnailKey, await thumbnail.arrayBuffer(), { httpMetadata: { contentType: thumbnail.type, cacheControl: "public, max-age=31536000, immutable" } }),
          env.PHOTOS.put(coverKey, await coverVariant.arrayBuffer(), { httpMetadata: { contentType: coverVariant.type, cacheControl: "public, max-age=31536000, immutable" } })
        ]);
        await env.DB.prepare("UPDATE photos SET thumbnail_key=?,cover_key=? WHERE id=? AND gallery_id=?").bind(thumbnailKey, coverKey, photoId, galleryId).run();
        return json({ ok: true, photoId, thumbnailBytes: thumbnail.size, coverBytes: coverVariant.size });
      } catch (error) {
        console.error("photo variant save failed", { galleryId, photoId, error: String(error?.stack || error) });
        return json({ error: "Unable to save optimized previews. The original photo is safe; retry optimization." }, 500);
      }
    }

    const photoMatch = path.match(/^\/media\/([^/]+)$/);
    if (photoMatch && request.method === "GET") {
      const photo = await env.DB.prepare("SELECT * FROM photos WHERE id=?").bind(photoMatch[1]).first();
      if (!photo) return new Response("Not found", { status: 404 });
      await archiveDue(env);
      const gallery = await env.DB.prepare("SELECT status,visibility,password_hash FROM galleries WHERE id=?").bind(photo.gallery_id).first();
      if (gallery?.status === "archived" && !(await requireAdmin(request,env))) return new Response("This gallery has been archived.", {status:410,headers:{"cache-control":"no-store"}});
      const variant = url.searchParams.get("size");
      const requestedKey = variant === "thumb" ? photo.thumbnail_key : variant === "cover" ? photo.cover_key : null;
      const object = await env.PHOTOS.get(requestedKey || photo.storage_key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", gallery?.status === "published" && gallery?.visibility === "public" && !gallery?.password_hash ? (requestedKey ? "public, max-age=31536000, immutable" : "public, max-age=86400") : "private, no-store");
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  }
};
