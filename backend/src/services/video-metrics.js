// Pure metric computation from worker tracks. Track points are [secondsFromVideoStart, x, y],
// where x/y is the person's foot point as a fraction of the frame.

const LINE_MARGIN = 0.015; // hysteresis: points closer to the entry line keep the previous side
const MAX_GAP_SEC = 2; // longer gaps inside one track are not counted as time in the zone
const MIN_DWELL_SEC = 3; // shorter stays are treated as passers-by or detector noise
const HEAT_COLS = 48;
const HEAT_ROWS = 27;
const BUCKET_STEPS_SEC = [10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400];
const MAX_BUCKETS = 36;

function cross(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function segmentsIntersect(p1, p2, a, b) {
  return cross(a, b, p1) * cross(a, b, p2) <= 0 && cross(p1, p2, a) * cross(p1, p2, b) <= 0;
}

function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if ((pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

// 1 = inside the venue, -1 = outside, 0 = too close to the line to decide.
function lineSide(line, p) {
  const length = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  if (length === 0) return 0;
  const distance = cross(line.a, line.b, p) / length;
  if (Math.abs(distance) < LINE_MARGIN) return 0;
  return (distance > 0) === (line.inside === "positive") ? 1 : -1;
}

function lineCrossings(points, line) {
  const entries = [];
  const exits = [];
  let state = 0;
  let last = null;
  for (const [t, x, y] of points) {
    const p = { x, y };
    const side = lineSide(line, p);
    if (side === 0) continue;
    if (state !== 0 && side !== state && segmentsIntersect(last, p, line.a, line.b)) {
      (side === 1 ? entries : exits).push(t);
    }
    state = side;
    last = p;
  }
  return { entries, exits };
}

function zoneSeconds(points, polygon) {
  const seconds = new Set();
  let dwell = 0;
  let previous = null;
  for (const [t, x, y] of points) {
    const inside = pointInPolygon({ x, y }, polygon);
    if (inside) seconds.add(Math.floor(t));
    if (inside && previous?.inside && t - previous.t <= MAX_GAP_SEC) dwell += t - previous.t;
    previous = { t, inside };
  }
  return { seconds, dwell };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function chooseBucketSeconds(spanMs) {
  const spanSec = spanMs / 1000;
  return BUCKET_STEPS_SEC.find((step) => spanSec / step <= MAX_BUCKETS) ?? BUCKET_STEPS_SEC.at(-1);
}

function sortedPoints(track) {
  return [...track.points].sort((a, b) => a[0] - b[0]);
}

/**
 * @param camera { entryLine, hallZone }
 * @param videos processed videos: { id, originalName, recordedAt, durationSec, sampleFps }
 * @param tracksByVideo Map(videoId -> [{ trackId, points }])
 * @returns metrics object, or null when there is no processed video
 */
function computeCameraMetrics({ camera, videos, tracksByVideo }) {
  const usable = videos.filter((video) => video.durationSec > 0);
  if (!usable.length) return null;

  const line = camera.entryLine || null;
  const polygon = camera.hallZone?.points?.length >= 3 ? camera.hallZone.points : null;
  const spans = usable.map((video) => {
    const start = new Date(video.recordedAt).getTime();
    return { video, start, end: start + video.durationSec * 1000 };
  });
  const from = Math.min(...spans.map((span) => span.start));
  const to = Math.max(...spans.map((span) => span.end));
  const bucketSeconds = chooseBucketSeconds(to - from);
  const bucketMs = bucketSeconds * 1000;
  const firstBucket = Math.floor(from / bucketMs) * bucketMs;
  const bucketCount = Math.max(1, Math.ceil((to - firstBucket) / bucketMs));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: firstBucket + index * bucketMs,
    coveredSec: 0,
    entries: 0,
    exits: 0,
    occupancySum: 0,
    occupancyMax: 0,
  }));
  const bucketAt = (ms) => buckets[Math.min(bucketCount - 1, Math.max(0, Math.floor((ms - firstBucket) / bucketMs)))];

  const heat = new Array(HEAT_COLS * HEAT_ROWS).fill(0);
  const dwellValues = [];
  let entries = 0;
  let exits = 0;
  let peak = 0;
  let peakAt = null;
  let occupancyTotal = 0;
  let coveredTotal = 0;
  let trackCount = 0;

  for (const { video, start } of spans) {
    const tracks = tracksByVideo.get(String(video.id)) || [];
    const seconds = Math.ceil(video.durationSec);
    const occupancy = new Array(seconds).fill(0);
    const pointWeight = 1 / (video.sampleFps || 1);
    trackCount += tracks.length;

    for (const track of tracks) {
      const points = sortedPoints(track);
      for (const [, x, y] of points) {
        const col = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor(x * HEAT_COLS)));
        const row = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor(y * HEAT_ROWS)));
        heat[row * HEAT_COLS + col] += pointWeight;
      }
      if (line) {
        const crossings = lineCrossings(points, line);
        entries += crossings.entries.length;
        exits += crossings.exits.length;
        for (const t of crossings.entries) bucketAt(start + t * 1000).entries += 1;
        for (const t of crossings.exits) bucketAt(start + t * 1000).exits += 1;
      }
      if (polygon) {
        const zone = zoneSeconds(points, polygon);
        for (const second of zone.seconds) if (second < seconds) occupancy[second] += 1;
        if (zone.dwell >= MIN_DWELL_SEC) dwellValues.push(zone.dwell);
      }
    }

    for (let second = 0; second < seconds; second += 1) {
      const bucket = bucketAt(start + second * 1000);
      bucket.coveredSec += 1;
      coveredTotal += 1;
      if (!polygon) continue;
      const count = occupancy[second];
      bucket.occupancySum += count;
      bucket.occupancyMax = Math.max(bucket.occupancyMax, count);
      occupancyTotal += count;
      if (count > peak) {
        peak = count;
        peakAt = start + second * 1000;
      }
    }
  }

  return {
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    videos: usable.map((video) => ({
      id: String(video.id),
      originalName: video.originalName,
      recordedAt: new Date(video.recordedAt).toISOString(),
      durationSec: video.durationSec,
    })),
    markup: { entryLine: Boolean(line), hallZone: Boolean(polygon) },
    trackCount,
    entries: line ? { total: entries, exits } : null,
    occupancy: polygon ? { peak, peakAt: peakAt === null ? null : new Date(peakAt).toISOString(), average: round(occupancyTotal / Math.max(1, coveredTotal)) } : null,
    dwell: polygon ? { averageSec: dwellValues.length ? Math.round(dwellValues.reduce((sum, value) => sum + value, 0) / dwellValues.length) : null, medianSec: dwellValues.length ? Math.round(median(dwellValues)) : null, tracks: dwellValues.length, minSec: MIN_DWELL_SEC } : null,
    series: {
      bucketSeconds,
      buckets: buckets.map((bucket) => ({
        start: new Date(bucket.start).toISOString(),
        coveredSec: bucket.coveredSec,
        entries: line && bucket.coveredSec ? bucket.entries : null,
        exits: line && bucket.coveredSec ? bucket.exits : null,
        occupancyAvg: polygon && bucket.coveredSec ? round(bucket.occupancySum / bucket.coveredSec) : null,
        occupancyMax: polygon && bucket.coveredSec ? bucket.occupancyMax : null,
      })),
    },
    heatmap: { cols: HEAT_COLS, rows: HEAT_ROWS, cells: heat.map((value) => round(value)) },
  };
}

module.exports = {
  computeCameraMetrics,
  lineCrossings,
  pointInPolygon,
  zoneSeconds,
  chooseBucketSeconds,
  constants: { LINE_MARGIN, MAX_GAP_SEC, MIN_DWELL_SEC, HEAT_COLS, HEAT_ROWS },
};
