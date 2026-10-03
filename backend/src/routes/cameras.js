const fs = require("node:fs/promises");
const express = require("express");
const multer = require("multer");
const env = require("../config/env");
const Camera = require("../models/camera");
const CameraHour = require("../models/camera-hour");
const Node = require("../models/node");
const Track = require("../models/track");
const Venue = require("../models/venue");
const Video = require("../models/video");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const clips = require("../services/clips");
const channel = require("../services/node-channel");
const hub = require("../services/hub");
const { deleteCameraData, markupChanged, sealRtsp, storedUrls, MARKUP_KEYS } = require("../services/cameras");
const { aggregateStats, nowState, periodRange, startOfLocalDay, HOUR_MS } = require("../services/live-metrics");
const { getNow, markHistoryDirty, recomputeProgress } = require("../services/live-pipeline");
const { assignCamera, cameraStatus, camerasWithStatus, hubPath, isNodeOnline, notifyConfig, pickNode } = require("../services/nodes");
const { ownedCamera } = require("../services/ownership");
const { hiddenInside, labelFrame } = require("../services/people");
const { detectVideoFormat, newStorageKey, readHeader, removeQuietly, storagePath } = require("../services/video-files");
const { computeCameraMetrics } = require("../services/video-metrics");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(env.videoStorageDir, { recursive: true }).then(() => callback(null, env.videoStorageDir), callback);
    },
    filename: (_req, _file, callback) => callback(null, newStorageKey("part")),
  }),
  limits: { fileSize: env.videoMaxUploadBytes, files: 1, fields: 5 },
});

// Ownership is checked before multer so another owner's camera never receives bytes on disk.
const loadCamera = asyncHandler(async (req, _res, next) => {
  req.camera = await ownedCamera(req.params.cameraId, req.user._id);
  next();
});

async function liveCamera(req, select) {
  const camera = await ownedCamera(req.params.cameraId, req.user._id, select);
  if (camera.source !== "rtsp") throw new ApiError(409, "This camera has no live stream", "NOT_LIVE_CAMERA");
  return camera;
}

async function connectedNode(camera) {
  if (!camera.nodeId) throw new ApiError(409, "Camera is waiting for a processing node", "CAMERA_NOT_ASSIGNED");
  const node = await Node.findById(camera.nodeId).lean();
  if (!node || !isNodeOnline(node) || !channel.isConnected(node._id)) {
    throw new ApiError(503, "Processing node of this camera is offline", "NODE_OFFLINE");
  }
  return node;
}

async function singleCameraView(camera) {
  const [view] = await camerasWithStatus([camera]);
  return view;
}

// ---- probe ----

function probeView(data, node) {
  return {
    node: node.name,
    main: data?.main ?? null,
    sub: data?.sub ?? null,
    frame: typeof data?.frame === "string" && data.frame.length < 4_000_000 ? `data:image/jpeg;base64,${data.frame}` : null,
  };
}

async function runProbe(node, urls) {
  try {
    return await channel.request(node._id, { type: "probe", main: urls.main, sub: urls.sub }, 35_000);
  } catch (error) {
    throw new ApiError(error.code === "NODE_TIMEOUT" ? 504 : 503, error.code === "NODE_TIMEOUT" ? "The camera did not answer in time" : "Processing node is not connected", error.code || "NODE_ERROR");
  }
}

router.post("/probe", express.json({ limit: "16kb" }), validate(schemas.cameraProbe), asyncHandler(async (req, res) => {
  const node = await pickNode();
  if (!node || !channel.isConnected(node._id)) throw new ApiError(503, "No processing node is online", "NO_NODE");
  const { main, sub } = sealRtsp(req.validated.body.rtsp);
  res.json({ probe: probeView(await runProbe(node, { main, sub }), node) });
}));

router.post("/:cameraId/probe", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req, "+rtspMainSealed +rtspSubSealed");
  const node = camera.nodeId ? await connectedNode(camera) : await pickNode();
  if (!node) throw new ApiError(503, "No processing node is online", "NO_NODE");
  res.json({ probe: probeView(await runProbe(node, storedUrls(camera)), node) });
}));

// ---- settings & markup ----

router.patch("/:cameraId", validate(schemas.cameraUpdate), asyncHandler(async (req, res) => {
  const camera = await ownedCamera(req.params.cameraId, req.user._id, "+rtspMainSealed +rtspSubSealed");
  const update = { ...req.validated.body };
  if (update.rtsp) {
    if (camera.source !== "rtsp") throw new ApiError(409, "Upload cameras have no RTSP address", "NOT_LIVE_CAMERA");
    camera.set(sealRtsp(update.rtsp, camera).fields);
    delete update.rtsp;
  }
  const changedMarkup = markupChanged(update) && (update.kind === undefined || update.kind !== camera.kind || MARKUP_KEYS.some((key) => key in update));
  camera.set(update);
  if (changedMarkup) {
    camera.markupVersion = (camera.markupVersion || 0) + 1;
    camera.markupChangedAt = new Date();
  }
  await camera.save();
  if (changedMarkup && camera.source === "rtsp") await markHistoryDirty(camera._id);
  if (camera.source === "rtsp") notifyConfig(camera.nodeId);
  res.json({ camera: await singleCameraView(camera) });
}));

