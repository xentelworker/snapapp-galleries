const EOCD_SIGNATURE = 0x06054b50;
const MAX_ZIP_COMMENT = 0xffff;
const EOCD_LENGTH = 22;

/**
 * Confirm that a ZIP response has a complete end-of-central-directory record
 * matching the photo count returned by the Worker.
 */
export async function validateZipBlob(blob, expectedEntries) {
  if (!blob || blob.size < EOCD_LENGTH + 4 || !Number.isInteger(expectedEntries) || expectedEntries < 1) return false;

  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) return false;

  const tailStart = Math.max(0, blob.size - EOCD_LENGTH - MAX_ZIP_COMMENT);
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  for (let offset = tail.length - EOCD_LENGTH; offset >= 0; offset--) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + EOCD_LENGTH + commentLength !== tail.length) continue;

    const entriesOnDisk = view.getUint16(offset + 8, true);
    const totalEntries = view.getUint16(offset + 10, true);
    const centralSize = view.getUint32(offset + 12, true);
    const centralOffset = view.getUint32(offset + 16, true);
    const eocdAbsoluteOffset = tailStart + offset;

    if (entriesOnDisk !== expectedEntries || totalEntries !== expectedEntries) continue;
    if (centralOffset + centralSize !== eocdAbsoluteOffset) continue;
    return true;
  }
  return false;
}
