const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const STORAGE_KEY_PATTERN = /^[a-f0-9-]{36}\.(?:mp4|mov|avi|mkv|jpg)$/;

// Detects the container from magic bytes; the client-supplied name and MIME type are not trusted.
function detectVideoFormat(header) {
  if (!Buffer.isBuffer(header) || header.length < 12) return null;
  if (header.toString("ascii", 4, 8) === "ftyp") {
    return header.toString("ascii", 8, 10) === "qt" ? "mov" : "mp4";
  }
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 11) === "AVI") return "avi";
  if (header.readUInt32BE(0) === 0x1a45dfa3) return "mkv";
  return null;
}

function newStorageKey(extension) {
  return `${crypto.randomUUID()}.${extension}`;
}

// Resolves a server-generated key inside the storage directory; anything else is rejected.
function storagePath(storageDir, key) {
  if (typeof key !== "string" || !STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  const resolved = path.resolve(storageDir, key);
  if (path.dirname(resolved) !== path.resolve(storageDir)) throw new Error("Storage key escapes storage dir");
  return resolved;
}

const isJpeg = (buffer) => Buffer.isBuffer(buffer) && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

// Stores a JPEG under a new server-generated key and removes the previous one.
async function replaceJpeg(storageDir, buffer, previousKey) {
  if (!isJpeg(buffer)) return null;
  await fs.mkdir(storageDir, { recursive: true });
  const key = newStorageKey("jpg");
  await fs.writeFile(storagePath(storageDir, key), buffer);
  if (previousKey) await removeQuietly(storagePath(storageDir, previousKey));
  return key;
}

async function readHeader(filePath, length = 16) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function removeQuietly(filePath) {
  if (!filePath) return;
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

module.exports = { detectVideoFormat, newStorageKey, storagePath, readHeader, removeQuietly, isJpeg, replaceJpeg };