router.delete("/:cameraId", asyncHandler(async (req, res) => {
  const camera = await ownedCamera(req.params.cameraId, req.user._id);
  await deleteCameraData(camera);
  await camera.deleteOne();
  notifyConfig(camera.nodeId);
  res.status(204).end();
}));

router.post("/:cameraId/tables/detect", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const node = await connectedNode(camera);
  channel.send(node._id, { type: "tables.detect", cameraId: String(camera._id) });
  res.status(202).json({ requested: true });
}));

// One click on the frame → the node outlines the object under it with SAM 2 (furniture for table zones).
router.post("/:cameraId/segment", validate(schemas.segmentRequest), asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const node = await connectedNode(camera);
  let data;
  try {
    data = await channel.request(node._id, { type: "segment", cameraId: String(camera._id), x: req.validated.body.x, y: req.validated.body.y }, 90_000);
  } catch (error) {
    throw new ApiError(502, error.message || "Node could not outline the object", "SEGMENT_FAILED");
  }
  const points = Array.isArray(data?.points) ? data.points
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) : [];
  if (points.length < 3) throw new ApiError(422, "Nothing furniture-sized at this point", "NOTHING_FOUND");
  res.json({ outline: { points: points.slice(0, 32), score: Number(data.score) || null } });
}));

router.get("/:cameraId/recompute", asyncHandler(async (req, res) => {
  const camera = await ownedCamera(req.params.cameraId, req.user._id);
  res.json({ recompute: await recomputeProgress(camera) });
}));

// ---- uploaded videos ----

router.post("/:cameraId/videos", loadCamera, upload.single("file"), asyncHandler(async (req, res) => {
  const tempPath = req.file?.path;
  let storedPath = "";
  try {
    if (req.camera.source !== "upload") throw new ApiError(409, "Live cameras record on their own; upload videos to an upload camera", "LIVE_CAMERA");
    if (!req.file) throw new ApiError(422, "Video file is required", "VIDEO_REQUIRED");
    const fields = schemas.videoUpload.safeParse(req.body);
    if (!fields.success) {
      throw new ApiError(422, "Validation failed", "VALIDATION_ERROR", fields.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })));
    }
    const format = detectVideoFormat(await readHeader(tempPath));
    if (!format) throw new ApiError(415, "Unsupported video: upload MP4, MOV, AVI or MKV", "UNSUPPORTED_VIDEO");

    const storageKey = newStorageKey(format);
    storedPath = storagePath(env.videoStorageDir, storageKey);
    await fs.rename(tempPath, storedPath);
    const video = await Video.create({
      ownerId: req.user._id,
      venueId: req.camera.venueId,
      cameraId: req.camera._id,
      originalName: String(req.file.originalname || "video").slice(0, 255),
      format,
      sizeBytes: req.file.size,
      recordedAt: fields.data.recordedAt,
      storageKey,
    });
    res.status(201).json({ video: video.toJSON() });
  } catch (error) {
    await removeQuietly(tempPath);
    await removeQuietly(storedPath);
    throw error;
  }
}));

router.get("/:cameraId/snapshot", asyncHandler(async (req, res) => {
  const camera = await ownedCamera(req.params.cameraId, req.user._id, "+snapshotKey");
  let key = camera.snapshotKey;
  if (!key) {
    const video = await Video.findOne({ cameraId: camera._id, ownerId: req.user._id, status: "done", snapshotKey: { $ne: "" } })
      .sort({ processedAt: -1 })
      .select("+snapshotKey");
    key = video?.snapshotKey;
  }
  if (!key) throw new ApiError(404, "No frame from this camera yet", "SNAPSHOT_NOT_FOUND");
  res.set("Cache-Control", "private, no-cache");
  res.type("image/jpeg").sendFile(storagePath(env.videoStorageDir, key));
}));

router.get("/:cameraId/metrics", asyncHandler(async (req, res) => {
  const camera = await ownedCamera(req.params.cameraId, req.user._id);
  const videos = await Video.find({ cameraId: camera._id, ownerId: req.user._id, status: "done" }).sort({ recordedAt: 1 });
  const tracks = await Track.find({ videoId: { $in: videos.map((video) => video._id) }, ownerId: req.user._id })
    .select("videoId trackId points")
    .lean();
  const tracksByVideo = new Map();
  for (const track of tracks) {
    const key = String(track.videoId);
    if (!tracksByVideo.has(key)) tracksByVideo.set(key, []);
    tracksByVideo.get(key).push(track);
  }
  const metrics = computeCameraMetrics({
    camera,
    videos: videos.map((video) => ({ ...video.toJSON(), id: String(video._id) })),
    tracksByVideo,
  });
  res.json({ metrics });
}));

