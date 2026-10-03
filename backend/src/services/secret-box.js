const crypto = require("node:crypto");
const env = require("../config/env");

// AES-256-GCM envelope "v1.<iv>.<tag>.<ciphertext>" (base64url). Used for RTSP URLs with credentials.
const VERSION = "v1";

function seal(plaintext, key = env.cameraSecretKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => (Buffer.isBuffer(part) ? part.toString("base64url") : part)).join(".");
}

function open(envelope, key = env.cameraSecretKey) {
  const [version, iv, tag, ciphertext] = String(envelope || "").split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Malformed secret envelope");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

module.exports = { seal, open };
