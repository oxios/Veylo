const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ApiError = require("../utils/api-error");

const AVI_CONTENT_TYPE = "video/x-msvideo";
const AVI_TEMP_PREFIX = "venueflow-api-avi-";
const ACCEPTED_AVI_CONTENT_TYPES = new Set([
  "",
  AVI_CONTENT_TYPE,
  "video/avi",
  "video/msvideo",
  "video/vnd.avi",
  "application/x-troff-msvideo",
  "application/octet-stream",
]);
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

function cleanMessage(value, fallback = "AVI frame extraction failed") {
  const text = typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  return (text || fallback).slice(0, 240);
}

function isSupportedAviFile(file) {
  const extension = path.extname(file?.originalname || file?.name || "").toLowerCase();
  const mimeType = typeof file?.mimetype === "string" ? file.mimetype.toLowerCase().trim() : "";
  return extension === ".avi" && ACCEPTED_AVI_CONTENT_TYPES.has(mimeType);
}

async function cleanupTemporaryAviDirectory(directory) {
  if (!directory) return;
  const resolvedDirectory = path.resolve(directory);
  const resolvedTempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolvedDirectory) !== resolvedTempRoot || !path.basename(resolvedDirectory).startsWith(AVI_TEMP_PREFIX)) {
    throw new Error("Refusing to clean an unexpected AVI temporary directory");
  }
  await fs.promises.rm(resolvedDirectory, { recursive: true, force: true });
}

function resolveVideoFrameUrl({ url = "", yoloApiUrl = "" } = {}) {
  const configured = url.trim();
  if (configured) return configured;
  if (!yoloApiUrl.trim()) return "";
  try {
    const endpoint = new URL(yoloApiUrl);
    endpoint.pathname = "/video/frame";
    endpoint.search = "";
    endpoint.hash = "";
    return endpoint.toString();
  } catch {
    return "";
  }
}

function validatedHttpUrl(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new ApiError(503, "YOLO_VIDEO_FRAME_URL is invalid", "VIDEO_FRAME_CONFIGURATION_ERROR");
  }
  if (!/^https?:$/.test(endpoint.protocol)) {
    throw new ApiError(503, "YOLO_VIDEO_FRAME_URL must use HTTP or HTTPS", "VIDEO_FRAME_CONFIGURATION_ERROR");
  }
  return endpoint;
}

async function assertAviSignature(filePath) {
  const source = await fs.promises.open(filePath, "r");
  try {
    const signature = Buffer.alloc(12);
    const { bytesRead } = await source.read(signature, 0, signature.length, 0);
    if (bytesRead !== 12 || signature.subarray(0, 4).toString("ascii") !== "RIFF"
      || signature.subarray(8, 12).toString("ascii") !== "AVI ") {
      throw new ApiError(415, "Uploaded file is not a valid AVI", "INVALID_AVI_SIGNATURE");
    }
  } finally {
    await source.close();
  }
}

function finiteHeader(headers, name, { integer = false, minimum = 0 } = {}) {
  const raw = headers.get(name);
  const value = integer ? Number.parseInt(raw || "", 10) : Number.parseFloat(raw || "");
  return Number.isFinite(value) && value >= minimum ? value : null;
}

async function responseBuffer(response, maximumBytes = MAX_FRAME_BYTES) {
  const declared = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ApiError(502, "Video worker returned an oversized frame", "INVALID_VIDEO_FRAME_RESPONSE");
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumBytes) {
      throw new ApiError(502, "Video worker returned an oversized frame", "INVALID_VIDEO_FRAME_RESPONSE");
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ApiError(502, "Video worker returned an oversized frame", "INVALID_VIDEO_FRAME_RESPONSE");
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function upstreamError(response) {
  const payload = await response.json().catch(() => ({}));
  const message = cleanMessage(
    payload?.error?.message || payload?.message || payload?.detail,
    `Video worker returned ${response.status}`,
  );
  if (response.status === 413) return new ApiError(413, message, "AVI_TOO_LARGE");
  if (response.status === 415) return new ApiError(415, message, "INVALID_AVI");
  if (response.status === 422) return new ApiError(422, message, "AVI_UNPROCESSABLE");
  return new ApiError(502, message, "VIDEO_FRAME_UPSTREAM_ERROR");
}

async function extractVideoFrame({
  url,
  yoloApiUrl = "",
  apiKey = "",
  filePath,
  fileName = "test-video.avi",
  fetchImpl = fetch,
  timeoutMs = 120_000,
}) {
  await assertAviSignature(filePath);
  const resolvedUrl = resolveVideoFrameUrl({ url, yoloApiUrl });
  if (!resolvedUrl) {
    throw new ApiError(503, "AVI frame worker is not configured", "VIDEO_FRAME_WORKER_NOT_CONFIGURED");
  }
  const endpoint = validatedHttpUrl(resolvedUrl);

  const safeFileName = `${path.basename(fileName, path.extname(fileName)).slice(0, 120) || "test-video"}.avi`;
  const videoBlob = await fs.openAsBlob(filePath, { type: AVI_CONTENT_TYPE });
  const form = new FormData();
  form.append("video", videoBlob, safeFileName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw await upstreamError(response);
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("image/jpeg")) {
      throw new ApiError(502, "Video worker did not return a JPEG", "INVALID_VIDEO_FRAME_RESPONSE");
    }

    const width = finiteHeader(response.headers, "x-frame-width", { integer: true, minimum: 1 });
    const height = finiteHeader(response.headers, "x-frame-height", { integer: true, minimum: 1 });
    if (width === null || height === null) {
      throw new ApiError(502, "Video worker returned invalid frame dimensions", "INVALID_VIDEO_FRAME_RESPONSE");
    }
    const jpeg = await responseBuffer(response);
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) {
      throw new ApiError(502, "Video worker returned an invalid JPEG", "INVALID_VIDEO_FRAME_RESPONSE");
    }

    const numberOr = (name, options, fallback) => finiteHeader(response.headers, name, options) ?? fallback;
    return {
      status: "completed",
      frameDataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      mimeType: "image/jpeg",
      width,
      height,
      videoWidth: numberOr("x-video-width", { integer: true, minimum: 1 }, width),
      videoHeight: numberOr("x-video-height", { integer: true, minimum: 1 }, height),
      duration: numberOr("x-video-duration", { minimum: 0 }, 0),
      frameTime: numberOr("x-video-frame-time", { minimum: 0 }, 0),
      fps: numberOr("x-video-fps", { minimum: 0 }, 0),
      frameCount: numberOr("x-video-frame-count", { integer: true, minimum: 0 }, 0),
      sourceBytes: numberOr("x-video-source-bytes", { integer: true, minimum: 0 }, 0),
      engine: cleanMessage(response.headers.get("x-video-engine"), "opencv"),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "AVI frame extraction timed out", "VIDEO_FRAME_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  AVI_CONTENT_TYPE,
  AVI_TEMP_PREFIX,
  MAX_FRAME_BYTES,
  assertAviSignature,
  cleanupTemporaryAviDirectory,
  extractVideoFrame,
  isSupportedAviFile,
  resolveVideoFrameUrl,
};