// ---- live statistics ----

async function venueTimezone(camera) {
  const venue = await Venue.findById(camera.venueId).select("timezone").lean();
  return venue?.timezone || "Europe/Kyiv";
}

router.get("/:cameraId/stats", validate(schemas.statsQuery, "query"), asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const timeZone = await venueTimezone(camera);
  const nowMs = Date.now();
  const { from, to, bucket } = periodRange(req.validated.query.period, nowMs, timeZone);
  const hours = await CameraHour.find({ cameraId: camera._id, hour: { $gte: new Date(from), $lt: new Date(to) } }).lean();
  const stats = aggregateStats({ hours, camera: camera.toObject(), periodKey: req.validated.query.period, from, to, bucket, timeZone, nowMs });
  res.json({ stats });
}));

const todayCache = new Map();
async function todayTotals(camera, timeZone, nowMs = Date.now()) {
  const key = String(camera._id);
  const cached = todayCache.get(key);
  if (cached && nowMs - cached.at < 5000) return cached.value;
  const from = startOfLocalDay(nowMs, timeZone);
  const hours = await CameraHour.find({ cameraId: camera._id, hour: { $gte: new Date(Math.floor(from / HOUR_MS) * HOUR_MS) } })
    .select("hour entries exits passersby").lean();
  const sum = (field) => hours.reduce((total, doc) => total + (doc[field] || []).reduce((acc, value, minute) => (
    new Date(doc.hour).getTime() + minute * 60_000 >= from ? acc + value : acc), 0), 0);
  const value = { entries: sum("entries"), exits: sum("exits"), passersby: sum("passersby") };
  todayCache.set(key, { at: nowMs, value });
  return value;
}

async function nowPayload(camera, node, timeZone) {
  const status = cameraStatus(camera, node);
  const state = getNow(camera._id);
  const now = state ? nowState({ camera, people: state.people, tableSince: state.tableSince }) : null;
  // Entered guests out of the camera's sight are still inside (see services/people.hiddenInside).
  if (now && now.inHall !== null && camera.entryLine) now.hidden = await hiddenInside(camera._id);
  return { status, at: state ? new Date(state.at).toISOString() : null, now, today: await todayTotals(camera, timeZone) };
}

router.get("/:cameraId/now", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const node = camera.nodeId ? await Node.findById(camera.nodeId).lean() : null;
  res.json({ live: await nowPayload(camera, node, await venueTimezone(camera)) });
}));

// Server-sent events: "frame" = detections from the node (only while watched), "state" = counters every 2 s.
router.get("/:cameraId/live/stream", asyncHandler(async (req, res) => {
  let camera = await liveCamera(req);
  const node = await connectedNode(camera);
  const timeZone = await venueTimezone(camera);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const release = channel.addViewer(camera._id, node._id);
  // Boxes get "Гість №N" / staff labels from the people of the day.
  const unsubscribe = channel.subscribeFrames(camera._id, ({ type: _type, cameraId: _cameraId, ...frame }) => {
    labelFrame(camera._id, frame).then(
      (labels) => write("frame", labels ? { ...frame, labels } : frame),
      () => write("frame", frame),
    );
  });
  let ticks = 0;
  const sendState = async () => {
    try {
      if (ticks++ % 5 === 0) camera = (await Camera.findById(camera._id)) || camera;
      const currentNode = camera.nodeId ? await Node.findById(camera.nodeId).lean() : null;
      write("state", await nowPayload(camera, currentNode, timeZone));
    } catch {
      // the next tick retries
    }
  };
  void sendState();
  const stateTimer = setInterval(sendState, 2000);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(stateTimer);
    clearInterval(keepAlive);
    unsubscribe();
    release();
  });
}));

// WHEP (WebRTC-HTTP egress) proxied to the MediaMTX hub.
router.post("/:cameraId/live/whep", express.text({ type: "application/sdp", limit: "64kb" }), asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const node = await connectedNode(camera);
  if (typeof req.body !== "string" || !req.body.startsWith("v=0")) throw new ApiError(400, "SDP offer is required", "INVALID_SDP");
  const path = hubPath(camera._id);
  channel.lease(camera._id, node._id, 30_000);
  if (!(await hub.waitForPath(path, 15_000))) {
    throw new ApiError(504, "The camera has not started streaming yet", "LIVE_NOT_READY");
  }
  const { answer, session, etag } = await hub.whepOffer(path, req.body);
  res.status(201);
  res.set("Content-Type", "application/sdp");
  if (session) res.set("Location", `/api/cameras/${camera.id}/live/whep/${session}`);
  if (etag) res.set("ETag", etag);
  res.send(answer);
}));

