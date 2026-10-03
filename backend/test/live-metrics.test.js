const assert = require("node:assert/strict");
const test = require("node:test");
const {
  aggregateStats, computeHourStats, nowState, periodRange, presenceSeconds, startOfLocalDay, tableSessions,
} = require("../src/services/live-metrics");

const HOUR = Date.UTC(2026, 9, 2, 9); // 12:00 in Kyiv (UTC+3)
const door = { a: { x: 0.3, y: 0.5 }, b: { x: 0.7, y: 0.5 }, inside: "positive" }; // inside = below the line (y > 0.5)
const street = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.45 }, { x: 0, y: 0.45 }] };
const square = (x, y, size = 0.1) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];

// Builds a live track from [secondsFromHour, x, y] samples.
function track(samples, { final = true, offsetSec = 0 } = {}) {
  const start = HOUR + (samples[0][0] + offsetSec) * 1000;
  return {
    startAt: new Date(start),
    endAt: new Date(HOUR + (samples.at(-1)[0] + offsetSec) * 1000),
    final,
    points: samples.map(([t, x, y]) => [t + offsetSec - (start - HOUR) / 1000, x, y]),
  };
}

function walk(fromT, toT, from, to, hz = 2) {
  const steps = Math.round((toT - fromT) * hz);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const k = i / steps;
    return [fromT + (toT - fromT) * k, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k];
  });
}

test("outdoor: entries cross the door line, passers-by stay in the street zone", () => {
  const camera = { kind: "outdoor", entryLine: door, streetZone: street };
  const tracks = [
    track(walk(60, 70, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 })), // walks in at minute 1
    track(walk(130, 150, { x: 0.05, y: 0.3 }, { x: 0.95, y: 0.3 })), // walks past at minute 2
    track(walk(200, 210, { x: 0.05, y: 0.3 }, { x: 0.5, y: 0.3 }), { final: false }), // still walking: not counted yet
  ];
  const stats = computeHourStats({ hourStartMs: HOUR, camera, tracks, nowMs: HOUR + 215_000 });
  assert.equal(stats.entries.reduce((a, b) => a + b), 1);
  assert.equal(stats.entries[1], 1);
  assert.equal(stats.passersby.reduce((a, b) => a + b), 1);
  assert.equal(stats.passersby[2], 1);
  assert.equal(stats.occSum, null, "outdoor cameras have no hall");

  const later = computeHourStats({ hourStartMs: HOUR, camera, tracks, nowMs: HOUR + 400_000 });
  assert.equal(later.passersby.reduce((a, b) => a + b), 2, "an idle track becomes complete after a minute");
});

test("outdoor without a street zone reports entries but no passers-by", () => {
  const stats = computeHourStats({ hourStartMs: HOUR, camera: { kind: "outdoor", entryLine: door }, tracks: [] });
  assert.ok(stats.entries);
  assert.equal(stats.passersby, null);
});

test("hybrid: people seen through the door are passers-by, not hall occupancy", () => {
  const doorZone = { points: square(0.4, 0.1, 0.2) }; // door opening at the top of the frame
  const threshold = { a: { x: 0.4, y: 0.32 }, b: { x: 0.6, y: 0.32 }, inside: "positive" };
  const camera = { kind: "hybrid", entryLine: threshold, doorZone };
  const passer = track(walk(10, 16, { x: 0.41, y: 0.2 }, { x: 0.59, y: 0.2 }));
  const guest = track([...walk(100, 106, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.7 }), ...walk(106.5, 160, { x: 0.5, y: 0.7 }, { x: 0.52, y: 0.7 })]);
  const stats = computeHourStats({ hourStartMs: HOUR, camera, tracks: [passer, guest], nowMs: HOUR + 3_600_000 });
  assert.equal(stats.passersby[0], 1);
  assert.equal(stats.entries[1], 1);
  assert.equal(stats.occMax[0], 0, "the passer-by never counts as a guest in the hall");
  assert.equal(stats.occMax[1], 1);
  assert.ok(stats.heat.every(([cell]) => {
    const row = Math.floor(cell / 48);
    const col = cell % 48;
    return !(col >= Math.floor(0.4 * 48) && col < Math.floor(0.6 * 48) && row >= Math.floor(0.1 * 27) && row < Math.floor(0.3 * 27));
  }), "the door opening is excluded from the hall heatmap");
});

