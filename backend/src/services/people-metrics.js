// Pure logic of guests and staff: who a track is, what a visit consists of, how a shift looked.
// Tracks here have absolute points [[epochSec, x, y], ...] (foot point, frame fractions).

const { lineCrossings, pointInPolygon } = require("./video-metrics");
const { cameraRegions, expandPolygon, partsIn, presenceSeconds, startOfLocalDay } = require("./live-metrics");

const GUEST_HALL_SEC = 30; // without a seen entry a person becomes a guest after 30 s in the hall
const MATCH_IN_VENUE_SEC = 8; // a track must be inside this long before it may continue someone's day
const STAFF_ZONE_SEC = 60; // this long behind the counter → "is this a staff member?"
const VISIT_GAP_SEC = 180; // lost and found again within 3 min (without leaving through the door) = same visit
const FEAT_MIN_SAMPLES = 3;
const FEAT_WAIT_SEC = 20; // a qualified track waits this long for an appearance vector before it gets a number anyway
const ABSENCE_MIN_SEC = 60; // staff out of frame longer than this = "went out"
const WAIT_MIN_SEC = 10;
const WAIT_MERGE_SEC = 5;

// Cosine similarity of L2-normalised appearance vectors (yolo26s ReID). Measured on the first real camera
// (03.10.2026, 10 min of archive): people seen at the same time — median 0.59, 95th percentile 0.89 (reflections
// in the showcase, similar clothes); the same person after a tracker break — 0.83–0.97. The bar is high and a clear
// margin over the runner-up is required: two numbers for one person are better than one number for two people.
const MATCH_SIM = 0.8;
const UNCERTAIN_SIM = 0.68;
const MATCH_MARGIN = 0.05;
// Continuation: a new track that starts where a known person's track vanished a moment ago (occlusion, sitting
// down, a detector miss) is that person unless their appearance clearly disagrees. A seated guest half hidden by
// furniture flickers for minutes on the same spot, and their appearance varies a lot (measured: 0.52–0.77 between
// tracks of the same seated person), so the very same spot is trusted for up to 3 min.
const STITCH_GAP_SEC = 20;
const STITCH_DIST = 0.12;
const SAME_SPOT_GAP_SEC = 180;
const SAME_SPOT_DIST = 0.06;
const STITCH_SIM = 0.5;
const HIDDEN_SIM = 0.4; // below this a hidden person is clearly someone else
const PLACE_BONUS = 0.3; // staff reappear behind the counter, guests in the hall
const GUEST_BEHIND_COUNTER_SIM = 0.6;
const CONFLICT_DIST = 0.15; // one person cannot be on two tracks this far apart at the same time

/** Two tracks of one person seen at the same moment in different places: the assignment of the newer one is wrong. */
function concurrentConflict(track, other) {
  const overlap = Math.min(track.endSec, other.endSec) - Math.max(track.startSec, other.startSec);
  return overlap >= 1 && Math.hypot(track.x - other.x, track.y - other.y) > CONFLICT_DIST;
}

// Two people of the day seen by the same camera at the same moments in clearly different places are two different
// humans (not one person the tracker split in two): they cannot be the same staff member and must not be merged.
const APART_MIN_SEC = 2; // a short glitch (duplicate box, identity swap) is not proof

function seenApart(tracksA, tracksB) {
  const prepare = (tracks) => tracks
    .map((track) => ({ cameraId: String(track.cameraId), points: absolutePoints(track) }))
    .filter((track) => track.points.length);
  const others = prepare(tracksB);
  const moments = new Set();
  for (const a of prepare(tracksA)) {
    for (const b of others) {
      if (a.cameraId !== b.cameraId || a.points.at(-1)[0] < b.points[0][0] || b.points.at(-1)[0] < a.points[0][0]) continue;
      let j = 0;
      for (const [t, x, y] of a.points) {
        while (j + 1 < b.points.length && Math.abs(b.points[j + 1][0] - t) <= Math.abs(b.points[j][0] - t)) j += 1;
        const [bt, bx, by] = b.points[j];
        if (Math.abs(bt - t) <= 0.25 && Math.hypot(x - bx, y - by) > CONFLICT_DIST) moments.add(Math.floor(t * 2));
      }
    }
  }
  return moments.size >= APART_MIN_SEC * 2; // points come at 2 Hz
}