const SESSION_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

router.patch("/:cameraId/live/whep/:session", express.text({ type: "application/trickle-ice-sdpfrag", limit: "64kb" }), asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  if (!SESSION_PATTERN.test(req.params.session)) throw new ApiError(404, "Session not found", "SESSION_NOT_FOUND");
  const result = await hub.whepForward(hubPath(camera._id), req.params.session, "PATCH", {
    body: req.body, contentType: "application/trickle-ice-sdpfrag", ifMatch: req.get("if-match"),
  });
  res.status(result.status).end();
}));

router.delete("/:cameraId/live/whep/:session", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  if (!SESSION_PATTERN.test(req.params.session)) throw new ApiError(404, "Session not found", "SESSION_NOT_FOUND");
  await hub.whepForward(hubPath(camera._id), req.params.session, "DELETE");
  res.status(204).end();
}));

// ---- 24 h archive ----

router.get("/:cameraId/archive", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const nowMs = Date.now();
  const from = nowMs - 24 * HOUR_MS;
  const hours = await CameraHour.find({ cameraId: camera._id, hour: { $gte: new Date(Math.floor(from / HOUR_MS) * HOUR_MS) } })
    .select("hour cov occSum entries passersby").lean();
  const activity = [];
  for (const doc of hours) {
    const hourMs = new Date(doc.hour).getTime();
    for (let minute = 0; minute < 60; minute += 1) {
      const t = hourMs + minute * 60_000;
      const covered = doc.cov?.[minute] ?? doc.cov?.[String(minute)] ?? 0;
      if (t < from || !covered) continue;
      activity.push([t, Math.round(((doc.occSum?.[minute] ?? 0) / covered) * 10) / 10, doc.entries?.[minute] ?? 0, doc.passersby?.[minute] ?? 0]);
    }
  }
  activity.sort((a, b) => a[0] - b[0]);
  let segments = [];
  let error = "";
  try {
    const node = await connectedNode(camera);
    const data = await channel.request(node._id, { type: "archive.list", cameraId: String(camera._id), from, to: nowMs }, 15_000);
    segments = Array.isArray(data?.segments) ? data.segments
      .filter((segment) => Number.isFinite(Date.parse(segment.start)) && Number.isFinite(segment.duration))
      .map((segment) => ({ start: new Date(segment.start).toISOString(), duration: Math.round(segment.duration * 10) / 10 })) : [];
  } catch (requestError) {
    error = requestError instanceof ApiError ? requestError.message : "Processing node did not return the recording list";
  }
  res.json({ archive: { from: new Date(from).toISOString(), to: new Date(nowMs).toISOString(), segments, activity, error } });
}));

router.post("/:cameraId/archive/clips", validate(schemas.clipCreate), asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  await connectedNode(camera);
  const start = Date.parse(req.validated.body.start);
  if (start < Date.now() - 25 * HOUR_MS || start > Date.now()) throw new ApiError(422, "The archive keeps the last 24 hours", "OUT_OF_ARCHIVE");
  const clip = clips.createClip({ camera, start, durationSec: req.validated.body.durationSec, codec: req.validated.body.codec });
  res.status(202).json({ clip: clips.clipView(clip) });
}));

router.get("/:cameraId/archive/clips/:clipId", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  res.json({ clip: clips.clipView(clips.ownedClip(req.params.clipId, camera._id, req.user._id)) });
}));

router.get("/:cameraId/archive/clips/:clipId/file", asyncHandler(async (req, res) => {
  const camera = await liveCamera(req);
  const clip = clips.ownedClip(req.params.clipId, camera._id, req.user._id);
  if (clip.status !== "ready") throw new ApiError(409, "Clip is not ready", "CLIP_NOT_READY");
  res.set("Cache-Control", "private, max-age=600");
  res.type("video/mp4").sendFile(storagePath(env.videoStorageDir, clip.storageKey));
}));

module.exports = router;
module.exports.createCamera = async function createCamera({ venue, ownerId, body }) {
  const base = { name: body.name, kind: body.kind, source: body.source, venueId: venue._id, ownerId };
  if (body.source === "rtsp") {
    Object.assign(base, sealRtsp(body.rtsp).fields);
    // Hybrid/outdoor cameras must see small, distant people (the street behind the door glass): analyse the main stream.
    base.analysisStream = body.kind === "indoor" ? "sub" : "main";
  }
  const camera = await Camera.create(base);
  if (camera.source === "rtsp") await assignCamera(camera);
  return singleCameraView(await Camera.findById(camera._id));
};
