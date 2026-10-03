// Pure metric computation for live cameras.
//
// computeHourStats() turns live tracks into one hourly aggregate (camerahours) using the camera's markup;
// aggregateStats() turns stored hours into the numbers the dashboard shows for a period.
// Track points are [secondsFromStartAt, x, y] with x/y the person's foot point as frame fractions.

const { lineCrossings, pointInPolygon, constants: { HEAT_COLS, HEAT_ROWS } } = require("./video-metrics");

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const PRESENCE_GAP_SEC = 3; // a person missed by the detector for up to 3 s is still present
const DWELL_GAP_SEC = 2;
const MIN_DWELL_SEC = 3;
const TABLE_EXPAND = 1.35; // seated people stand (feet) around the table, not on it
const TABLE_MIN_SESSION_SEC = 60; // shorter presence is a waiter or a passer-by
const TABLE_MERGE_GAP_SEC = 30;
const PASSERBY_MIN_POINTS = 2;
const PASSERBY_MIN_MOVE = 0.025; // a passer-by walks past; a box flickering on one spot is not one
const RIDER_DISTANCE = 0.2;
// A passer-by must have been seen clearly at least once: reflections in the door glass at night never are.
const PASSERBY_MIN_CONF = 0.45;
const DOOR_SHARE = 0.6; // hybrid: a passer-by is seen mostly through the door opening
const TRACK_IDLE_SEC = 60; // a track without updates for this long is complete even if the node never said so
const CONTEXT_MS = 2 * 60_000; // extra track time loaded around an hour (table sessions crossing the boundary)

const polygonOf = (zone) => (zone?.points?.length >= 3 ? zone.points : null);

function expandPolygon(points, factor = TABLE_EXPAND) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => ({
    x: Math.min(1, Math.max(0, cx + (p.x - cx) * factor)),
    y: Math.min(1, Math.max(0, cy + (p.y - cy) * factor)),
  }));
}

// What each camera kind measures; missing markup turns the corresponding metric off (null), never into zero.
function cameraRegions(camera) {
  const kind = camera.kind || "indoor";
  const hall = polygonOf(camera.hallZone);
  const door = kind === "hybrid" ? polygonOf(camera.doorZone) : null;
  const street = kind === "outdoor" ? polygonOf(camera.streetZone) : null;
  const line = kind !== "indoor" && camera.entryLine ? camera.entryLine : null;
  const passZone = kind === "outdoor" ? street : door;
  // Staff area (behind the counter) and the queue in front of it; staff are not guests "in the hall".
  const staff = kind === "outdoor" ? null : polygonOf(camera.staffZone);
  const queue = kind === "outdoor" ? null : polygonOf(camera.queueZone);
  const inDoor = (p) => Boolean(door && pointInPolygon(p, door));
  const inStaff = staff ? (p) => pointInPolygon(p, staff) : null;
  return {
    kind,
    line,
    passZone: line && passZone ? passZone : null,
    inPass: (p) => Boolean(passZone && pointInPolygon(p, passZone)),
    inHall: kind === "outdoor" ? null : (p) => (!hall || pointInPolygon(p, hall)) && !inDoor(p) && !(inStaff && inStaff(p)),
    inStaff,
    inQueue: queue ? (p) => pointInPolygon(p, queue) : null,
    inHeat: (p) => !inDoor(p),
    tables: kind === "outdoor" ? [] : (camera.tables || [])
      .filter((table) => table.points?.length >= 3)
      .map((table) => ({ id: table.id, polygon: expandPolygon(table.points) })),
  };
}

/**
 * Passers-by: complete tracks seen in the door opening / on the sidewalk that never crossed the threshold and
 * actually moved along. A person riding a bicycle is a cyclist; a bicycle whose rider the detector missed counts as a
 * cyclist too, but a bicycle next to an already counted person (the rider) is not counted twice.
 * → [{ track, t (mid-point in the zone, epoch s), kind: "pedestrian" | "cyclist", x, y }]
 */
