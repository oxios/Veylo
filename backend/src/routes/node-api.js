// API for processing nodes (bearer token, see middleware/node-auth). Mounted before the global JSON parser
// because observation batches, job results and media uploads need their own size limits.

const express = require("express");
const env = require("../config/env");
const Camera = require("../models/camera");
const Track = require("../models/track");
const Video = require("../models/video");
const { requireNode } = require("../middleware/node-auth");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const clips = require("../services/clips");
const { setNow, ingestObservations } = require("../services/live-pipeline");
const { buildNodeConfig } = require("../services/nodes");
const { processTracks } = require("../services/people");
const { removeQuietly, replaceJpeg, storagePath } = require("../services/video-files");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();
const json = (limit) => express.json({ limit });
const jpeg = express.raw({ type: "image/jpeg", limit: "8mb" });
const TRACK_BATCH = 1000;

router.use(requireNode);

router.post("/heartbeat", json("1mb"), validate(schemas.nodeHeartbeat), asyncHandler(async (req, res) => {
  const { version, info, stats, cameras } = req.validated.body;
  const now = new Date();
  const node = req.node;
  node.set({ lastSeenAt: now, version, info, stats });
  if (!node.connectedAt) node.connectedAt = now;
  await node.save();
  if (cameras.length) {
    await Camera.bulkWrite(cameras.map((camera) => ({
      updateOne: {
        filter: { _id: camera.id, nodeId: node._id },
        update: {
          $set: {
            live: {
              state: camera.state,
              error: camera.error,
              errorCode: camera.errorCode,
              fps: camera.fps ?? null,
              width: camera.width ?? null,
              height: camera.height ?? null,
              codec: camera.codec,
              mainCodec: camera.mainCodec,
              lastFrameAt: camera.lastFrameAt ? new Date(camera.lastFrameAt) : null,
              recording: camera.recording,
              archiveFrom: camera.archiveFrom ? new Date(camera.archiveFrom) : null,
              archiveBytes: camera.archiveBytes ?? null,
              updatedAt: now,
            },
          },
        },
      },
    })), { ordered: false });
  }
  res.json({ config: await buildNodeConfig(node), serverTime: now.toISOString() });
}));

async function assignedCamera(req, cameraId, select = "") {
  const camera = await Camera.findOne({ _id: cameraId, nodeId: req.node._id, source: "rtsp" }).select(select);
  if (!camera) throw new ApiError(409, "Camera is not assigned to this node", "CAMERA_NOT_ASSIGNED");
  return camera;
}

router.post("/observations", json("16mb"), validate(schemas.nodeObservations), asyncHandler(async (req, res) => {
  const payload = req.validated.body;
  const camera = await assignedCamera(req, payload.cameraId, "ownerId venueId");
  const { keys, ...result } = await ingestObservations({ camera, payload });
  if (payload.now) setNow(camera._id, payload.now);
  // Guest numbers / staff are assigned before replying, so a node's batches of one camera stay in order.
  await processTracks({ camera, keys });
  res.json(result);
}));

router.post("/cameras/:cameraId/snapshot", jpeg, asyncHandler(async (req, res) => {
  const camera = await assignedCamera(req, req.params.cameraId, "+snapshotKey");
  const key = await replaceJpeg(env.videoStorageDir, req.body, camera.snapshotKey);
  if (!key) throw new ApiError(415, "Snapshot must be a JPEG", "INVALID_SNAPSHOT");
  camera.snapshotKey = key;
  camera.snapshotAt = new Date();
  await camera.save();
  res.status(204).end();
}));

router.post("/cameras/:cameraId/tables", json("256kb"), validate(schemas.nodeTables), asyncHandler(async (req, res) => {
  const camera = await assignedCamera(req, req.params.cameraId);
  camera.tableSuggestions = req.validated.body.candidates;
  camera.tableSuggestionsAt = new Date();
  await camera.save();
  res.status(204).end();
}));

router.post("/clips/:clipId", asyncHandler(async (req, res) => {
  const clip = clips.nodeClip(req.params.clipId, req.node._id);
  await clips.receiveClip(clip, req);
  res.status(204).end();
}));

router.post("/clips/:clipId/fail", json("16kb"), validate(schemas.nodeFailure), asyncHandler(async (req, res) => {
  clips.failClip(clips.nodeClip(req.params.clipId, req.node._id), req.validated.body.error);
  res.status(204).end();
}));

// ---- uploaded video files (queue) ----

