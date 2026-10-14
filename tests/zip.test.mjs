import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadGalleryZip } from "../worker/zip.js";

const encoder = new TextEncoder();
const hash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))]
  .map(byte => byte.toString(16).padStart(2, "0"))
  .join("");

function makeEnv({ gallery = {}, missingPhoto = false, databaseError = false } = {}) {
  const photo = { id: "photo-1", original_filename: "photo.jpg", storage_key: "galleries/gallery-1/photo.jpg" };
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                if (databaseError) throw new Error("D1 unavailable");
                return {
                  id: "gallery-1",
                  slug: "sample",
                  title: "Sample",
                  status: "published",
                  downloads_enabled: 1,
                  password_hash: null,
                  download_pin_hash: null,
                  ...gallery
                };
              },
              async all() { return { results: [photo] }; }
            };
          }
        };
      }
    },
    PHOTOS: {
      async get() {
        return missingPhoto ? null : {
          async arrayBuffer() { return Uint8Array.from([1, 2, 3, 4]).buffer; }
        };
      }
    }
  };
}

const request = body => new Request("https://gallery.test/api/galleries/sample/download.zip", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

test("builds a valid single-photo ZIP", async () => {
  const response = await downloadGalleryZip(request({}), makeEnv(), "sample");
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").includes("application/zip"));
  assert.equal(response.headers.get("x-snapapp-zip-photos"), "1");

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});

test("requires the configured download PIN", async () => {
  const response = await downloadGalleryZip(
    request({ downloadPin: "0000" }),
    makeEnv({ gallery: { download_pin_hash: await hash("2468") } }),
    "sample"
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_DOWNLOAD_PIN");
});

test("reports a missing R2 photo instead of returning an incomplete ZIP", async () => {
  const response = await downloadGalleryZip(request({}), makeEnv({ missingPhoto: true }), "sample");
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, "PHOTO_MISSING");
  assert.ok(body.reference);
  assert.match(body.error, /re-upload it/);
});

test("returns a traceable JSON error when D1 fails", async () => {
  const response = await downloadGalleryZip(request({}), makeEnv({ databaseError: true }), "sample");
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, "ZIP_BUILD_FAILED");
  assert.ok(body.reference);
});
