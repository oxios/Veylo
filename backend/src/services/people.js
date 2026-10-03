// Database side of guests and staff: turns live tracks into people of the day ("Гість №N", staff) and visits,
// keeps visits up to date, erases appearance vectors after the day, and labels live boxes.

const Camera = require("../models/camera");
const LiveTrack = require("../models/live-track");
const Person = require("../models/person");
const Staff = require("../models/staff");
const Venue = require("../models/venue");
const Visit = require("../models/visit");
const { nextSeq } = require("../models/counter");
const { cameraRegions } = require("./live-metrics");
const pm = require("./people-metrics");

const { FEAT_MIN_SAMPLES, FEAT_WAIT_SEC, STAFF_ZONE_SEC, SAME_SPOT_GAP_SEC, STITCH_SIM } = pm.constants;
const CAMERA_FIELDS = "ownerId venueId kind entryLine hallZone streetZone doorZone staffZone queueZone tables";
const VEC_GRACE_MS = 2 * 3_600_000; // vectors live until 2 h after the venue's day ends

// ---- small caches ----

const timezones = new Map(); // venueId -> { tz, at }
async function venueTimezone(venueId) {
  const key = String(venueId);
  const cached = timezones.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.tz;
  const venue = await Venue.findById(venueId).select("timezone").lean();
  const tz = venue?.timezone || "Europe/Kyiv";
  timezones.set(key, { tz, at: Date.now() });
  return tz;
}

const staffCache = new Map(); // venueId -> { at, byId: Map }
async function staffDirectory(venueId) {
  const key = String(venueId);
  const cached = staffCache.get(key);
  if (cached && Date.now() - cached.at < 30_000) return cached.byId;
  const items = await Staff.find({ venueId }).lean();
  const byId = new Map(items.map((item) => [String(item._id), item]));
  staffCache.set(key, { at: Date.now(), byId });
  return byId;
}
const invalidateStaff = (venueId) => staffCache.delete(String(venueId));

// Live labels: track key -> person summary (kept for active visits, rebuilt by refreshVisits after a restart).
const trackPeople = new Map(); // cameraId -> Map(trackKey -> personId)
const personInfo = new Map(); // personId -> { no, role, staffId, review, visitStart, venueId }

function rememberTrack(cameraId, key, personId) {
  const id = String(cameraId);
  if (!trackPeople.has(id)) trackPeople.set(id, new Map());
  trackPeople.get(id).set(key, String(personId));
}

function rememberPerson(person, visitStart) {
  const previous = personInfo.get(String(person._id));
  personInfo.set(String(person._id), {
    no: person.no,
    role: person.role,
    staffId: person.staffId ? String(person.staffId) : null,
    review: person.review?.kind ?? null,
    visitStart: visitStart ?? previous?.visitStart ?? new Date(person.lastSeenAt).getTime(),
    venueId: String(person.venueId),
  });
}

/** Labels for the boxes of one live frame: { trackId: { p, no, role, name, color, since, review } }. */
async function labelFrame(cameraId, frame) {
  const keys = trackPeople.get(String(cameraId));
  if (!keys || !frame.session || !Array.isArray(frame.people)) return null;
  const labels = {};
  let venueId = null;
  for (const [trackId] of frame.people) {
    const personId = keys.get(`${frame.session}:${trackId}`);
    const info = personId && personInfo.get(personId);
    if (!info) continue;
    venueId = info.venueId;
    labels[trackId] = { p: personId, no: info.no, role: info.role, since: info.visitStart, review: info.review, staffId: info.staffId };
  }
  if (!venueId) return null;
  const staff = await staffDirectory(venueId);
  for (const label of Object.values(labels)) {
    const member = label.staffId && staff.get(label.staffId);
    if (member) {
      label.name = member.name;
      label.color = member.color;
    }
    delete label.staffId;
  }
  return labels;
}

// ---- assigning tracks to people ----

