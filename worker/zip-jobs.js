import { createGalleryZipForAuthorizedJob } from "./zip.js";
import { archiveDue } from "./lifecycle.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async value => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
};
export const isValidZipEmail = value => typeof value === "string" && value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

async function authorizeGallery(gallery, body) {
  if (gallery.password_hash && await sha256(String(body.password || "")) !== gallery.password_hash)
    return "Unlock this gallery before requesting a ZIP.";
  if (gallery.download_pin_hash && await sha256(String(body.downloadPin || "")) !== gallery.download_pin_hash)
    return "Enter the correct download PIN to request a ZIP.";
  return null;
}

export async function handleZipJobRequest(request, env, path) {
  const createMatch = path.match(/^\/api\/galleries\/([^/]+)\/zip-jobs$/);
  if (createMatch && request.method === "POST") {
    await archiveDue(env);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Enter an email address and try again." }, 400); }
    const email = String(body.email || "").trim();
    if (!isValidZipEmail(email)) return json({ error: "Enter a valid email address for the download link." }, 400);
    const slug = decodeURIComponent(createMatch[1]);
    const gallery = await env.DB.prepare("SELECT id,slug,title,status,downloads_enabled,password_hash,download_pin_hash FROM galleries WHERE slug=?").bind(slug).first();
    if (!gallery || gallery.status !== "published") return json({ error: "This gallery is unavailable." }, 404);
    if (!gallery.downloads_enabled) return json({ error: "Downloads are disabled for this gallery." }, 403);
    const authError = await authorizeGallery(gallery, body);
    if (authError) return json({ error: authError }, 401);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM photos WHERE gallery_id=?").bind(gallery.id).first();
    const photoCount = Number(count?.count || 0);
    if (!photoCount) return json({ error: "There are no photos available in this gallery." }, 404);
    if (photoCount > 65535) return json({ error: "This gallery contains too many photos for one ZIP archive." }, 413);
    if (!env.ZIP_QUEUE) return json({ error: "Background ZIP service is not configured. Please contact the gallery owner." }, 503);

    const jobId = "zip_" + crypto.randomUUID().replaceAll("-", "");
    const accessToken = newToken();
    const archiveKey = "zip-jobs/" + jobId + ".zip";
    const now = Date.now();
    try {
      await env.DB.prepare("INSERT INTO zip_jobs (id,gallery_id,email,token_hash,status,archive_key,photo_count,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(jobId,gallery.id,email,await sha256(accessToken),"queued",archiveKey,photoCount,now).run();
      await env.ZIP_QUEUE.send({ jobId });
    } catch (error) {
      await env.DB.prepare("DELETE FROM zip_jobs WHERE id=?").bind(jobId).run().catch(() => {});
      console.error("ZIP job could not be queued", { jobId, error: String(error?.stack || error) });
      return json({ error: "SnapApp could not start the ZIP job. Please retry in a few minutes." }, 503);
    }
    return json({ jobId, accessToken, status: "queued" }, 202);
  }

  const statusMatch = path.match(/^\/api\/zip-jobs\/([^/]+)$/);
  if (statusMatch && request.method === "GET") {
    const job = await getAuthorizedJob(env, statusMatch[1], new URL(request.url).searchParams.get("token"));
    if (!job) return json({ error: "This ZIP link is invalid or has expired. Request a new ZIP from the gallery." }, 404);
    if (job.status === "ready" && Number(job.expires_at) <= Date.now()) return json({ error: "This ZIP has expired. Request a new one from the gallery." }, 410);
    return json({
      status: job.status, emailStatus: job.email_status,
      error: job.status === "failed" ? ((job.error_message || "ZIP preparation failed. Please retry.") + " ZIP job ID: " + job.id + ".") : undefined,
      downloadUrl: job.status === "ready" ? "/api/zip-download/" + encodeURIComponent(job.id) + "?token=" + encodeURIComponent(new URL(request.url).searchParams.get("token") || "") : undefined
    });
  }

  const downloadMatch = path.match(/^\/api\/zip-download\/([^/]+)$/);
  if (downloadMatch && request.method === "GET") {
    await archiveDue(env);
    const token = new URL(request.url).searchParams.get("token");
    const job = await getAuthorizedJob(env, downloadMatch[1], token);
    if (!job) return json({ error: "This ZIP link is invalid or has expired. Request a new ZIP from the gallery." }, 404);
    if (job.status !== "ready") return json({ error: "Your ZIP is not ready yet. Check your email again shortly." }, 409);
    if (Number(job.expires_at) <= Date.now()) return json({ error: "This ZIP has expired. Request a new one from the gallery." }, 410);
    const gallery = await env.DB.prepare("SELECT slug,status,downloads_enabled FROM galleries WHERE id=?").bind(job.gallery_id).first();
    if (!gallery || gallery.status !== "published" || !gallery.downloads_enabled) return json({ error: "Downloads for this gallery are no longer available." }, 403);
    const object = await env.PHOTOS.get(job.archive_key);
    if (!object) return json({ error: "The prepared ZIP is missing from storage. Please request a fresh one." }, 410);
    const safe = String(gallery.slug || "gallery").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
    return new Response(object.body, { headers: {
      "content-type": "application/zip", "content-length": String(object.size),
      "content-disposition": 'attachment; filename="' + safe + '-photos.zip"',
      "cache-control": "private, no-store", "x-content-type-options": "nosniff"
    }});
  }
  return null;
}

async function getAuthorizedJob(env, jobId, token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const job = await env.DB.prepare("SELECT * FROM zip_jobs WHERE id=?").bind(jobId).first();
  if (!job || (await sha256(token) !== job.token_hash && await sha256(token) !== job.email_token_hash)) return null;
  return job;
}

export async function saveStreamToR2(bucket, key, stream, jobId) {
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: "application/zip" } });
  const partSize = 8 * 1024 * 1024;
  const parts = [];
  let pending = [], pendingBytes = 0, partNumber = 1;
  const push = async data => {
    pending.push(data); pendingBytes += data.byteLength;
    while (pendingBytes >= partSize) {
      const output = new Uint8Array(partSize); let offset = 0;
      while (offset < partSize) {
        const first = pending[0], take = Math.min(first.byteLength, partSize - offset);
        output.set(first.subarray(0, take), offset); offset += take; pendingBytes -= take;
        if (take === first.byteLength) pending.shift(); else pending[0] = first.subarray(take);
      }
      parts.push(await upload.uploadPart(partNumber++, output));
    }
  };
  try {
    const reader = stream.getReader();
    try { while (true) { const {done,value}=await reader.read(); if(done) break; await push(value instanceof Uint8Array ? value : new Uint8Array(value)); } }
    finally { reader.releaseLock(); }
    if (pendingBytes) {
      const output = new Uint8Array(pendingBytes); let offset = 0;
      for (const chunk of pending) { output.set(chunk,offset); offset += chunk.byteLength; }
      parts.push(await upload.uploadPart(partNumber++, output));
    }
    await upload.complete(parts);
  } catch (error) {
    await upload.abort().catch(() => {});
    console.error("ZIP multipart upload failed", { jobId, error: String(error?.stack || error) });
    throw error;
  }
}

