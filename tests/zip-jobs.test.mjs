import test from "node:test";
import assert from "node:assert/strict";
import { isValidZipEmail, saveStreamToR2 } from "../worker/zip-jobs.js";

test("validates recipient email before creating a job", () => {
  assert.equal(isValidZipEmail("client@example.com"), true);
  assert.equal(isValidZipEmail(" client+gallery@example.ca "), true);
  assert.equal(isValidZipEmail("missing-at.example.com"), false);
  assert.equal(isValidZipEmail("x@y"), false);
  assert.equal(isValidZipEmail("x @example.com"), false);
});

test("writes a large ZIP stream as valid R2 multipart parts", async () => {
  const uploaded = [];
  let completed = null;
  let aborted = false;
  const bucket = {
    async createMultipartUpload(key) {
      assert.equal(key, "zip-jobs/test.zip");
      return {
        async uploadPart(partNumber, data) {
          uploaded.push({ partNumber, data: new Uint8Array(data) });
          return { partNumber, etag: "part-" + partNumber };
        },
        async complete(parts) { completed = parts; },
        async abort() { aborted = true; }
      };
    }
  };
  const first = new Uint8Array(3 * 1024 * 1024).fill(1);
  const second = new Uint8Array(7 * 1024 * 1024).fill(2);
  await saveStreamToR2(bucket, "zip-jobs/test.zip", new ReadableStream({
    start(controller) { controller.enqueue(first); controller.enqueue(second); controller.close(); }
  }), "test-job");
  assert.equal(aborted, false);
  assert.equal(uploaded.length, 2);
  assert.deepEqual(uploaded.map(part => part.data.byteLength), [8 * 1024 * 1024, 2 * 1024 * 1024]);
  assert.deepEqual(uploaded.map(part => part.partNumber), [1, 2]);
  assert.equal(completed.length, 2);
  assert.equal(uploaded[0].data[0], 1);
  assert.equal(uploaded[0].data.at(-1), 2);
  assert.equal(uploaded[1].data[0], 2);
});