async function attachToVisit({ person, track, facts, camera, day }) {
  const lastVisit = await Visit.findOne({ personId: person._id }).sort({ startAt: -1 });
  const startSec = new Date(track.startAt).getTime() / 1000;
  if (lastVisit && pm.continuesVisit(lastVisit, startSec)) {
    lastVisit.set({ active: true, endAt: null, exitedBy: null, lastSeenAt: new Date(Math.max(new Date(lastVisit.lastSeenAt).getTime(), new Date(track.endAt).getTime())) });
    if (!lastVisit.trackKeys.includes(track.key)) lastVisit.trackKeys.push(track.key);
    await lastVisit.save();
    return lastVisit;
  }
  const visit = await Visit.create({
    ownerId: camera.ownerId,
    venueId: camera.venueId,
    cameraId: camera._id,
    personId: person._id,
    day,
    startAt: new Date((facts.entryAt ?? facts.firstAt) * 1000),
    lastSeenAt: track.endAt,
    enteredBy: facts.entryAt !== null ? "door" : "hall",
    trackKeys: [track.key],
  });
  await Person.updateOne({ _id: person._id }, { $inc: { visitCount: 1 } });
  return visit;
}

function betterShot(current, candidate) {
  if (!candidate?.box?.length) return false;
  return !current || (candidate.score ?? 0) > (current.score ?? 0) * 1.15;
}

// The track's vector joins the person's only once (when the track is complete), so one long track does not
// outweigh the rest of the day.
async function updatePersonFromTrack(person, track, camera, { mergeVector }) {
  const update = { lastSeenAt: new Date(Math.max(new Date(person.lastSeenAt).getTime(), new Date(track.endAt).getTime())) };
  if (mergeVector && track.feat?.length && track.featN >= FEAT_MIN_SAMPLES) {
    const merged = pm.mergeVectors(person.vec, person.vecN || 0, track.feat, Math.min(track.featN, 50));
    update.vec = merged.vec;
    update.vecN = merged.n;
  }
  if (betterShot(person.shot, track.shot)) update.shot = { cameraId: camera._id, at: track.shot.at, box: track.shot.box, score: track.shot.score, ref: track.shot.ref };
  await Person.updateOne({ _id: person._id }, { $set: update });
}

// The person whose track vanished right where this one started (see pm.stitchCandidate), if the appearance agrees.
async function continuedPerson({ camera, track, points, regions }) {
  const [t, x, y] = points[0];
  if (regions.inPass({ x, y })) return null; // someone appearing in the doorway is a new arrival
  const startMs = new Date(track.startAt).getTime();
  const recent = await LiveTrack.find({
    cameraId: camera._id,
    personId: { $ne: null },
    key: { $ne: track.key },
    endAt: { $gte: new Date(startMs - SAME_SPOT_GAP_SEC * 1000), $lte: new Date(startMs + 1000) },
  }).select("personId startAt endAt").slice("points", -1).lean();
  const candidates = recent.filter((item) => item.points?.length).map((item) => {
    const [offset, lastX, lastY] = item.points[0];
    return { personId: String(item.personId), endSec: new Date(item.startAt).getTime() / 1000 + offset, x: lastX, y: lastY };
  });
  const pick = pm.stitchCandidate({ t, x, y }, candidates);
  if (!pick) return null;
  // Still on another live track at the same time → not a continuation.
  const busy = await LiveTrack.exists({
    cameraId: camera._id,
    personId: pick.personId,
    key: { $ne: track.key },
    endAt: { $gt: new Date(startMs + 1000) },
  });
  if (busy) return null;
  const person = await Person.findById(pick.personId).select("+vec");
  if (!person) return null;
  const featReady = (track.featN || 0) >= FEAT_MIN_SAMPLES && track.feat?.length;
  if (featReady && person.vec?.length && pm.cosine(track.feat, person.vec) < STITCH_SIM) return null;
  return person;
}

// Open visits of this camera's guests who are not on any track right now (see pm.pickHidden).
async function hiddenGuests(cameraId, sinceMs, excludeKey) {
  const visits = await Visit.find({ cameraId, active: true }).select("personId trackKeys").lean();
  if (!visits.length) return [];
  const personIds = visits.map((visit) => visit.personId);
  const [guests, visible] = await Promise.all([
    Person.find({ _id: { $in: personIds }, role: "guest" }).select("+vec").lean(),
    LiveTrack.find({ cameraId, personId: { $in: personIds }, key: { $ne: excludeKey }, endAt: { $gt: new Date(sinceMs) } }).select("personId").lean(),
  ]);
  const seen = new Set(visible.map((item) => String(item.personId)));
  const byId = new Map(guests.map((person) => [String(person._id), person]));
  const result = [];
  for (const visit of visits) {
    const person = byId.get(String(visit.personId));
    if (!person || seen.has(String(person._id))) continue;
    const last = await LiveTrack.findOne({ cameraId, key: { $in: visit.trackKeys } }).sort({ endAt: -1 }).select("startAt").slice("points", -1).lean();
    const point = last?.points?.[0];
    if (point) result.push({ person, x: point[1], y: point[2] });
  }
  return result;
}