function passerbyEvents(tracks, regions, nowMs = Date.now()) {
  if (!regions.passZone) return [];
  const people = [];
  const bicycles = [];
  for (const track of tracks) {
    const complete = Boolean(track.final) || new Date(track.endAt).getTime() <= nowMs - TRACK_IDLE_SEC * 1000;
    if (!complete) continue;
    if (typeof track.maxConf === "number" && track.maxConf < PASSERBY_MIN_CONF) continue;
    const points = absolutePoints(track);
    if (!points.length) continue;
    if (regions.line) {
      const crossings = lineCrossings(points, regions.line);
      if (crossings.entries.length || crossings.exits.length) continue;
    }
    const inZone = points.filter(([, x, y]) => pointInPolygon({ x, y }, regions.passZone));
    if (inZone.length < PASSERBY_MIN_POINTS) continue;
    if (regions.kind === "hybrid" && inZone.length / points.length < DOOR_SHARE) continue;
    const [, fx, fy] = inZone[0];
    const [, lx, ly] = inZone.at(-1);
    if (Math.hypot(lx - fx, ly - fy) < PASSERBY_MIN_MOVE) continue;
    const middle = inZone[Math.floor(inZone.length / 2)];
    const event = { track, t: middle[0], x: middle[1], y: middle[2], from: inZone[0][0], to: inZone.at(-1)[0] };
    if (track.cls === "bicycle") bicycles.push({ ...event, kind: "cyclist" });
    else people.push({ ...event, kind: track.bike ? "cyclist" : "pedestrian" });
  }
  for (const bicycle of bicycles) {
    const rider = people.find((person) => person.from <= bicycle.to && bicycle.from <= person.to
      && Math.hypot(person.x - bicycle.x, person.y - bicycle.y) <= RIDER_DISTANCE);
    if (rider) rider.kind = "cyclist";
    else people.push(bicycle);
  }
  return people.sort((a, b) => a.t - b.t);
}

function absolutePoints(track) {
  const base = new Date(track.startAt).getTime() / 1000;
  return track.points.map(([offset, x, y]) => [base + offset, x, y]).sort((a, b) => a[0] - b[0]);
}

// Whole seconds (epoch) during which the track was inside `predicate`; short detector gaps are filled.
function presenceSeconds(points, predicate, gap = PRESENCE_GAP_SEC) {
  const seconds = new Set();
  let previous = null;
  for (const [t, x, y] of points) {
    const inside = predicate({ x, y });
    if (inside) {
      const second = Math.floor(t);
      if (previous?.inside && t - previous.t <= gap) {
        for (let fill = Math.floor(previous.t) + 1; fill < second; fill += 1) seconds.add(fill);
      }
      seconds.add(second);
    }
    previous = { t, inside };
  }
  return seconds;
}

function dwellSeconds(points, predicate) {
  let dwell = 0;
  let previous = null;
  for (const [t, x, y] of points) {
    const inside = predicate({ x, y });
    if (inside && previous?.inside && t - previous.t <= DWELL_GAP_SEC) dwell += t - previous.t;
    previous = { t, inside };
  }
  return dwell;
}

