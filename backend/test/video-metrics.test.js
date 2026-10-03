const assert = require("node:assert/strict");
const test = require("node:test");
const { chooseBucketSeconds, computeCameraMetrics, lineCrossings, pointInPolygon, zoneSeconds } = require("../src/services/video-metrics");

// Vertical door line at x = 0.5; the venue interior is to the right (x > 0.5).
const door = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 }, inside: "negative" };
const hall = { points: [{ x: 0.6, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.6, y: 0.9 }] };

function walk(fromX, toX, seconds, y = 0.5, fps = 5, startT = 0) {
  const steps = seconds * fps;
  return Array.from({ length: steps + 1 }, (_, i) => [startT + i / fps, fromX + ((toX - fromX) * i) / steps, y]);
}

test("inside side follows the cross-product sign of the line", () => {
  // cross(b - a, p - a) for a point right of a downward line is negative.
  assert.deepEqual(lineCrossings(walk(0.2, 0.8, 4), door), { entries: [2.2], exits: [] }, "counted at the first point past the hysteresis margin");
  const flipped = { ...door, inside: "positive" };
  assert.deepEqual(lineCrossings(walk(0.2, 0.8, 4), flipped).exits.length, 1);
});

test("jitter around the entry line is not counted as repeated entries", () => {
  const jitter = [[0, 0.3, 0.5], [1, 0.495, 0.5], [2, 0.505, 0.5], [3, 0.498, 0.5], [4, 0.51, 0.5], [5, 0.7, 0.5]];
  assert.equal(lineCrossings(jitter, door).entries.length, 1);
});

test("crossing the infinite line outside the drawn segment is not an entry", () => {
  const shortDoor = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 0.3 }, inside: "negative" };
  assert.equal(lineCrossings(walk(0.2, 0.8, 4, 0.8), shortDoor).entries.length, 0);
});

test("zone membership, occupancy seconds and dwell with gap handling", () => {
  assert.equal(pointInPolygon({ x: 0.7, y: 0.5 }, hall.points), true);
  assert.equal(pointInPolygon({ x: 0.3, y: 0.5 }, hall.points), false);
  const stay = [[0, 0.7, 0.5], [1, 0.7, 0.5], [2, 0.7, 0.5], [10, 0.7, 0.5], [11, 0.7, 0.5]];
  const result = zoneSeconds(stay, hall.points);
  assert.deepEqual([...result.seconds], [0, 1, 2, 10, 11]);
  assert.equal(result.dwell, 3, "the 8-second gap is not counted");
});

test("bucket size adapts to the recorded span", () => {
  assert.equal(chooseBucketSeconds(50_000), 10);
  assert.equal(chooseBucketSeconds(10 * 60_000), 30);
  assert.equal(chooseBucketSeconds(2 * 60 * 60_000), 300);
  assert.equal(chooseBucketSeconds(12 * 60 * 60_000), 1800);
});

test("camera metrics combine entries, occupancy, dwell, series and heatmap", () => {
  const recordedAt = "2026-09-28T09:00:00.000Z";
  const video = { id: "v1", originalName: "door.mp4", recordedAt, durationSec: 600, sampleFps: 5 };
  const tracks = [
    { trackId: 1, points: walk(0.2, 0.8, 6) }, // enters, then stays in the hall for a moment
    { trackId: 2, points: [...walk(0.2, 0.7, 5, 0.5, 5, 60), ...walk(0.7, 0.7, 60, 0.5, 5, 66)] },
    { trackId: 3, points: walk(0.1, 0.3, 5, 0.5, 5, 300) }, // passer-by outside
  ];
  const metrics = computeCameraMetrics({
    camera: { entryLine: door, hallZone: hall },
    videos: [video],
    tracksByVideo: new Map([["v1", tracks]]),
  });

  assert.equal(metrics.entries.total, 2);
  assert.equal(metrics.entries.exits, 0);
  assert.equal(metrics.occupancy.peak, 1);
  assert.equal(metrics.dwell.tracks, 1, "only the long stay passes the minimum dwell");
  assert.ok(metrics.dwell.averageSec >= 60);
  assert.equal(metrics.series.bucketSeconds, 30);
  assert.equal(metrics.series.buckets.length, 20);
  assert.equal(metrics.series.buckets[0].entries, 1);
  assert.equal(metrics.series.buckets[2].entries, 1);
  assert.equal(metrics.period.from, recordedAt);
  assert.equal(metrics.period.to, "2026-09-28T09:10:00.000Z");
  assert.equal(metrics.heatmap.cells.length, metrics.heatmap.cols * metrics.heatmap.rows);
  assert.ok(metrics.heatmap.cells.some((value) => value > 0));
  assert.equal(metrics.trackCount, 3);
});

test("metrics without markup report heatmap only, and no processed video means no metrics", () => {
  const video = { id: "v1", originalName: "hall.mp4", recordedAt: "2026-09-28T09:00:00.000Z", durationSec: 60, sampleFps: 5 };
  const metrics = computeCameraMetrics({
    camera: { entryLine: null, hallZone: null },
    videos: [video],
    tracksByVideo: new Map([["v1", [{ trackId: 1, points: walk(0.2, 0.8, 6) }]]]),
  });
  assert.equal(metrics.entries, null);
  assert.equal(metrics.occupancy, null);
  assert.equal(metrics.dwell, null);
  assert.deepEqual(metrics.markup, { entryLine: false, hallZone: false });
  assert.equal(metrics.series.buckets[0].entries, null);
  assert.ok(metrics.heatmap.cells.some((value) => value > 0));
  assert.equal(computeCameraMetrics({ camera: {}, videos: [], tracksByVideo: new Map() }), null);
});
