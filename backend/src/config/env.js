const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const isProduction = process.env.NODE_ENV === "production";
const developmentSecret = "venueflow-development-secret-change-me-now";
const jwtSecret = process.env.JWT_SECRET || developmentSecret;

function boundedIntegerEnv(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

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
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiPlanModel: process.env.OPENAI_PLAN_MODEL || "gpt-5.6",
  openAiCameraVisionTimeoutMs: boundedIntegerEnv("OPENAI_CAMERA_VISION_TIMEOUT_MS", 45_000, 5_000, 60_000),
  yoloApiUrl: process.env.YOLO_API_URL?.trim() || "",
  yoloDetectTimeoutMs: boundedIntegerEnv("YOLO_DETECT_TIMEOUT_MS", 8_000, 1_000, 30_000),
  yoloVideoFrameUrl: process.env.YOLO_VIDEO_FRAME_URL?.trim() || "",
  yoloApiKey: process.env.YOLO_API_KEY?.trim() || "",
});
