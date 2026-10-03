const crypto = require("node:crypto");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const isProduction = process.env.NODE_ENV === "production";
const developmentSecret = "venueflow-development-secret-change-me-now";
const jwtSecret = process.env.JWT_SECRET || developmentSecret;

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}

const port = Number.parseInt(process.env.PORT || "4000", 10);
const cookieMaxAgeMs = Number.parseInt(
  process.env.COOKIE_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000),
  10,
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (!Number.isInteger(cookieMaxAgeMs) || cookieMaxAgeMs < 60_000) {
  throw new Error("COOKIE_MAX_AGE_MS must be an integer of at least 60000");
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function booleanEnv(name, fallback) {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be a boolean`);
}

// RTSP credentials are encrypted with this key. Development falls back to a key derived from JWT_SECRET.
const cameraSecretKey = (() => {
  const raw = (process.env.CAMERA_SECRET_KEY || "").trim();
  if (!raw) {
    if (isProduction) throw new Error("CAMERA_SECRET_KEY is required in production");
    return crypto.createHash("sha256").update(`venueflow-camera:${jwtSecret}`).digest();
  }
  if (raw.length < 32) throw new Error("CAMERA_SECRET_KEY must contain at least 32 characters");
  return crypto.createHash("sha256").update(raw).digest();
})();

const mediamtxSecret = (process.env.MEDIAMTX_SECRET || "").trim();
if (isProduction && mediamtxSecret.length < 24) {
  throw new Error("MEDIAMTX_SECRET must contain at least 24 characters in production");
}

const localNodeSecret = (process.env.LOCAL_NODE_SECRET || "").trim();
if (localNodeSecret && !/^[A-Za-z0-9_-]{24,128}$/.test(localNodeSecret)) {
  throw new Error("LOCAL_NODE_SECRET must be 24-128 URL-safe characters");
}

const corsOrigins = (process.env.CORS_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/venueflow",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieMaxAgeMs,
  cookieSecure: process.env.COOKIE_SECURE === undefined
    ? isProduction
    : process.env.COOKIE_SECURE === "true",
  corsOrigins,
  videoStorageDir: path.resolve(process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "../../storage/videos")),
  videoMaxUploadBytes: positiveIntegerEnv("VIDEO_MAX_UPLOAD_BYTES", 2 * 1024 * 1024 * 1024),
  videoDeleteAfterProcessing: booleanEnv("VIDEO_DELETE_AFTER_PROCESSING", true),
  cameraSecretKey,
  // Processing nodes and the MediaMTX hub that relays live video to browsers.
  nodeStaleAfterMs: positiveIntegerEnv("NODE_STALE_AFTER_MS", 20_000),
  localNodeSecret,
  mediamtxSecret: mediamtxSecret || "venueflow-development-mediamtx-secret",
  hubApiUrl: (process.env.HUB_API_URL || "http://mediamtx:9997").replace(/\/+$/, ""),
  hubWebrtcUrl: (process.env.HUB_WEBRTC_URL || "http://mediamtx:8889").replace(/\/+$/, ""),
  hubRtspUrl: (process.env.HUB_RTSP_URL || "rtsp://mediamtx:8554").replace(/\/+$/, ""),
  liveTrackRetentionDays: positiveIntegerEnv("LIVE_TRACK_RETENTION_DAYS", 7),
});