router.post("/jobs/claim", asyncHandler(async (req, res) => {
  const now = new Date();
  const video = await Video.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "processing", progress: 0, startedAt: now, heartbeatAt: now, error: "", nodeId: req.node._id } },
    { sort: { createdAt: 1 }, new: true },
  );
  res.json({ job: video ? { id: video.id, cameraId: String(video.cameraId), format: video.format, sizeBytes: video.sizeBytes } : null });
}));

async function claimedJob(req, select = "") {
  const video = await Video.findOne({ _id: req.params.jobId, nodeId: req.node._id, status: "processing" }).select(select);
  // Deleted or requeued while the node was working: the node must drop the job.
  if (!video) throw new ApiError(409, "Job is no longer assigned to this node", "JOB_CANCELLED");
  return video;
}

router.get("/jobs/:jobId/source", asyncHandler(async (req, res) => {
  const video = await claimedJob(req, "+storageKey");
  res.sendFile(storagePath(env.videoStorageDir, video.storageKey));
}));

router.post("/jobs/:jobId/progress", json("16kb"), validate(schemas.nodeJobProgress), asyncHandler(async (req, res) => {
  const updated = await Video.updateOne(
    { _id: req.params.jobId, nodeId: req.node._id, status: "processing" },
    { $set: { progress: Math.min(0.99, req.validated.body.progress), heartbeatAt: new Date() } },
  );
  if (!updated.matchedCount) throw new ApiError(409, "Job is no longer assigned to this node", "JOB_CANCELLED");
  res.status(204).end();
}));

router.post("/jobs/:jobId/snapshot", jpeg, asyncHandler(async (req, res) => {
  const video = await claimedJob(req, "+snapshotKey");
  const key = await replaceJpeg(env.videoStorageDir, req.body, video.snapshotKey);
  if (!key) throw new ApiError(415, "Snapshot must be a JPEG", "INVALID_SNAPSHOT");
  video.snapshotKey = key;
  await video.save();
  res.status(204).end();
}));

router.post("/jobs/:jobId/result", json("96mb"), validate(schemas.nodeJobResult), asyncHandler(async (req, res) => {
  const video = await claimedJob(req, "+storageKey");
  const result = req.validated.body;
  await Track.deleteMany({ videoId: video._id });
  const documents = result.tracks
    .filter((track) => track.points.length >= 3)
    .map((track) => ({ ownerId: video.ownerId, cameraId: video.cameraId, videoId: video._id, trackId: track.trackId, points: track.points }));
  for (let start = 0; start < documents.length; start += TRACK_BATCH) {
    await Track.insertMany(documents.slice(start, start + TRACK_BATCH), { ordered: false });
  }
  const updated = await Video.updateOne({ _id: video._id, status: "processing", nodeId: req.node._id }, {
    $set: {
      status: "done",
      progress: 1,
      error: "",
      durationSec: result.durationSec,
      sampleFps: result.sampleFps,
      frameWidth: result.width,
      frameHeight: result.height,
      trackCount: documents.length,
      model: result.model,
      processedAt: new Date(),
      sourceDeleted: env.videoDeleteAfterProcessing,
    },
  });
  if (!updated.matchedCount) {
    await Track.deleteMany({ videoId: video._id });
    throw new ApiError(409, "Job is no longer assigned to this node", "JOB_CANCELLED");
  }
  if (env.videoDeleteAfterProcessing) await removeQuietly(storagePath(env.videoStorageDir, video.storageKey));
  res.json({ tracks: documents.length });
}));

router.post("/jobs/:jobId/fail", json("16kb"), validate(schemas.nodeFailure), asyncHandler(async (req, res) => {
  const video = await claimedJob(req, "+storageKey +snapshotKey");
  video.set({ status: "failed", error: req.validated.body.error, progress: 0, sourceDeleted: true });
  await video.save();
  await Track.deleteMany({ videoId: video._id });
  await removeQuietly(storagePath(env.videoStorageDir, video.storageKey));
  res.status(204).end();
}));

// Jobs whose node stopped reporting progress go back to the queue.
async function requeueStaleJobs(nowMs = Date.now()) {
  const result = await Video.updateMany(
    { status: "processing", heartbeatAt: { $lt: new Date(nowMs - 2 * 60_000) } },
    { $set: { status: "queued", progress: 0, nodeId: null } },
  );
  return result.modifiedCount;
}

module.exports = router;
module.exports.requeueStaleJobs = requeueStaleJobs;