// ---- days ----

function localDay(ms, timeZone) {
  const p = partsIn(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// [from, to) of a venue-local day "YYYY-MM-DD" in epoch ms.
function dayRange(day, timeZone) {
  const [year, month, date] = day.split("-").map(Number);
  const noon = Date.UTC(year, month - 1, date, 12);
  const from = startOfLocalDay(noon, timeZone);
  const to = startOfLocalDay(noon + 24 * 3_600_000, timeZone);
  return { from, to };
}

// ---- tracks ----

function absolutePoints(track) {
  const base = new Date(track.startAt).getTime() / 1000;
  return (track.points || []).map(([offset, x, y]) => [base + offset, x, y]).sort((a, b) => a[0] - b[0]);
}

/** What a single track did: entered through the door, how long it was in the hall / behind the counter. */
function trackFacts(points, regions) {
  const crossings = regions.line ? lineCrossings(points, regions.line) : { entries: [], exits: [] };
  const hallSec = regions.inHall ? presenceSeconds(points, regions.inHall).size : 0;
  const staffSec = regions.inStaff ? presenceSeconds(points, regions.inStaff).size : 0;
  const lastEntry = crossings.entries.at(-1) ?? null;
  const lastExit = crossings.exits.at(-1) ?? null;
  return {
    entryAt: crossings.entries[0] ?? null,
    exitAt: lastExit !== null && (lastEntry === null || lastExit > lastEntry) ? lastExit : null,
    hallSec,
    staffSec,
    firstAt: points[0]?.[0] ?? null,
    lastAt: points.at(-1)?.[0] ?? null,
  };
}

/**
 * Who a track that matched nobody becomes:
 *  - "guest" — crossed the threshold inward (a guest cannot appear in the hall without entering); cameras without
 *    a threshold line (indoor) fall back to 30 s in the hall;
 *  - "staff_candidate" — stood behind the counter for a minute (staff may be inside before the camera started);
 *  - null — someone already inside whom the tracker lost; they must continue a known person instead.
 */
function newPersonKind(facts, { requireEntry, nobodyHidden = false }) {
  if (facts.entryAt !== null) return "guest";
  if (facts.staffSec >= STAFF_ZONE_SEC) return "staff_candidate";
  if (!requireEntry && facts.hallSec >= GUEST_HALL_SEC) return "guest";
  // Nobody who entered is out of sight, yet someone has been in the hall for 30 s: they were inside before the
  // camera started (or the entry was missed) — a guest whose entry was not seen, marked as such.
  if (requireEntry && nobodyHidden && facts.hallSec >= GUEST_HALL_SEC) return "guest_unseen";
  return null;
}

/**
 * A track that did not come through the door belongs to someone already inside who is now out of sight (behind the
 * showcase, seated behind furniture, walked behind the counter). candidates: [{ personId, role, x, y, sim }] — people
 * whose visit is open and who are not on any visible track; `sim` is the appearance similarity or null when unknown.
 * start: { x, y, behindCounter } — where the new track began.
 * Clearly different appearance excludes a candidate; otherwise similar appearance, a near last position and the
 * right place (staff behind the counter, guests in the hall) win.
 */
function pickHidden(start, candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate.sim !== null && candidate.sim < HIDDEN_SIM) continue;
    // Guests do not walk behind the counter: only a clearly matching appearance may put a guest there.
    if (start.behindCounter && candidate.role !== "staff" && !(candidate.sim !== null && candidate.sim >= GUEST_BEHIND_COUNTER_SIM)) continue;
    const distance = Math.hypot(start.x - candidate.x, start.y - candidate.y);
    const place = start.behindCounter === undefined ? 0 : (candidate.role === "staff") === start.behindCounter ? PLACE_BONUS : -PLACE_BONUS;
    const score = (candidate.sim ?? 0.55) - distance + place;
    if (!best || score > best.score) best = { ...candidate, distance, score };
  }
  return best;
}

/** Enough time inside to continue an existing person's day (lower bar than a new number). */
function insideVenue(facts) {
  return facts.entryAt !== null || facts.hallSec >= MATCH_IN_VENUE_SEC || facts.staffSec >= MATCH_IN_VENUE_SEC;
}

