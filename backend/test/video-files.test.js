const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const schemas = require("../src/validation/schemas");
const { workerView } = require("../src/routes/processing");
const { deleteVideos } = require("../src/services/video-cleanup");
const { detectVideoFormat, newStorageKey, storagePath } = require("../src/services/video-files");

const header = (text, offset = 0) => {
  const buffer = Buffer.alloc(16);
  buffer.write(text, offset, "latin1");
  return buffer;
};

test("video container is detected from magic bytes only", () => {
  assert.equal(detectVideoFormat(header("ftypisom", 4)), "mp4");
  assert.equal(detectVideoFormat(header("ftypqt  ", 4)), "mov");
  assert.equal(detectVideoFormat(header("RIFF\0\0\0\0AVI ")), "avi");
  assert.equal(detectVideoFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), "mkv");
  assert.equal(detectVideoFormat(header("%PDF-1.7")), null);
  assert.equal(detectVideoFormat(Buffer.from("tiny")), null);
});

test("storage paths accept only server-generated keys inside the storage dir", () => {
  const dir = path.resolve("storage-test");
  const key = newStorageKey("mp4");
  assert.equal(storagePath(dir, key), path.join(dir, key));
  for (const bad of ["../etc/passwd", "a.mp4", `${key}/../x.mp4`, "", null]) {
    assert.throws(() => storagePath(dir, bad));
  }
});

test("deleting videos removes records, tracks and both stored files", async () => {
  const video = { _id: "v1", storageKey: newStorageKey("mp4"), snapshotKey: newStorageKey("jpg") };
  const calls = [];
  const VideoModel = {
    find: (filter) => ({ select: async () => { calls.push(["find", filter]); return [video]; } }),
    deleteMany: async (filter) => { calls.push(["videos", filter]); },
  };
  const TrackModel = { deleteMany: async (filter) => { calls.push(["tracks", filter]); } };
  const removed = [];
  const count = await deleteVideos({ cameraId: "c1", ownerId: "u1" }, {
    VideoModel, TrackModel, storageDir: "/data/videos", remove: async (file) => { removed.push(path.basename(file)); },
  });
  assert.equal(count, 1);
  assert.deepEqual(calls[0], ["find", { cameraId: "c1", ownerId: "u1" }]);
  assert.deepEqual(calls[2], ["tracks", { videoId: { $in: ["v1"] } }]);
  assert.deepEqual(removed, [video.storageKey, video.snapshotKey]);
});

test("processing is online while at least one enabled node sends heartbeats", () => {
  const now = Date.parse("2026-09-28T10:00:00Z");
  assert.equal(workerView([], now).online, false);
  const fresh = { enabled: true, lastSeenAt: "2026-09-28T09:59:50Z", info: { model: "yolo11s.pt" } };
  const stale = { enabled: true, lastSeenAt: "2026-09-28T09:58:00Z" };
  assert.deepEqual(workerView([fresh, stale], now), { online: true, lastSeenAt: "2026-09-28T09:59:50.000Z", model: "yolo11s.pt", nodes: 1 });
  assert.equal(workerView([stale], now).online, false);
  assert.equal(workerView([{ ...fresh, enabled: false }], now).online, false, "a disabled node does not process anything");
});

test("markup and upload schemas reject degenerate input", () => {
  const point = { x: 0.5, y: 0.5 };
  assert.equal(schemas.cameraUpdate.safeParse({ entryLine: { a: point, b: point, inside: "positive" } }).success, false);
  assert.equal(schemas.cameraUpdate.safeParse({ hallZone: { points: [point, point] } }).success, false);
  assert.equal(schemas.cameraUpdate.safeParse({ hallZone: { points: [{ x: 1.2, y: 0 }, point, point] } }).success, false);
  assert.equal(schemas.cameraUpdate.safeParse({}).success, false);
  assert.equal(schemas.cameraUpdate.safeParse({ entryLine: null }).success, true);
  assert.equal(schemas.videoUpload.safeParse({ recordedAt: "2026-09-28T12:00" }).success, true);
  assert.equal(schemas.videoUpload.safeParse({ recordedAt: "" }).success, false);
  assert.equal(schemas.videoUpload.safeParse({ recordedAt: "2999-01-01T00:00" }).success, false);
});