// Merges occupied seconds into sessions [start, end) and drops the short ones.
function tableSessions(seconds) {
  const sorted = [...seconds].sort((a, b) => a - b);
  const sessions = [];
  let current = null;
  for (const second of sorted) {
    if (current && second - current.last <= TABLE_MERGE_GAP_SEC) {
      current.last = second;
      continue;
    }
    if (current) sessions.push(current);
    current = { start: second, last: second };
  }
  if (current) sessions.push(current);
  return sessions
    .map((session) => ({ start: session.start, end: session.last + 1 }))
    .filter((session) => session.end - session.start >= TABLE_MIN_SESSION_SEC);
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const zeros = () => new Array(60).fill(0);

/**
 * @param hourStartMs UTC start of the hour
 * @param camera { kind, entryLine, hallZone, streetZone, doorZone, tables }
 * @param tracks live tracks overlapping [hour - CONTEXT_MS, hour + 1h + CONTEXT_MS): { startAt, endAt, final, points }
 * @param nowMs used to decide whether an unfinished track is complete
 */
function computeHourStats({ hourStartMs, camera, tracks, nowMs = Date.now() }) {
  const regions = cameraRegions(camera);
  const h0 = hourStartMs / 1000;
  const h1 = h0 + 3600;
  const inHour = (t) => t >= h0 && t < h1;
  const minuteOf = (t) => Math.floor((t - h0) / 60);

  const entries = regions.line ? zeros() : null;
  const exits = regions.line ? zeros() : null;
  const passersby = regions.passZone ? zeros() : null;
  const occupancy = regions.inHall ? new Int32Array(3600) : null;
  const heat = new Map();
  const tableSeconds = regions.tables.map(() => new Set());
  let dwellSum = 0;
  let dwellCount = 0;

  for (const event of passerbyEvents(tracks, regions, nowMs)) {
    if (passersby && inHour(event.t)) passersby[minuteOf(event.t)] += 1;
  }

  for (const track of tracks) {
    if (track.cls === "bicycle") continue; // bicycles are passers-by only, never people in the hall
    const points = absolutePoints(track);
    if (!points.length) continue;
    const complete = Boolean(track.final) || new Date(track.endAt).getTime() <= nowMs - TRACK_IDLE_SEC * 1000;

    let crossings = null;
    if (regions.line) {
      crossings = lineCrossings(points, regions.line);
      for (const t of crossings.entries) if (inHour(t)) entries[minuteOf(t)] += 1;
      for (const t of crossings.exits) if (inHour(t)) exits[minuteOf(t)] += 1;
    }

    if (occupancy) {
      for (const second of presenceSeconds(points, regions.inHall)) {
        if (second >= h0 && second < h1) occupancy[second - h0] += 1;
      }
      if (complete && inHour(points.at(-1)[0])) {
        const dwell = dwellSeconds(points, regions.inHall);
        if (dwell >= MIN_DWELL_SEC) {
          dwellSum += dwell;
          dwellCount += 1;
        }
      }
    }

    for (let index = 0; index < points.length; index += 1) {
      const [t, x, y] = points[index];
      if (!inHour(t) || !regions.inHeat({ x, y })) continue;
      const weight = index + 1 < points.length ? Math.min(1, Math.max(0, points[index + 1][0] - t)) : 0.5;
      const col = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor(x * HEAT_COLS)));
      const row = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor(y * HEAT_ROWS)));
      const cell = row * HEAT_COLS + col;
      heat.set(cell, (heat.get(cell) || 0) + weight);
    }

    regions.tables.forEach((table, index) => {
      for (const second of presenceSeconds(points, (p) => pointInPolygon(p, table.polygon))) tableSeconds[index].add(second);
    });
  }

  let occSum = null;
  let occMax = null;
  if (occupancy) {
    occSum = zeros();
    occMax = zeros();
    for (let second = 0; second < 3600; second += 1) {
      const minute = Math.floor(second / 60);
      occSum[minute] += occupancy[second];
      occMax[minute] = Math.max(occMax[minute], occupancy[second]);
    }
  }

  return {
    entries,
    exits,
    passersby,
    occSum,
    occMax,
    dwellSum: round(dwellSum),
    dwellCount,
    heat: [...heat.entries()].sort((a, b) => a[0] - b[0]).map(([cell, value]) => [cell, round(value)]),
    tables: regions.tables.map((table, index) => {
      const sessions = tableSessions(tableSeconds[index]);
      return {
        id: table.id,
        occupiedSec: sessions.reduce((sum, session) => sum + Math.max(0, Math.min(session.end, h1) - Math.max(session.start, h0)), 0),
        sessions: sessions.filter((session) => inHour(session.start)).length,
      };
    }),
  };
}