// ---- appearance ----

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function cosine(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

// ---- day gallery: the "model that learns people during the day" ----
// Every person keeps up to GALLERY_SIZE appearance vectors from different tracks (seated, standing, back, front);
// a new track is compared with the closest of them, not with one blurred average. Measured on the real camera: the
// same girl after going out and back had 0.92 with one of her earlier tracks but < 0.8 with her averaged vector.
// The gallery is erased together with the other vectors at the end of the day.
const GALLERY_SIZE = 16;
const GALLERY_NOVELTY = 0.95; // a vector this close to one already stored adds nothing new

function addToGallery(gallery, feat) {
  if (!feat?.length) return gallery || [];
  const current = gallery || [];
  if (current.some((item) => cosine(item, feat) >= GALLERY_NOVELTY)) return current;
  const rounded = feat.map((value) => Math.round(value * 10_000) / 10_000);
  return [...current, rounded].slice(-GALLERY_SIZE);
}

/** Best similarity of a track's vector to a person: the closest of their gallery vectors and their average. */
function personSimilarity(feat, person) {
  const vectors = [...(person.gallery || []), ...(person.vec?.length ? [person.vec] : [])];
  let best = null;
  for (const vector of vectors) {
    const sim = cosine(feat, vector);
    if (best === null || sim > best) best = sim;
  }
  return best;
}

// Running mean of two normalised vectors weighted by their sample counts.
function mergeVectors(a, aN, b, bN) {
  if (!a?.length) return { vec: b, n: bN };
  if (!b?.length) return { vec: a, n: aN };
  const total = aN + bN;
  return { vec: normalize(a.map((value, i) => (value * aN + b[i] * bN) / total)).map((value) => Math.round(value * 10_000) / 10_000), n: Math.min(total, 500) };
}

/**
 * Which person of the day a track belongs to.
 * candidates: [{ id, vec, role, busy }] — `busy` = that person is on another track at the same time.
 * → { decision: "match" | "uncertain_staff" | "none", personId, sim }
 */
function chooseMatch(feat, candidates, { match = MATCH_SIM, uncertain = UNCERTAIN_SIM, margin = MATCH_MARGIN } = {}) {
  const scored = candidates
    .filter((candidate) => !candidate.busy)
    .map((candidate) => ({ ...candidate, sim: personSimilarity(feat, candidate) }))
    .filter((candidate) => candidate.sim !== null)
    .sort((a, b) => b.sim - a.sim);
  const [best, second] = scored;
  if (!best) return { decision: "none", personId: null, sim: 0 };
  const clear = !second || best.sim - second.sim >= margin || second.sim < uncertain;
  if (best.sim >= match && clear) return { decision: "match", personId: best.id, sim: best.sim };
  if (best.sim >= uncertain && best.role === "staff") return { decision: "uncertain_staff", personId: best.id, sim: best.sim };
  return { decision: "none", personId: null, sim: best.sim };
}

/**
 * The track this one continues: ended ≤ 20 s before it started and ≤ 0.12 of the frame away, or on the very same
 * spot (≤ 0.06) within 3 min; the nearest wins.
 * start: { t, x, y } — the new track's first point; candidates: [{ personId, endSec, x, y }] — last points.
 */
function stitchCandidate(start, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const gap = start.t - candidate.endSec;
    const distance = Math.hypot(start.x - candidate.x, start.y - candidate.y);
    const near = gap >= -1 && gap <= STITCH_GAP_SEC && distance <= STITCH_DIST;
    const sameSpot = gap >= -1 && gap <= SAME_SPOT_GAP_SEC && distance <= SAME_SPOT_DIST;
    if (!near && !sameSpot) continue;
    if (!best || distance < best.distance) best = { ...candidate, distance };
  }
  return best;
}

// ---- visits ----

/**
 * Totals of one visit from its tracks: when it started, was last seen, time in hall / behind the counter,
 * seconds at each table, and whether the person left through the door.
 */