async function processTrack({ camera, key, timeZone, nowMs }) {
  const track = await LiveTrack.findOne({ cameraId: camera._id, key }).select("+feat").lean();
  if (!track) return;
  if (track.personId) {
    const person = await Person.findById(track.personId).select("+vec");
    if (!person) return;
    await updatePersonFromTrack(person, track, camera, { mergeVector: track.final });
    rememberTrack(camera._id, key, person._id);
    if (!personInfo.has(String(person._id))) rememberPerson(person);
    return;
  }
  const regions = cameraRegions(camera);
  if (regions.kind === "outdoor" || track.cls === "bicycle") return; // passers-by and bicycles are not guests
  const points = pm.absolutePoints(track);
  if (!points.length) return;
  const facts = pm.trackFacts(points, regions);
  const day = pm.localDay(new Date(track.startAt).getTime(), timeZone);
  const featReady = (track.featN || 0) >= FEAT_MIN_SAMPLES && track.feat?.length;
  let person = await continuedPerson({ camera, track, points, regions });
  if (!person && !pm.insideVenue(facts)) return;

  let decision = { decision: "none", personId: null, sim: 0 };
  if (!person && featReady) {
    const people = await Person.find({ venueId: camera.venueId, day, vecN: { $gt: 0 } }).select("+vec role staffId no lastSeenAt").lean();
    // A person cannot be on two tracks of the same camera at once.
    const overlapping = await LiveTrack.find({
      cameraId: camera._id,
      personId: { $in: people.map((item) => item._id) },
      key: { $ne: key },
      startAt: { $lt: track.endAt },
      endAt: { $gt: new Date(new Date(track.startAt).getTime() + 1000) },
    }).select("personId").lean();
    const busy = new Set(overlapping.map((item) => String(item.personId)));
    decision = pm.chooseMatch(track.feat, people.map((item) => ({ id: String(item._id), vec: item.vec, role: item.role, busy: busy.has(String(item._id)) })));
    if (decision.decision === "match") person = await Person.findById(decision.personId).select("+vec");
  }

  // Not a new arrival (no entry) → one of the guests already inside who is hidden from the camera right now.
  if (!person && facts.entryAt === null && regions.line && !(facts.staffSec >= pm.constants.STAFF_ZONE_SEC)) {
    const hidden = await hiddenGuests(camera._id, new Date(track.startAt).getTime() + 1000, key);
    const pick = pm.pickHidden({ x: points[0][1], y: points[0][2] }, hidden.map((item) => ({
      personId: String(item.person._id),
      x: item.x,
      y: item.y,
      sim: featReady && item.person.vec?.length ? pm.cosine(track.feat, item.person.vec) : null,
    })));
    if (pick) person = await Person.findById(pick.personId).select("+vec");
  }

  if (!person) {
    const kind = pm.newPersonKind(facts, { requireEntry: Boolean(regions.line) });
    if (!kind) return;
    const ageSec = nowMs / 1000 - facts.firstAt;
    if (!featReady && ageSec < FEAT_WAIT_SEC && !track.final) return; // give the node a moment to send the vector
    const { to } = pm.dayRange(day, timeZone);
    const no = await nextSeq(`${camera.venueId}:${day}`);
    const startMs = (facts.entryAt ?? facts.firstAt) * 1000;
    person = await Person.create({
      ownerId: camera.ownerId,
      venueId: camera.venueId,
      day,
      no,
      role: "guest",
      review: kind === "staff_candidate"
        ? { kind: "staff_candidate", suggestedStaffId: null, at: new Date(nowMs) }
        : decision.decision === "uncertain_staff"
          ? { kind: "staff_uncertain", suggestedStaffId: (await Person.findById(decision.personId).select("staffId").lean())?.staffId ?? null, at: new Date(nowMs) }
          : null,
      firstSeenAt: new Date(startMs),
      lastSeenAt: track.endAt,
      vec: featReady ? track.feat : undefined,
      vecN: featReady ? Math.min(track.featN, 50) : 0,
      vecExpiresAt: new Date(to + VEC_GRACE_MS),
      shot: track.shot?.box?.length ? { cameraId: camera._id, at: track.shot.at, box: track.shot.box, score: track.shot.score, ref: track.shot.ref } : null,
    });
  } else {
    await updatePersonFromTrack(person, track, camera, { mergeVector: true });
  }

  await LiveTrack.updateOne({ _id: track._id }, { $set: { personId: person._id } });
  const visit = await attachToVisit({ person, track, facts, camera, day });
  rememberTrack(camera._id, key, person._id);
  rememberPerson(await Person.findById(person._id).lean(), new Date(visit.startAt).getTime());
}