// ---- Time zones -------------------------------------------------------------------------------

const formatters = new Map();
function partsIn(ms, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  }
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

function zoneOffsetMs(ms, timeZone) {
  const p = partsIn(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

function startOfLocalDay(ms, timeZone) {
  const p = partsIn(ms, timeZone);
  const localMidnight = Date.UTC(p.year, p.month - 1, p.day);
  let utc = localMidnight - zoneOffsetMs(ms, timeZone);
  const corrected = localMidnight - zoneOffsetMs(utc, timeZone); // DST change between midnight and now
  if (corrected !== utc) utc = corrected;
  return utc;
}

const PERIODS = ["today", "yesterday", "7d", "30d"];

function periodRange(key, nowMs, timeZone) {
  const today = startOfLocalDay(nowMs, timeZone);
  const nextDay = startOfLocalDay(today + DAY_MS + 3 * HOUR_MS, timeZone);
  switch (key) {
    case "today": return { from: today, to: nextDay, bucket: "hour" };
    case "yesterday": return { from: startOfLocalDay(today - 3 * HOUR_MS, timeZone), to: today, bucket: "hour" };
    case "7d": return { from: startOfLocalDay(today - 6 * DAY_MS + 3 * HOUR_MS, timeZone), to: nextDay, bucket: "day" };
    case "30d": return { from: startOfLocalDay(today - 29 * DAY_MS + 3 * HOUR_MS, timeZone), to: nextDay, bucket: "day" };
    default: throw new Error(`Unknown period ${key}`);
  }
}

function bucketStarts(from, to, bucket, timeZone) {
  const starts = [];
  if (bucket === "hour") {
    for (let t = from; t < to; t += HOUR_MS) starts.push(t);
    return starts;
  }
  for (let t = from; t < to; t = startOfLocalDay(t + DAY_MS + 3 * HOUR_MS, timeZone)) starts.push(t);
  return starts;
}

// ---- Period aggregation -----------------------------------------------------------------------

function covAt(doc, minute) {
  const value = doc.cov?.[minute] ?? doc.cov?.[String(minute)];
  return Number.isFinite(value) ? Math.min(60, value) : 0;
}

/**
 * @param hours camerahours documents of the camera within [from, to)
 * @param camera { kind, entryLine, hallZone, streetZone, doorZone, tables, markupVersion }
 */
function aggregateStats({ hours, camera, periodKey, from, to, bucket, timeZone, nowMs = Date.now() }) {
  const regions = cameraRegions(camera);
  const starts = bucketStarts(from, to, bucket, timeZone);
  const indexOf = (ms) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= ms) low = middle; else high = middle - 1;
    }
    return low;
  };
  const buckets = starts.map((start) => ({ start, covered: 0, entries: 0, exits: 0, passersby: 0, occSum: 0, occMax: 0, tableSec: 0 }));
  const multiDay = bucket === "day";
  const profile = multiDay ? Array.from({ length: 24 }, (_, hour) => ({ hour, covered: 0, entries: 0, passersby: 0, occSum: 0 })) : null;
  const heat = new Array(HEAT_COLS * HEAT_ROWS).fill(0);
  const tableIds = new Map((camera.tables || []).map((table) => [table.id, table]));
  const tableTotals = new Map([...tableIds.keys()].map((id) => [id, { occupiedSec: 0, sessions: 0, covered: 0, perBucket: starts.map(() => 0) }]));
  let covered = 0;
  let entries = 0;
  let exits = 0;
  let passersby = 0;
  let occSum = 0;
  let peak = 0;
  let peakAt = null;
  let dwellSum = 0;
  let dwellCount = 0;
  let staleBefore = null;

  for (const doc of hours) {
    const hourMs = new Date(doc.hour).getTime();
    if (hourMs < from || hourMs >= to) continue;
    if (doc.markupVersion !== null && doc.markupVersion !== undefined && doc.markupVersion < (camera.markupVersion || 0)) {
      staleBefore = Math.max(staleBefore ?? 0, hourMs + HOUR_MS);
    }
    const local = multiDay ? partsIn(hourMs, timeZone).hour : 0;
    let hourCovered = 0;
    for (let minute = 0; minute < 60; minute += 1) {
      const t = hourMs + minute * 60_000;
      const target = buckets[indexOf(t)];
      const cov = covAt(doc, minute);
      hourCovered += cov;
      target.covered += cov;
      covered += cov;
      const e = doc.entries?.[minute] ?? 0;
      const x = doc.exits?.[minute] ?? 0;
      const p = doc.passersby?.[minute] ?? 0;
      const o = doc.occSum?.[minute] ?? 0;
      const m = doc.occMax?.[minute] ?? 0;
      target.entries += e;
      target.exits += x;
      target.passersby += p;
      target.occSum += o;
      target.occMax = Math.max(target.occMax, m);
      entries += e;
      exits += x;
      passersby += p;
      occSum += o;
      if (m > peak) {
        peak = m;
        peakAt = t;
      }
      if (profile) {
        profile[local].covered += cov;
        profile[local].entries += e;
        profile[local].passersby += p;
        profile[local].occSum += o;
      }
    }
    dwellSum += doc.dwellSum || 0;
    dwellCount += doc.dwellCount || 0;
    for (const [cell, value] of doc.heat || []) if (cell >= 0 && cell < heat.length) heat[cell] += value;
    const bucketIndex = indexOf(hourMs);
    for (const table of doc.tables || []) {
      const totals = tableTotals.get(table.id);
      if (!totals) continue;
      totals.occupiedSec += table.occupiedSec || 0;
      totals.sessions += table.sessions || 0;
      totals.perBucket[bucketIndex] += table.occupiedSec || 0;
    }
    for (const totals of tableTotals.values()) totals.covered += hourCovered;
  }

  const rate = (part, whole) => (whole > 0 ? round(Math.min(1, part / whole), 3) : null);
  const hasHall = Boolean(regions.inHall);
  const tables = regions.tables.length ? [...tableTotals.entries()].map(([id, totals]) => ({
    id,
    label: tableIds.get(id)?.label || id,
    occupiedSec: Math.round(totals.occupiedSec),
    rate: rate(totals.occupiedSec, totals.covered),
    sessions: totals.sessions,
    avgSessionSec: totals.sessions ? Math.round(totals.occupiedSec / totals.sessions) : null,
    perBucket: totals.perBucket,
  })) : null;
  const tableCount = tables?.length || 0;

  return {
    period: { key: periodKey, from: new Date(from).toISOString(), to: new Date(to).toISOString(), timezone: timeZone },
    kind: regions.kind,
    markup: {
      entryLine: Boolean(regions.line),
      passZone: Boolean(regions.passZone),
      hallZone: Boolean(polygonOf(camera.hallZone)),
      tables: regions.tables.length,
    },
    coverage: { coveredSec: covered, spanSec: Math.max(0, Math.round((Math.min(to, nowMs) - from) / 1000)) },
    entries: regions.line ? { total: entries, exits } : null,
    passersby: regions.passZone ? { total: passersby, conversion: entries + passersby > 0 ? round(entries / (entries + passersby), 3) : null } : null,
    occupancy: hasHall ? { peak, peakAt: peakAt === null ? null : new Date(peakAt).toISOString(), average: covered ? round(occSum / covered) : 0 } : null,
    dwell: hasHall ? { averageSec: dwellCount ? Math.round(dwellSum / dwellCount) : null, tracks: dwellCount, minSec: MIN_DWELL_SEC } : null,
    tables: tables ? {
      items: tables.map(({ perBucket: _perBucket, ...item }) => item),
      averageRate: tables.some((item) => item.rate !== null) ? round(tables.reduce((sum, item) => sum + (item.rate || 0), 0) / tableCount, 3) : null,
      avgSessionSec: tables.reduce((sum, item) => sum + item.sessions, 0)
        ? Math.round(tables.reduce((sum, item) => sum + item.occupiedSec, 0) / tables.reduce((sum, item) => sum + item.sessions, 0))
        : null,
    } : null,
    series: {
      bucket,
      buckets: buckets.map((item, index) => {
        const has = item.covered > 0;
        return {
          start: new Date(item.start).toISOString(),
          future: item.start > nowMs,
          coveredSec: item.covered,
          entries: regions.line && has ? item.entries : null,
          exits: regions.line && has ? item.exits : null,
          passersby: regions.passZone && has ? item.passersby : null,
          occupancyAvg: hasHall && has ? round(item.occSum / item.covered) : null,
          occupancyMax: hasHall && has ? item.occMax : null,
          tableRate: tables && has ? rate(tables.reduce((sum, table) => sum + table.perBucket[index], 0), item.covered * tableCount) : null,
        };
      }),
    },
    tableGrid: tables ? tables.map((table) => ({
      id: table.id,
      label: table.label,
      rates: buckets.map((item, index) => (item.covered > 0 ? rate(table.perBucket[index], item.covered) : null)),
    })) : null,
    profile: profile ? profile.map((item) => {
      const hoursCovered = item.covered / 3600;
      return {
        hour: item.hour,
        coveredSec: item.covered,
        entriesPerHour: regions.line && item.covered ? round(item.entries / hoursCovered) : null,
        passersbyPerHour: regions.passZone && item.covered ? round(item.passersby / hoursCovered) : null,
        occupancyAvg: hasHall && item.covered ? round(item.occSum / item.covered) : null,
      };
    }) : null,
    heatmap: { cols: HEAT_COLS, rows: HEAT_ROWS, cells: heat.map((value) => round(value)) },
    markupStaleBefore: staleBefore === null ? null : new Date(staleBefore).toISOString(),
  };
}

