// Database side of live analytics: storing node observations, recomputing dirty hours, "now" state.

const env = require("../config/env");
const Camera = require("../models/camera");
const CameraHour = require("../models/camera-hour");
const LiveTrack = require("../models/live-track");
const { HOUR_MS, computeHourStats, constants: { CONTEXT_MS, TRACK_IDLE_SEC } } = require("./live-metrics");

const NOW_STALE_MS = 15_000;
const MARKUP_FIELDS = "ownerId venueId kind entryLine hallZone streetZone doorZone staffZone queueZone tables markupVersion";

const hourOf = (ms) => Math.floor(ms / HOUR_MS) * HOUR_MS;

function hoursBetween(fromMs, toMs, into) {
  for (let hour = hourOf(fromMs); hour <= hourOf(toMs); hour += HOUR_MS) into.add(hour);
  return into;
}

function dirtyOps(camera, hours, now) {
  return [...hours].map((hour) => ({
    updateOne: {
      filter: { cameraId: camera._id, hour: new Date(hour) },
      update: { $set: { dirty: true, dirtyAt: now }, $setOnInsert: { ownerId: camera.ownerId, venueId: camera.venueId } },
      upsert: true,
    },
  }));
}

// Appearance vector and best frame of a track (optional, sent by nodes with ReID). The vector is only needed to
// recognise the person later the same day and expires within hours.
const FEAT_TTL_MS = 6 * HOUR_MS;
function identityFields(track, nowMs) {
  const fields = {};
  if (track.feat?.length) {
    fields.feat = track.feat;
    fields.featN = track.featN ?? 1;
    fields.featExpiresAt = new Date(nowMs + FEAT_TTL_MS);
  }
  if (track.shot) fields.shot = { at: new Date(track.shot.at), box: track.shot.box, score: track.shot.score, ref: track.shot.ref };
  if (track.cls) fields.cls = track.cls;
  if (track.bike) fields.bike = true;
  return fields;
}

/**
 * Applies one observation batch from a node. Idempotent: coverage uses $max, track points carry the count
 * of points already stored (`from`) so a retried batch is not appended twice.
 */
async function ingestObservations({ camera, payload, nowMs = Date.now(), TrackModel = LiveTrack, HourModel = CameraHour }) {
  const now = new Date(nowMs);
  const dirty = new Set();
  const ops = [];

  for (const { minute, seconds } of payload.coverage || []) {
    if (minute % 60_000 !== 0 || minute > nowMs + 120_000) continue;
    const hour = hourOf(minute);
    ops.push({
      updateOne: {
        filter: { cameraId: camera._id, hour: new Date(hour) },
        update: { $max: { [`cov.${(minute - hour) / 60_000}`]: seconds }, $setOnInsert: { ownerId: camera.ownerId, venueId: camera.venueId } },
        upsert: true,
      },
    });
  }

  let applied = 0;
  const touched = [];
  for (const track of payload.tracks || []) {
    const filter = { cameraId: camera._id, key: track.key };
    let stored = false;
    if (track.points.length) {
      const result = await TrackModel.collection.updateOne(
        { ...filter, n: track.from },
        { $push: { points: { $each: track.points } }, $inc: { n: track.points.length }, $set: { endAt: new Date(track.endAt), final: track.final, updatedAt: now, ...identityFields(track, nowMs) } },
      );
      stored = result.matchedCount > 0;
      if (!stored && track.from === 0) {
        try {
          await TrackModel.collection.insertOne({
            ownerId: camera.ownerId,
            cameraId: camera._id,
            key: track.key,
            startAt: new Date(track.startAt),
            endAt: new Date(track.endAt),
            final: track.final,
            n: track.points.length,
            points: track.points,
            updatedAt: now,
            personId: null,
            ...identityFields(track, nowMs),
          });
          stored = true;
        } catch (error) {
          if (error?.code !== 11000) throw error; // duplicate = this batch was already applied
        }
      }
      if (stored) {
        const first = track.startAt + track.points[0][0] * 1000;
        const last = track.startAt + track.points.at(-1)[0] * 1000;
        hoursBetween(first - 60_000, last, dirty);
      }
    } else if (track.final) {
      const result = await TrackModel.collection.updateOne({ ...filter, final: false }, { $set: { final: true, endAt: new Date(track.endAt), updatedAt: now, ...identityFields(track, nowMs) } });
      stored = result.matchedCount > 0;
    }
    if (stored) {
      applied += 1;
      touched.push(track.key);
      // Completing a track can turn it into a passer-by anywhere in its span.
      if (track.final) hoursBetween(track.startAt, track.endAt, dirty);
    }
  }

  ops.push(...dirtyOps(camera, dirty, now));
  if (ops.length) await HourModel.collection.bulkWrite(ops, { ordered: false });
  return { tracks: applied, dirtyHours: dirty.size, keys: touched };
}