/** Called after every observation batch with the keys of the tracks it touched. Never throws. */
async function processTracks({ camera, keys, nowMs = Date.now(), log = console.error }) {
  if (!keys.length) return;
  try {
    const full = await Camera.findById(camera._id).select(CAMERA_FIELDS).lean();
    if (!full || full.kind === "outdoor") return;
    const timeZone = await venueTimezone(full.venueId);
    for (const key of keys) await processTrack({ camera: full, key, timeZone, nowMs });
  } catch (error) {
    log(`[people] assigning tracks failed: ${error.message}`);
  }
}

// ---- keeping visits up to date ----

async function refreshVisit(visit, camera, nowMs) {
  const tracks = await LiveTrack.find({ cameraId: visit.cameraId, key: { $in: visit.trackKeys } }).select("key startAt endAt final points").lean();
  const stats = pm.visitStats(tracks, camera);
  if (!stats) return;
  const allFinal = tracks.every((track) => track.final || nowMs - new Date(track.endAt).getTime() > 60_000);
  const closing = pm.visitClosing({ stats, allFinal, nowSec: nowMs / 1000 });
  visit.set({
    startAt: new Date(Math.min(new Date(visit.startAt).getTime(), stats.startAt * 1000)),
    lastSeenAt: new Date(stats.lastSeenAt * 1000),
    hallSec: stats.hallSec,
    staffSec: stats.staffSec,
    tables: stats.tables,
  });
  if (closing.close) visit.set({ active: false, endAt: new Date(closing.endAt * 1000), exitedBy: closing.exitedBy });
  await visit.save();
  if (!closing.close) for (const key of visit.trackKeys) rememberTrack(visit.cameraId, key, visit.personId);
}

async function refreshPersonTotals(personId) {
  const visits = await Visit.find({ personId }).select("hallSec staffSec lastSeenAt startAt").lean();
  const person = await Person.findById(personId);
  if (!person) return;
  person.hallSec = visits.reduce((sum, visit) => sum + (visit.hallSec || 0), 0);
  person.staffSec = visits.reduce((sum, visit) => sum + (visit.staffSec || 0), 0);
  person.visitCount = visits.length;
  if (person.role === "guest" && !person.review && !person.reviewDismissed && person.staffSec >= STAFF_ZONE_SEC) {
    person.review = { kind: "staff_candidate", suggestedStaffId: null, at: new Date() };
  }
  await person.save();
  const active = visits.find((visit) => !visit.endAt);
  rememberPerson(person, active ? new Date(active.startAt).getTime() : undefined);
}

async function refreshVisits({ nowMs = Date.now() } = {}) {
  const visits = await Visit.find({ active: true }).limit(500);
  const cameras = new Map();
  const touched = new Set();
  for (const visit of visits) {
    const id = String(visit.cameraId);
    if (!cameras.has(id)) cameras.set(id, await Camera.findById(visit.cameraId).select(CAMERA_FIELDS).lean());
    const camera = cameras.get(id);
    if (!camera) {
      visit.set({ active: false, endAt: visit.lastSeenAt, exitedBy: "lost" });
      await visit.save();
      continue;
    }
    await refreshVisit(visit, camera, nowMs);
    touched.add(String(visit.personId));
  }
  for (const personId of touched) await refreshPersonTotals(personId);
  // Labels of tracks whose visits are over are no longer needed.
  for (const [cameraId, keys] of trackPeople) {
    const activeIds = new Set(visits.filter((visit) => visit.active && String(visit.cameraId) === cameraId).map((visit) => String(visit.personId)));
    for (const [key, personId] of keys) if (!activeIds.has(personId)) keys.delete(key);
    if (!keys.size) trackPeople.delete(cameraId);
  }
  return visits.length;
}

/**
 * Guests who entered, have not left and are not visible right now (seated behind the showcase, behind furniture):
 * they are still in the hall. A visit is open until an exit through the door or 3 min without the person.
 */
async function hiddenInside(cameraId, nowMs = Date.now()) {
  return (await hiddenGuests(cameraId, nowMs - 5000, null)).length;
}

