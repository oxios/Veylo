const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const config = require("../config/env");
const { ownedFloor } = require("../services/ownership");
const { analyzeCameraSnapshot, detectedImageMime } = require("../services/camera-vision-ai");
const { compactVisionContext } = require("../services/camera-vision-context");
const {
  AVI_TEMP_PREFIX,
  cleanupTemporaryAviDirectory,
  extractVideoFrame,
  isSupportedAviFile,
} = require("../services/video-frame-extractor");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_AVI_BYTES = 200 * 1024 * 1024;

const snapshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SNAPSHOT_BYTES, files: 1, fields: 6, fieldSize: 256 * 1024 },
  fileFilter: (_req, file, callback) => {
    const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    callback(
      supported ? null : new ApiError(415, "Only JPG, PNG, and WebP snapshots are supported", "UNSUPPORTED_SNAPSHOT"),
      supported,
    );
  },
}).fields([
  { name: "frame", maxCount: 1 },
  { name: "snapshot", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

function uploadSnapshot(req, res, next) {
  snapshotUpload(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(413, "Snapshot exceeds the 8 MB upload limit", "SNAPSHOT_TOO_LARGE"));
    }
    return next(error);
  });
}

function uploadedSnapshot(req) {
  return req.files?.frame?.[0] || req.files?.snapshot?.[0] || req.files?.image?.[0] || req.files?.file?.[0] || null;
}

const aviUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      fs.mkdtemp(path.join(os.tmpdir(), AVI_TEMP_PREFIX), (error, directory) => {
        if (!error) req.aviTempDirectory = directory;
        callback(error, directory);
      });
    },
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.avi`),
  }),
  limits: { fileSize: MAX_AVI_BYTES, files: 1, fields: 2, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, callback) => {
    const supported = isSupportedAviFile(file);
    callback(
      supported ? null : new ApiError(415, "Only AVI video files are supported", "UNSUPPORTED_AVI"),
      supported,
    );
  },
}).single("video");

async function cleanupAviUpload(req) {
  const directory = req.aviTempDirectory;
  req.aviTempDirectory = undefined;
  await cleanupTemporaryAviDirectory(directory);
}

function uploadTemporaryAvi(req, res, next) {
  aviUpload(req, res, async (error) => {
    if (!error) return next();
    try {
      await cleanupAviUpload(req);
    } catch (cleanupError) {
      return next(cleanupError);
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(413, "AVI exceeds the 200 MB upload limit", "AVI_TOO_LARGE"));
    }
    if (error instanceof multer.MulterError) {
      return next(new ApiError(422, "Attach one AVI in the video field", "INVALID_AVI_UPLOAD"));
    }
    return next(error);
  });
}

function shortField(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function parseContext(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(422, "Multipart field context must contain JSON", "CAMERA_VISION_CONTEXT_REQUIRED");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ApiError(422, "Multipart field context is not valid JSON", "INVALID_CAMERA_VISION_CONTEXT");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(422, "Camera vision context must be a JSON object", "INVALID_CAMERA_VISION_CONTEXT");
  }
  const floorId = shortField(parsed.floor?.id || parsed.floorId, 24);
  if (!/^[a-f\d]{24}$/i.test(floorId)) {
    throw new ApiError(422, "Camera vision context must include floor.id", "CAMERA_VISION_FLOOR_REQUIRED");
  }
  return { parsed, floorId };
}

function responseLifetimeSignal(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const abortOnResponseClose = () => {
    if (!res.writableEnded) abort();
  };
  if (req.aborted || res.destroyed) abort();
  req.once("aborted", abort);
  res.once("close", abortOnResponseClose);
  return {
    signal: controller.signal,
    dispose() {
      req.removeListener("aborted", abort);
      res.removeListener("close", abortOnResponseClose);
    },
  };
}

router.post("/analyze", uploadSnapshot, asyncHandler(async (req, res) => {
  const file = uploadedSnapshot(req);
  if (!file) {
    throw new ApiError(422, "Attach a JPG, PNG, or WebP snapshot in the frame field", "SNAPSHOT_REQUIRED");
  }
  const mimeType = detectedImageMime(file.buffer);
  if (!mimeType) {
    throw new ApiError(415, "The uploaded snapshot has an invalid image signature", "INVALID_SNAPSHOT_SIGNATURE");
  }

  const { parsed: requestedContext, floorId } = parseContext(req.body?.context);
  const floor = await ownedFloor(floorId, req.user._id);
  const floorContext = {
    floorId: String(floor._id),
    floorName: floor.name,
    floorLevel: floor.level,
    canvas: floor.canvas,
  };

  const compactContext = compactVisionContext(requestedContext);
  const lifetime = responseLifetimeSignal(req, res);
  let result;
  try {
    result = await analyzeCameraSnapshot({
      buffer: file.buffer,
      mimeType,
      fileName: shortField(file.originalname, 180) || "snapshot.jpg",
      context: {
        ...floorContext,
        cameraName: shortField(requestedContext.camera?.name || requestedContext.cameraName, 160),
        zoneName: shortField(requestedContext.zone?.name || requestedContext.zoneName, 160),
        ...compactContext,
      },
    }, { signal: lifetime.signal });
  } catch (error) {
    if (lifetime.signal.aborted) return;
    throw error;
  } finally {
    lifetime.dispose();
  }
  if (lifetime.signal.aborted) return;
  res.json(result);
}));

router.post("/extract-video-frame", uploadTemporaryAvi, asyncHandler(async (req, res) => {
  let result;
  try {
    if (!req.file) {
      throw new ApiError(422, "Attach an AVI in the video field", "AVI_REQUIRED");
    }
    result = await extractVideoFrame({
      url: config.yoloVideoFrameUrl,
      yoloApiUrl: config.yoloApiUrl,
      apiKey: config.yoloApiKey,
      filePath: req.file.path,
      fileName: req.file.originalname,
    });
  } finally {
    await cleanupAviUpload(req);
  }
  res.set("Cache-Control", "no-store").json(result);
}));

module.exports = router;