function visitStats(tracks, camera) {
  const regions = cameraRegions(camera);
  const all = tracks.map(absolutePoints).filter((points) => points.length);
  if (!all.length) return null;
  const hall = new Set();
  const staff = new Set();
  const tableSeconds = regions.tables.map(() => new Set());
  let startAt = Infinity;
  let lastSeenAt = -Infinity;
  let lastEntry = null;
  let lastExit = null;
  for (const points of all) {
    startAt = Math.min(startAt, points[0][0]);
    lastSeenAt = Math.max(lastSeenAt, points.at(-1)[0]);
    if (regions.inHall) for (const second of presenceSeconds(points, regions.inHall)) hall.add(second);
    if (regions.inStaff) for (const second of presenceSeconds(points, regions.inStaff)) staff.add(second);
    regions.tables.forEach((table, index) => {
      for (const second of presenceSeconds(points, (p) => pointInPolygon(p, table.polygon))) tableSeconds[index].add(second);
    });
    if (regions.line) {
      const crossings = lineCrossings(points, regions.line);
      for (const t of crossings.entries) if (lastEntry === null || t > lastEntry) lastEntry = t;
      for (const t of crossings.exits) if (lastExit === null || t > lastExit) lastExit = t;
    }
  }
  const labels = new Map((camera.tables || []).map((table) => [table.id, table.label]));
  return {
    startAt,
    lastSeenAt,
    hallSec: hall.size,
    staffSec: staff.size,
    tables: regions.tables
      .map((table, index) => ({ id: table.id, label: labels.get(table.id) || table.id, sec: tableSeconds[index].size }))
      .filter((table) => table.sec >= 20)
      .sort((a, b) => b.sec - a.sec),
    exitAt: lastExit !== null && (lastEntry === null || lastExit > lastEntry) ? lastExit : null,
  };
}

/** Should an active visit be closed now? → { close, exitedBy, endAt } */
function visitClosing({ stats, allFinal, nowSec }) {
  if (!stats) return { close: false };
  if (stats.exitAt !== null && allFinal && stats.lastSeenAt - stats.exitAt < 15) return { close: true, exitedBy: "door", endAt: stats.exitAt };
  if (nowSec - stats.lastSeenAt > VISIT_GAP_SEC) return { close: true, exitedBy: "lost", endAt: stats.lastSeenAt };
  return { close: false };
}

/** A new track of a known person continues the last visit or starts a new one. */
function continuesVisit(lastVisit, trackStartSec) {
  if (!lastVisit) return false;
  if (lastVisit.active) return true;
  return lastVisit.exitedBy === "lost" && trackStartSec - new Date(lastVisit.lastSeenAt).getTime() / 1000 <= VISIT_GAP_SEC;
}

// ---- staff shift ----

function mergeSeconds(seconds, gap) {
  const sorted = [...seconds].sort((a, b) => a - b);
  const runs = [];
  for (const second of sorted) {
    const last = runs.at(-1);
    if (last && second - last.to <= gap) last.to = second + 1;
    else runs.push({ from: second, to: second + 1 });
  }
  return runs;
}

/**
 * One staff member's day from their tracks: where they were (counter / hall / elsewhere in frame),
 * when they went out of frame for longer than a minute, totals and the current state.
 */
function staffShift(tracks, camera, { nowSec, live }) {
  const regions = cameraRegions(camera);
  const where = new Map(); // second -> "counter" | "hall" | "frame"
  for (const track of tracks) {
    const points = absolutePoints(track);
    for (const [t, x, y] of points) {
      const p = { x, y };
      const place = regions.inStaff?.(p) ? "counter" : regions.inHall?.(p) ? "hall" : "frame";
      const second = Math.floor(t);
      if (!where.has(second) || place === "counter") where.set(second, place);
    }
  }
  if (!where.size) return null;
  const present = mergeSeconds(where.keys(), 5);
  const segments = [];
  for (const run of present) {
    let current = null;
    for (let second = run.from; second < run.to; second += 1) {
      const place = where.get(second) ?? current?.where ?? "frame";
      if (current && current.where === place) current.to = second + 1;
      else {
        if (current) segments.push(current);
        current = { from: second, to: second + 1, where: place };
      }
    }
    if (current) segments.push(current);
  }
  // Short flickers between places are folded into the surrounding segment.
  const smooth = [];
  for (const segment of segments) {
    const last = smooth.at(-1);
    if (last && segment.to - segment.from < 8 && last.to === segment.from) last.to = segment.to;
    else if (last && last.where === segment.where && segment.from - last.to <= 5) last.to = segment.to;
    else smooth.push({ ...segment });
  }
  const absences = [];
  for (let i = 1; i < present.length; i += 1) {
    const gap = present[i].from - present[i - 1].to;
    if (gap >= ABSENCE_MIN_SEC) absences.push({ from: present[i - 1].to, to: present[i].from, sec: gap });
  }
  const first = present[0].from;
  const last = present.at(-1).to;
  const total = (place) => smooth.filter((segment) => segment.where === place).reduce((sum, segment) => sum + segment.to - segment.from, 0);
  const seenRecently = live && nowSec - last <= 15;
  const openAbsence = live && !seenRecently ? { from: last, to: nowSec, sec: Math.max(0, nowSec - last) } : null;
  return {
    firstSeenAt: first,
    lastSeenAt: last,
    onSiteSec: present.reduce((sum, run) => sum + run.to - run.from, 0),
    counterSec: total("counter"),
    hallSec: total("hall"),
    exits: absences.length + (openAbsence && openAbsence.sec >= ABSENCE_MIN_SEC ? 1 : 0),
    longestAbsenceSec: Math.max(0, ...absences.map((item) => item.sec), openAbsence?.sec ?? 0),
    segments: smooth,
    absences,
    state: seenRecently ? smooth.at(-1).where : live ? "away" : "off",
    stateSince: seenRecently ? smooth.at(-1).from : last,
  };
}