// Appearance vectors are erased once their day is over (+ a short grace period for late batches).
async function expireVectors(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const people = await Person.updateMany({ vecExpiresAt: { $lte: now } }, { $unset: { vec: 1 }, $set: { vecN: 0, vecExpiresAt: null } });
  const tracks = await LiveTrack.updateMany({ featExpiresAt: { $lte: now } }, { $unset: { feat: 1 }, $set: { featExpiresAt: null } });
  return people.modifiedCount + tracks.modifiedCount;
}

// ---- owner corrections ----

/** Marks a person as a staff member (or back to a guest); their visits follow. */
async function assignRole(person, { staffId = null, role }) {
  person.role = role;
  person.staffId = role === "staff" ? staffId : null;
  person.review = null;
  if (role === "guest") person.reviewDismissed = true;
  await person.save();
  rememberPerson(person);
  return person;
}

/** Moves everything of `source` into `target` (the tracker or ReID split one person into two numbers). */
async function mergePeople(source, target) {
  await LiveTrack.updateMany({ personId: source._id }, { $set: { personId: target._id } });
  await Visit.updateMany({ personId: source._id }, { $set: { personId: target._id } });
  const sourceFull = await Person.findById(source._id).select("+vec");
  const targetFull = await Person.findById(target._id).select("+vec");
  const merged = pm.mergeVectors(targetFull.vec, targetFull.vecN || 0, sourceFull.vec, sourceFull.vecN || 0);
  targetFull.set({
    firstSeenAt: new Date(Math.min(new Date(targetFull.firstSeenAt).getTime(), new Date(sourceFull.firstSeenAt).getTime())),
    lastSeenAt: new Date(Math.max(new Date(targetFull.lastSeenAt).getTime(), new Date(sourceFull.lastSeenAt).getTime())),
    shot: betterShot(targetFull.shot, sourceFull.shot) ? sourceFull.shot : targetFull.shot,
  });
  if (merged.vec?.length) targetFull.set({ vec: merged.vec, vecN: merged.n });
  await targetFull.save();
  await sourceFull.deleteOne();
  for (const keys of trackPeople.values()) for (const [key, personId] of keys) if (personId === String(source._id)) keys.set(key, String(target._id));
  personInfo.delete(String(source._id));
  await refreshPersonTotals(target._id);
  return targetFull;
}

/** "These are different people": the visit gets its own new number. */
async function detachVisit(visit, timeZone) {
  const person = await Person.findById(visit.personId);
  const no = await nextSeq(`${visit.venueId}:${visit.day}`);
  const tracks = await LiveTrack.find({ cameraId: visit.cameraId, key: { $in: visit.trackKeys } }).select("+feat featN shot").lean();
  const feats = tracks.filter((track) => track.feat?.length);
  let vec = null;
  let vecN = 0;
  for (const track of feats) ({ vec, n: vecN } = pm.mergeVectors(vec, vecN, track.feat, track.featN || 1));
  const shotTrack = tracks.filter((track) => track.shot?.box?.length).sort((a, b) => (b.shot.score || 0) - (a.shot.score || 0))[0];
  const { to } = pm.dayRange(visit.day, timeZone);
  const fresh = await Person.create({
    ownerId: visit.ownerId,
    venueId: visit.venueId,
    day: visit.day,
    no,
    role: "guest",
    firstSeenAt: visit.startAt,
    lastSeenAt: visit.lastSeenAt,
    vec: vec ?? undefined,
    vecN,
    vecExpiresAt: vec ? new Date(to + VEC_GRACE_MS) : null,
    shot: shotTrack ? { cameraId: visit.cameraId, ...shotTrack.shot } : null,
  });
  await LiveTrack.updateMany({ cameraId: visit.cameraId, key: { $in: visit.trackKeys } }, { $set: { personId: fresh._id } });
  visit.personId = fresh._id;
  await visit.save();
  for (const key of visit.trackKeys) if (visit.active) rememberTrack(visit.cameraId, key, fresh._id);
  await refreshPersonTotals(fresh._id);
  if (person) await refreshPersonTotals(person._id);
  return fresh;
}

module.exports = {
  processTracks,
  refreshVisits,
  hiddenInside,
  expireVectors,
  labelFrame,
  assignRole,
  mergePeople,
  detachVisit,
  staffDirectory,
  invalidateStaff,
  venueTimezone,
  CAMERA_FIELDS,
};