// "Right now" view from the latest positions reported by the node. Everyone inside counts as "in the hall" except
// people in the door opening / on the sidewalk and staff behind the counter: a guest at the counter has their feet
// hidden by it, so their foot point often lands just outside a hall zone drawn along the counter's edge.
function nowState({ camera, people, tableSince = new Map(), nowMs = Date.now() }) {
  const regions = cameraRegions(camera);
  let inHall = 0;
  let outside = 0;
  let elsewhere = 0;
  for (const [, x, y] of people) {
    const p = { x, y };
    if (regions.inPass(p)) outside += 1;
    else if (regions.inStaff?.(p)) elsewhere += 1;
    else if (regions.inHall) inHall += 1;
    else elsewhere += 1;
  }
  const tables = regions.tables.map((table) => {
    const occupied = people.some(([, x, y]) => pointInPolygon({ x, y }, table.polygon));
    if (occupied && !tableSince.has(table.id)) tableSince.set(table.id, nowMs);
    if (!occupied) tableSince.delete(table.id);
    return { id: table.id, occupied, sinceSec: occupied ? Math.round((nowMs - tableSince.get(table.id)) / 1000) : null };
  });
  // `outside` = in the door opening / on the sidewalk; `elsewhere` = in the staff zone (behind the counter).
  return { people: people.length, inHall: regions.inHall ? inHall : null, outside, elsewhere, tables };
}

module.exports = {
  computeHourStats,
  aggregateStats,
  nowState,
  cameraRegions,
  presenceSeconds,
  passerbyEvents,
  tableSessions,
  expandPolygon,
  periodRange,
  startOfLocalDay,
  partsIn,
  PERIODS,
  HOUR_MS,
  polygonOf,
  constants: {
    PRESENCE_GAP_SEC, MIN_DWELL_SEC, TABLE_EXPAND, TABLE_MIN_SESSION_SEC, TABLE_MERGE_GAP_SEC, DOOR_SHARE, TRACK_IDLE_SEC, CONTEXT_MS,
  },
};