// ---- waiting at the counter ----

/**
 * Seconds when a guest stood in the queue zone and nobody was behind the counter.
 * tracks: all tracks of the camera for the day; staffZone presence by anyone counts as "served".
 */
function counterWaiting(tracks, camera) {
  const regions = cameraRegions(camera);
  if (!regions.inQueue || !regions.inStaff) return null;
  const queue = new Set();
  const staffed = new Set();
  for (const track of tracks) {
    const points = absolutePoints(track);
    for (const second of presenceSeconds(points, regions.inQueue)) queue.add(second);
    for (const second of presenceSeconds(points, regions.inStaff)) staffed.add(second);
  }
  const waiting = [...queue].filter((second) => !staffed.has(second));
  const episodes = mergeSeconds(waiting, WAIT_MERGE_SEC).filter((run) => run.to - run.from >= WAIT_MIN_SEC);
  return {
    episodes: episodes.map((run) => ({ from: run.from, to: run.to, sec: run.to - run.from })),
    totalSec: episodes.reduce((sum, run) => sum + run.to - run.from, 0),
  };
}

// ---- occupancy series for the day timeline ----

/** Average people in the hall per `bucketSec` from stored hours (occSum / covered seconds). */
function occupancySeries(hours, from, to, bucketSec = 600) {
  const buckets = [];
  for (let t = from; t < to; t += bucketSec * 1000) buckets.push({ t, occ: 0, cov: 0 });
  for (const doc of hours) {
    const hourMs = new Date(doc.hour).getTime();
    for (let minute = 0; minute < 60; minute += 1) {
      const t = hourMs + minute * 60_000;
      if (t < from || t >= to) continue;
      const covered = doc.cov?.[minute] ?? doc.cov?.[String(minute)] ?? 0;
      if (!covered) continue;
      const bucket = buckets[Math.floor((t - from) / (bucketSec * 1000))];
      bucket.occ += doc.occSum?.[minute] ?? 0;
      bucket.cov += covered;
    }
  }
  return buckets.map((bucket) => ({ t: bucket.t, avg: bucket.cov ? Math.round((bucket.occ / bucket.cov) * 10) / 10 : null }));
}

module.exports = {
  localDay,
  dayRange,
  absolutePoints,
  trackFacts,
  newPersonKind,
  pickHidden,
  concurrentConflict,
  seenApart,
  insideVenue,
  normalize,
  cosine,
  addToGallery,
  personSimilarity,
  mergeVectors,
  chooseMatch,
  stitchCandidate,
  visitStats,
  visitClosing,
  continuesVisit,
  staffShift,
  counterWaiting,
  occupancySeries,
  expandPolygon,
  constants: {
    GALLERY_SIZE, GUEST_HALL_SEC, MATCH_IN_VENUE_SEC, STAFF_ZONE_SEC, VISIT_GAP_SEC, FEAT_MIN_SAMPLES, FEAT_WAIT_SEC, ABSENCE_MIN_SEC,
    MATCH_SIM, UNCERTAIN_SIM, MATCH_MARGIN, STITCH_GAP_SEC, STITCH_DIST, SAME_SPOT_GAP_SEC, SAME_SPOT_DIST, STITCH_SIM,
  },
};