// Recomputes up to `limit` dirty hours. A hour re-marked dirty while it was being computed stays dirty.
async function rollupOnce({ nowMs = Date.now(), limit = 25 } = {}) {
  const docs = await CameraHour.find({ dirty: true }).sort({ dirtyAt: 1 }).limit(limit).select("cameraId hour dirtyAt").lean();
  const cameras = new Map();
  for (const doc of docs) {
    const key = String(doc.cameraId);
    if (!cameras.has(key)) cameras.set(key, await Camera.findById(doc.cameraId).select(MARKUP_FIELDS).lean());
    const camera = cameras.get(key);
    if (!camera) {
      await CameraHour.deleteOne({ _id: doc._id });
      continue;
    }
    const hour = new Date(doc.hour).getTime();
    const tracks = await LiveTrack.find({
      cameraId: doc.cameraId,
      startAt: { $lt: new Date(hour + HOUR_MS + CONTEXT_MS) },
      endAt: { $gte: new Date(hour - CONTEXT_MS) },
    }).select("startAt endAt final points cls bike").lean();
    const stats = computeHourStats({ hourStartMs: hour, camera, tracks, nowMs });
    const set = { ...stats, computedAt: new Date(nowMs), markupVersion: camera.markupVersion || 0 };
    const result = await CameraHour.collection.updateOne({ _id: doc._id, dirtyAt: doc.dirtyAt }, { $set: { ...set, dirty: false } });
    if (!result.matchedCount) await CameraHour.collection.updateOne({ _id: doc._id }, { $set: set });
  }
  return docs.length;
}

// Tracks whose node went silent are completed by time so passers-by still get counted.
async function finalizeIdleTracks(nowMs = Date.now()) {
  const idle = await LiveTrack.find({ final: false, endAt: { $lt: new Date(nowMs - TRACK_IDLE_SEC * 1000) } })
    .select("cameraId startAt endAt").limit(500).lean();
  if (!idle.length) return 0;
  await LiveTrack.updateMany({ _id: { $in: idle.map((track) => track._id) } }, { $set: { final: true } });
  const byCamera = new Map();
  for (const track of idle) {
    const key = String(track.cameraId);
    if (!byCamera.has(key)) byCamera.set(key, new Set());
    hoursBetween(new Date(track.startAt).getTime(), new Date(track.endAt).getTime(), byCamera.get(key));
  }
  const now = new Date(nowMs);
  for (const [cameraId, hours] of byCamera) {
    const camera = await Camera.findById(cameraId).select("ownerId venueId").lean();
    if (camera) await CameraHour.collection.bulkWrite(dirtyOps(camera, hours, now), { ordered: false });
  }
  return idle.length;
}

// After a markup change every hour that still has raw tracks is recomputed.
async function markHistoryDirty(cameraId, nowMs = Date.now()) {
  const result = await CameraHour.updateMany(
    { cameraId, hour: { $gte: new Date(hourOf(nowMs - env.liveTrackRetentionDays * 24 * HOUR_MS)) } },
    { $set: { dirty: true, dirtyAt: new Date(nowMs) } },
  );
  return result.modifiedCount;
}

// Hours of the retention window still computed with an older markup. (The current hour is re-marked dirty by live
// data all the time, so "dirty" alone never reaches zero.)
async function recomputeProgress(camera) {
  const window = { cameraId: camera._id, hour: { $gte: new Date(hourOf(Date.now() - env.liveTrackRetentionDays * 24 * HOUR_MS)) } };
  const [pending, total] = await Promise.all([
    CameraHour.countDocuments({ ...window, dirty: true, $or: [{ markupVersion: { $lt: camera.markupVersion || 0 } }, { markupVersion: null }] }),
    CameraHour.countDocuments(window),
  ]);
  return { pendingHours: pending, totalHours: total, markupVersion: camera.markupVersion || 0 };
}

// ---- "now" state (latest positions, in memory; one API instance) ----

const nowByCamera = new Map();

function setNow(cameraId, now) {
  const key = String(cameraId);
  const previous = nowByCamera.get(key);
  nowByCamera.set(key, { ...now, receivedAt: Date.now(), tableSince: previous?.tableSince || new Map() });
}

function getNow(cameraId, nowMs = Date.now()) {
  const state = nowByCamera.get(String(cameraId));
  if (!state || nowMs - state.receivedAt > NOW_STALE_MS) return null;
  return state;
}

function clearNow(cameraId) {
  nowByCamera.delete(String(cameraId));
}

module.exports = {
  ingestObservations,
  rollupOnce,
  finalizeIdleTracks,
  markHistoryDirty,
  recomputeProgress,
  setNow,
  getNow,
  clearNow,
  hourOf,
};
