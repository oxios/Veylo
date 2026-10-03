// Archive clips: the browser asks for a time range, the node cuts it from its 24 h recording and uploads an MP4
// here; the browser then plays the cached file (with HTTP range support). Clips live for CLIP_TTL_MS.

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const env = require("../config/env");
const ApiError = require("../utils/api-error");
const channel = require("./node-channel");
const { newStorageKey, removeQuietly, storagePath } = require("./video-files");

const CLIP_TTL_MS = 30 * 60_000;
const CLIP_MAX_BYTES = 2 * 1024 ** 3;
const clips = new Map();

function clipView(clip) {
  return {
    id: clip.id,
    cameraId: clip.cameraId,
    start: new Date(clip.start).toISOString(),
    durationSec: clip.durationSec,
    codec: clip.codec,
    status: clip.status,
    error: clip.error,
    sizeBytes: clip.sizeBytes,
  };
}

function createClip({ camera, start, durationSec, codec }) {
  if (!camera.nodeId) throw new ApiError(409, "Camera has no processing node", "CAMERA_NOT_ASSIGNED");
  const clip = {
    id: crypto.randomUUID(),
    cameraId: String(camera._id),
    ownerId: String(camera.ownerId),
    nodeId: String(camera.nodeId),
    start,
    durationSec,
    codec,
    status: "pending",
    error: "",
    storageKey: "",
    sizeBytes: null,
    createdAt: Date.now(),
  };
  const sent = channel.send(clip.nodeId, {
    type: "archive.clip",
    clipId: clip.id,
    cameraId: clip.cameraId,
    start,
    durationSec,
    transcode: codec === "h264",
  });
  if (!sent) throw new ApiError(503, "Processing node of this camera is offline", "NODE_OFFLINE");
  clips.set(clip.id, clip);
  return clip;
}

function ownedClip(id, cameraId, ownerId) {
  const clip = clips.get(String(id));
  if (!clip || clip.cameraId !== String(cameraId) || clip.ownerId !== String(ownerId)) throw new ApiError(404, "Clip not found", "CLIP_NOT_FOUND");
  return clip;
}

function nodeClip(id, nodeId) {
  const clip = clips.get(String(id));
  if (!clip || clip.nodeId !== String(nodeId) || clip.status !== "pending") throw new ApiError(404, "Clip not found", "CLIP_NOT_FOUND");
  return clip;
}

async function receiveClip(clip, stream) {
  const key = newStorageKey("mp4");
  const target = storagePath(env.videoStorageDir, key);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > CLIP_MAX_BYTES ? new ApiError(413, "Clip is too large", "CLIP_TOO_LARGE") : null, chunk);
    },
  });
  try {
    await fsp.mkdir(env.videoStorageDir, { recursive: true });
    await pipeline(stream, limiter, fs.createWriteStream(target));
    if (bytes < 1024) throw new ApiError(422, "Clip is empty", "CLIP_EMPTY");
  } catch (error) {
    await removeQuietly(target);
    throw error;
  }
  if (clips.get(clip.id) !== clip) {
    await removeQuietly(target);
    return;
  }
  clip.storageKey = key;
  clip.sizeBytes = bytes;
  clip.status = "ready";
}

function failClip(clip, message) {
  clip.status = "failed";
  clip.error = String(message).slice(0, 300);
}

async function cleanupClips(nowMs = Date.now()) {
  for (const [id, clip] of clips) {
    const stale = nowMs - clip.createdAt > CLIP_TTL_MS;
    const stuck = clip.status === "pending" && nowMs - clip.createdAt > 5 * 60_000;
    if (stuck && !stale) failClip(clip, "Вузол не віддав фрагмент за 5 хвилин");
    if (!stale) continue;
    clips.delete(id);
    if (clip.storageKey) await removeQuietly(storagePath(env.videoStorageDir, clip.storageKey));
  }
}

module.exports = { createClip, ownedClip, nodeClip, receiveClip, failClip, cleanupClips, clipView };