test("indoor: occupancy fills short detector gaps; dwell needs a complete track", () => {
  const camera = { kind: "indoor" };
  const sitter = track([[0, 0.5, 0.5], [1, 0.5, 0.5], [2, 0.5, 0.5], [3, 0.5, 0.5], [5.5, 0.5, 0.5], [6, 0.5, 0.5], [20, 0.5, 0.5]]);
  const stats = computeHourStats({ hourStartMs: HOUR, camera, tracks: [sitter], nowMs: HOUR + 3_600_000 });
  // seconds 0..6 (gap of 2.5 s filled) + 20; the 14 s gap is not filled
  assert.equal(stats.occSum[0], 8);
  assert.equal(stats.dwellCount, 1);
  assert.equal(stats.entries, null, "indoor cameras do not count entries");
});

test("table sessions merge short gaps and drop short visits", () => {
  const seconds = new Set([...Array.from({ length: 40 }, (_, i) => i), ...Array.from({ length: 40 }, (_, i) => 60 + i), 500, 501]);
  assert.deepEqual(tableSessions(seconds), [{ start: 0, end: 100 }]);
});

test("tables: a guest sitting 10 minutes occupies the table, a waiter passing by does not", () => {
  const table = { id: "t1", label: "Стіл 1", points: square(0.6, 0.6) };
  const camera = { kind: "indoor", tables: [table] };
  const guest = track(walk(0, 600, { x: 0.65, y: 0.71 }, { x: 0.66, y: 0.71 }, 1)); // feet just below the table edge
  const waiter = track(walk(900, 920, { x: 0.55, y: 0.65 }, { x: 0.75, y: 0.65 }));
  const stats = computeHourStats({ hourStartMs: HOUR, camera, tracks: [guest, waiter], nowMs: HOUR + 3_600_000 });
  assert.deepEqual(stats.tables, [{ id: "t1", occupiedSec: 601, sessions: 1 }]);
});

test("presence seconds respect the predicate", () => {
  const seconds = presenceSeconds([[0, 0.1, 0.1], [1, 0.9, 0.9], [2, 0.1, 0.1]], (p) => p.x < 0.5);
  assert.deepEqual([...seconds], [0, 2]);
});

test("Kyiv local day boundaries and periods", () => {
  const now = Date.UTC(2026, 9, 2, 19, 30); // 22:30 Kyiv
  assert.equal(new Date(startOfLocalDay(now, "Europe/Kyiv")).toISOString(), "2026-10-01T21:00:00.000Z");
  const week = periodRange("7d", now, "Europe/Kyiv");
  assert.equal(new Date(week.from).toISOString(), "2026-09-25T21:00:00.000Z");
  assert.equal(new Date(week.to).toISOString(), "2026-10-02T21:00:00.000Z");
  // DST: 25.10.2026 Kyiv switches from UTC+3 to UTC+2
  const afterDst = Date.UTC(2026, 9, 26, 12);
  assert.equal(new Date(startOfLocalDay(afterDst, "Europe/Kyiv")).toISOString(), "2026-10-25T22:00:00.000Z");
});

test("aggregation keeps offline time as gaps and computes conversion", () => {
  const camera = { kind: "outdoor", entryLine: door, streetZone: street, markupVersion: 2 };
  const minutes = (fill) => Array.from({ length: 60 }, (_, i) => fill(i));
  const hours = [
    { hour: new Date(HOUR), cov: Object.fromEntries(minutes((i) => [String(i), 60])), entries: minutes((i) => (i === 5 ? 3 : 0)), exits: minutes(() => 0), passersby: minutes((i) => (i === 5 ? 9 : 0)), markupVersion: 1 },
  ];
  const from = startOfLocalDay(HOUR, "Europe/Kyiv");
  const stats = aggregateStats({ hours, camera, periodKey: "today", from, to: from + 24 * 3_600_000, bucket: "hour", timeZone: "Europe/Kyiv", nowMs: HOUR + 2 * 3_600_000 });
  assert.equal(stats.entries.total, 3);
  assert.equal(stats.passersby.total, 9);
  assert.equal(stats.passersby.conversion, 0.25);
  assert.equal(stats.series.buckets.length, 24);
  const noon = stats.series.buckets[12];
  assert.equal(noon.entries, 3);
  assert.equal(stats.series.buckets[11].entries, null, "an hour without coverage is a gap, not zero");
  assert.equal(stats.series.buckets[20].future, true);
  assert.equal(stats.markupStaleBefore, new Date(HOUR + 3_600_000).toISOString());
  assert.equal(stats.occupancy, null);
});