async function sendReadyEmail(env, job, gallery, token) {
  if (!env.ZIP_EMAIL_API_KEY || !env.ZIP_EMAIL_FROM) {
    await env.DB.prepare("UPDATE zip_jobs SET email_status='not_configured' WHERE id=?").bind(job.id).run();
    return;
  }
  const safeTitle = String(gallery.title || "your gallery").replace(/[&<>"]/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" })[char]);
  const url = "https://gallery.snapapp.ca/api/zip-download/" + encodeURIComponent(job.id) + "?token=" + encodeURIComponent(token);
  const text = "Your ZIP for " + gallery.title + " is ready. Download it here: " + url + "\n\nThis private link expires in 48 hours.";
  const html = "<p>Your ZIP for <strong>" + safeTitle + "</strong> is ready.</p><p><a href=\"" + url + "\">Download your gallery ZIP</a></p><p>This private link expires in 48 hours.</p>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method:"POST", headers:{ "authorization":"Bearer " + env.ZIP_EMAIL_API_KEY, "content-type":"application/json" },
      body:JSON.stringify({from:env.ZIP_EMAIL_FROM,to:[job.email],subject:"Your SnapApp gallery ZIP is ready",text,html})
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0,300);
      throw new Error("Email provider returned HTTP " + response.status + ": " + detail);
    }
    await env.DB.prepare("UPDATE zip_jobs SET email_status='sent' WHERE id=?").bind(job.id).run();
  } catch (error) {
    console.error("ZIP ready email failed", { jobId: job.id, error: String(error?.stack || error) });
    await env.DB.prepare("UPDATE zip_jobs SET email_status='failed' WHERE id=?").bind(job.id).run();
  }
}

export async function processZipQueue(batch, env) {
  for (const message of batch.messages) {
    const { jobId } = message.body || {};
    try {
      const job = await env.DB.prepare("SELECT j.*,g.slug,g.title FROM zip_jobs j JOIN galleries g ON g.id=j.gallery_id WHERE j.id=?").bind(jobId).first();
      if (!job || job.status === "ready" || job.status === "failed") { message.ack(); continue; }
      await env.DB.prepare("UPDATE zip_jobs SET status='processing',error_code=NULL,error_message=NULL WHERE id=?").bind(jobId).run();
      const response = await createGalleryZipForAuthorizedJob(env, job.slug, jobId);
      await saveStreamToR2(env.PHOTOS, job.archive_key, response.body, jobId);
      const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
      await env.DB.prepare("UPDATE zip_jobs SET status='ready',expires_at=?,email_status='pending' WHERE id=?").bind(expiresAt,jobId).run();
      const emailToken = newToken();
      await env.DB.prepare("UPDATE zip_jobs SET email_token_hash=? WHERE id=?").bind(await sha256(emailToken),jobId).run();
      await sendReadyEmail(env,job,job,emailToken);
      message.ack();
    } catch (error) {
      const attempts = Number(message.attempts || 1);
      console.error("ZIP background job failed", { jobId, attempts, error: String(error?.stack || error) });
      if (attempts >= 3) {
        await env.DB.prepare("UPDATE zip_jobs SET status='failed',error_code=?,error_message='We could not prepare this ZIP. Please request it again or contact the gallery owner.' WHERE id=?").bind(error?.zipFailureCode || "ZIP_PREPARATION_FAILED",jobId).run().catch(() => {});
        message.ack();
      } else message.retry({ delaySeconds: Math.min(60 * attempts, 300) });
    }
  }
}

export async function cleanupZipJobs(env) {
  const now = Date.now();
  const expired = await env.DB.prepare("SELECT id,archive_key FROM zip_jobs WHERE (expires_at IS NOT NULL AND expires_at<=?) OR (status='failed' AND created_at<=?) LIMIT 100").bind(now, now - 7 * 24 * 60 * 60 * 1000).all();
  for (const job of expired.results || []) {
    await env.PHOTOS.delete(job.archive_key).catch(() => {});
    await env.DB.prepare("DELETE FROM zip_jobs WHERE id=?").bind(job.id).run();
  }
}