test("now state: everyone inside is in the hall except the doorway and staff behind the counter", () => {
  const camera = {
    kind: "hybrid",
    doorZone: { points: square(0, 0, 0.3) },
    hallZone: { points: square(0.3, 0.3, 0.4) },
    staffZone: { points: square(0.8, 0.2, 0.15) },
  };
  // A guest at the counter (0.75, 0.9) stands just outside the hall zone but is still inside the venue.
  const state = nowState({ camera, people: [[1, 0.1, 0.1], [2, 0.5, 0.5], [3, 0.75, 0.9], [4, 0.85, 0.3]] });
  assert.deepEqual([state.inHall, state.outside, state.elsewhere], [2, 1, 1]);
});

test("now state splits hall and outside, tracks table occupancy since", () => {
  const camera = { kind: "hybrid", doorZone: { points: square(0, 0, 0.3) }, tables: [{ id: "t1", label: "1", points: square(0.6, 0.6) }] };
  const since = new Map();
  const first = nowState({ camera, people: [[1, 0.1, 0.1], [2, 0.65, 0.65]], tableSince: since, nowMs: 1000 });
  assert.equal(first.inHall, 1);
  assert.equal(first.outside, 1);
  assert.equal(first.elsewhere, 0);
  assert.deepEqual(first.tables, [{ id: "t1", occupied: true, sinceSec: 0 }]);
  const second = nowState({ camera, people: [[2, 0.65, 0.65]], tableSince: since, nowMs: 61_000 });
  assert.equal(second.tables[0].sinceSec, 60);
});

test("passers-by must move along; a rider and his bicycle are one cyclist", () => {
  const { passerbyEvents, cameraRegions } = require("../src/services/live-metrics");
  const camera = {
    kind: "hybrid",
    entryLine: { a: { x: 0, y: 0.5 }, b: { x: 0.3, y: 0.5 }, inside: "positive" },
    doorZone: { points: [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.45 }, { x: 0, y: 0.45 }] },
  };
  const regions = cameraRegions(camera);
  const startAt = new Date("2026-10-03T10:00:00Z");
  const walk = (from, to, n = 4) => Array.from({ length: n }, (_, i) => [i * 0.5, from + ((to - from) * i) / (n - 1), 0.3]);
  const tracks = [
    { startAt, endAt: startAt, final: true, points: walk(0.05, 0.25) }, // pedestrian
    { startAt, endAt: startAt, final: true, points: walk(0.1, 0.1) }, // flicker on one spot
    { startAt: new Date(startAt.getTime() + 60_000), endAt: startAt, final: true, points: walk(0.05, 0.25), bike: true }, // rider
    { startAt: new Date(startAt.getTime() + 60_000), endAt: startAt, final: true, points: walk(0.06, 0.26), cls: "bicycle" }, // his bicycle
    { startAt: new Date(startAt.getTime() + 120_000), endAt: startAt, final: true, points: walk(0.05, 0.25), cls: "bicycle" }, // rider not detected
    { startAt: new Date(startAt.getTime() + 180_000), endAt: startAt, final: true, points: walk(0.05, 0.25), maxConf: 0.3 }, // a reflection at night
  ];
  const events = passerbyEvents(tracks, regions, startAt.getTime() + 600_000);
  assert.deepEqual(events.map((event) => event.kind), ["pedestrian", "cyclist", "cyclist"]);
});
