// Guests and staff of a venue: day journal, people of the day, staff directory and shifts, owner corrections.

const express = require("express");
const mongoose = require("mongoose");
const Camera = require("../models/camera");
const CameraHour = require("../models/camera-hour");
const LiveTrack = require("../models/live-track");
const Node = require("../models/node");
const Person = require("../models/person");
const Staff = require("../models/staff");
const Visit = require("../models/visit");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const channel = require("../services/node-channel");
const { getNow } = require("../services/live-pipeline");
const { cameraRegions, partsIn, passerbyEvents } = require("../services/live-metrics");
const { isNodeOnline } = require("../services/nodes");
const { ownedVenue } = require("../services/ownership");
const people = require("../services/people");
const pm = require("../services/people-metrics");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_MS = 24 * 3_600_000;

async function ownedById(Model, id, ownerId, label) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new ApiError(404, `${label} not found`, `${label.toUpperCase()}_NOT_FOUND`);
  const doc = await Model.findOne({ _id: id, ownerId });
  if (!doc) throw new ApiError(404, `${label} not found`, `${label.toUpperCase()}_NOT_FOUND`);
  return doc;
}

async function dayOf(req, venue) {
  const timeZone = venue.timezone || "Europe/Kyiv";
  const today = pm.localDay(Date.now(), timeZone);
  const day = req.validated?.query?.day || today;
  if (!DAY_PATTERN.test(day) || day > today) throw new ApiError(422, "Unknown day", "INVALID_DAY");
  return { day, today, timeZone, ...pm.dayRange(day, timeZone) };
}

// Cameras that can tell guests apart: live, inside or hybrid.
async function guestCameras(venue, ownerId) {
  return Camera.find({ venueId: venue._id, ownerId, source: "rtsp", kind: { $ne: "outdoor" } })
    .select(`name ${people.CAMERA_FIELDS} nodeId`).lean();
}

function personView(person, extra = {}) {
  return {
    id: String(person._id ?? person.id), // lean docs have _id, toObject() output has id
    no: person.no,
    role: person.role,
    staffId: person.staffId ? String(person.staffId) : null,
    review: person.review ? { kind: person.review.kind, suggestedStaffId: person.review.suggestedStaffId ? String(person.review.suggestedStaffId) : null } : null,
    firstSeenAt: person.firstSeenAt,
    lastSeenAt: person.lastSeenAt,
    visitCount: person.visitCount,
    hallSec: person.hallSec,
    staffSec: person.staffSec,
    hasShot: Boolean(person.shot?.ref) && Date.now() - new Date(person.shot.at).getTime() < ARCHIVE_MS,
    ...extra,
  };
}

function visitView(visit, person) {
  const end = visit.endAt ? new Date(visit.endAt) : new Date(visit.lastSeenAt);
  return {
    id: String(visit._id),
    personId: String(visit.personId),
    no: person?.no ?? null,
    role: person?.role ?? "guest",
    staffId: person?.staffId ? String(person.staffId) : null,
    cameraId: String(visit.cameraId),
    startAt: visit.startAt,
    endAt: visit.endAt,
    lastSeenAt: visit.lastSeenAt,
    active: visit.active,
    durationSec: Math.max(0, Math.round((end.getTime() - new Date(visit.startAt).getTime()) / 1000)),
    hallSec: visit.hallSec,
    tables: visit.tables,
    enteredBy: visit.enteredBy,
    exitedBy: visit.exitedBy,
    recordable: Date.now() - new Date(visit.startAt).getTime() < ARCHIVE_MS - 5 * 60_000,
  };
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

// Uncovered stretches (no analysis) of the day, merged to ≥ 10 min, for hatching on the timeline.
function coverageGaps(hours, from, to, nowMs) {
  const covered = new Set();
  for (const doc of hours) {
    const hourMs = new Date(doc.hour).getTime();
    for (let minute = 0; minute < 60; minute += 1) {
      if (doc.cov?.[minute] ?? doc.cov?.[String(minute)]) covered.add(hourMs + minute * 60_000);
    }
  }
  const gaps = [];
  let start = null;
  const end = Math.min(to, nowMs);
  for (let t = from; t < end; t += 60_000) {
    if (!covered.has(t)) {
      if (start === null) start = t;
    } else if (start !== null) {
      if (t - start >= 10 * 60_000) gaps.push({ from: new Date(start), to: new Date(t) });
      start = null;
    }
  }
  if (start !== null && end - start >= 10 * 60_000) gaps.push({ from: new Date(start), to: new Date(end) });
  return gaps;
}

// Passers-by of the day with proof (best frame, clip time), from raw tracks with the same rule as the hourly counts.
async function dayPassers(venue, ownerId, from, to, timeZone, nowMs) {
  const cameras = await Camera.find({ venueId: venue._id, ownerId, source: "rtsp", kind: { $ne: "indoor" } })
    .select(`name ${people.CAMERA_FIELDS}`).lean();
  const withZone = cameras.filter((camera) => cameraRegions(camera).passZone);
  if (!withZone.length) return null;
  const tracks = await LiveTrack.find({ cameraId: { $in: withZone.map((camera) => camera._id) }, startAt: { $lt: new Date(to) }, endAt: { $gte: new Date(from) } })
    .select("cameraId startAt endAt final points cls bike shot maxConf").lean();
  const items = [];
  for (const camera of withZone) {
    const own = tracks.filter((track) => String(track.cameraId) === String(camera._id));
    for (const event of passerbyEvents(own, cameraRegions(camera), nowMs)) {
      if (event.t * 1000 < from || event.t * 1000 >= to) continue;
      const shot = event.track.shot;
      items.push({
        id: String(event.track._id),
        cameraId: String(camera._id),
        at: new Date(Math.round(event.t * 1000)),
        from: new Date(Math.round(event.from * 1000)),
        to: new Date(Math.round(event.to * 1000)),
        kind: event.kind,
        hasShot: Boolean(shot?.ref) && nowMs - new Date(shot.at).getTime() < ARCHIVE_MS - 60_000,
      });
    }
  }
  items.sort((a, b) => b.at - a.at);
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, pedestrians: 0, cyclists: 0 }));
  for (const item of items) byHour[partsIn(item.at.getTime(), timeZone).hour][item.kind === "cyclist" ? "cyclists" : "pedestrians"] += 1;
  return {
    pedestrians: items.filter((item) => item.kind === "pedestrian").length,
    cyclists: items.filter((item) => item.kind === "cyclist").length,
    byHour,
    items: items.slice(0, 300),
  };
}

// Simplified foot-point path of every visit (≤ 60 points) for the "routes" panel.
async function visitPaths(visits) {
  if (!visits.length) return {};
  const keys = visits.flatMap((visit) => visit.trackKeys);
  const tracks = await LiveTrack.find({ cameraId: { $in: [...new Set(visits.map((visit) => String(visit.cameraId)))] }, key: { $in: keys } })
    .select("key startAt points").lean();
  const byKey = new Map(tracks.map((track) => [track.key, track]));
  return Object.fromEntries(visits.map((visit) => {
    const points = visit.trackKeys.flatMap((key) => (byKey.has(key) ? pm.absolutePoints(byKey.get(key)) : [])).sort((a, b) => a[0] - b[0]);
    const step = Math.max(1, Math.ceil(points.length / 60));
    const sampled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
    return [String(visit._id), sampled.map(([t, x, y]) => [Math.round(t), Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])];
  }));
}

// ---- venue-scoped (mounted under /api/venues) ----

const venues = express.Router();

venues.get("/:venueId/guests", validate(schemas.dayQuery, "query"), asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const { day, today, timeZone, from, to } = await dayOf(req, venue);
  const cameras = await guestCameras(venue, req.user._id);
  const nowMs = Date.now();
  const [persons, visits, hours, lastWeek] = await Promise.all([
    Person.find({ venueId: venue._id, day }).lean(),
    Visit.find({ venueId: venue._id, day }).sort({ startAt: 1 }).lean(),
    CameraHour.find({ cameraId: { $in: cameras.map((camera) => camera._id) }, hour: { $gte: new Date(from - 3_600_000), $lt: new Date(to) } })
      .select("cameraId hour cov occSum entries passersby").lean(),
    Person.countDocuments({ venueId: venue._id, day: pm.localDay(from - 7 * 86_400_000 + 12 * 3_600_000, timeZone), role: "guest", review: null }),
  ]);
  const byId = new Map(persons.map((person) => [String(person._id), person]));
  const guestIds = new Set(persons.filter((person) => person.role === "guest" && !person.review).map((person) => String(person._id)));
  const guestVisits = visits.filter((visit) => guestIds.has(String(visit.personId)));
  const durations = guestVisits.filter((visit) => !visit.active).map((visit) => Math.round((new Date(visit.endAt).getTime() - new Date(visit.startAt).getTime()) / 1000));
  const sumMinutes = (field) => hours.reduce((total, doc) => total + (doc[field] || []).reduce((acc, value, minute) => {
    const t = new Date(doc.hour).getTime() + minute * 60_000;
    return t >= from && t < to ? acc + value : acc;
  }, 0), 0);
  const hasPass = cameras.some((camera) => cameraRegions(camera).passZone);
  const passersby = hasPass ? sumMinutes("passersby") : null;
  const entries = cameras.some((camera) => camera.entryLine) ? sumMinutes("entries") : null;
  let nowInHall = null;
  if (day === today) {
    nowInHall = 0;
    for (const camera of cameras) {
      const state = getNow(camera._id);
      if (state) {
        const presence = await people.presenceNow(camera, nowMs);
        nowInHall += presence.visible + presence.hidden;
      }
    }
  }
  const lastWeekHadData = lastWeek > 0;
  const guestOnlyVisits = visits.filter((visit) => byId.get(String(visit.personId))?.role === "guest");
  const [passers, paths] = await Promise.all([
    dayPassers(venue, req.user._id, from, to, timeZone, nowMs),
    visitPaths(guestOnlyVisits),
  ]);
  res.json({
    guests: {
      day,
      today,
      timezone: timeZone,
      live: day === today,
      from: new Date(from),
      to: new Date(to),
      cameras: cameras.map((camera) => ({ id: String(camera._id), name: camera.name, kind: camera.kind, entryLine: Boolean(camera.entryLine), hallZone: Boolean(camera.hallZone) })),
      kpis: {
        guests: guestIds.size,
        visits: guestVisits.length,
        returning: [...guestIds].filter((id) => guestVisits.filter((visit) => String(visit.personId) === id).length >= 2).length,
        avgVisitSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
        medianVisitSec: median(durations),
        inHallNow: nowInHall,
        activeVisits: guestVisits.filter((visit) => visit.active).length,
        passersby: passers ? passers.pedestrians + passers.cyclists : passersby,
        conversion: passers && entries !== null && entries + passers.pedestrians + passers.cyclists > 0
          ? Math.round((entries / (entries + passers.pedestrians + passers.cyclists)) * 1000) / 1000 : null,
        lastWeekGuests: lastWeekHadData ? lastWeek : null,
        reviews: persons.filter((person) => person.review).length,
      },
      occupancy: pm.occupancySeries(hours, from, to, 600),
      gaps: coverageGaps(hours, from, to, nowMs),
      persons: persons.filter((person) => person.role === "guest").map((person) => personView(person)),
      visits: guestOnlyVisits.map((visit) => ({ ...visitView(visit, byId.get(String(visit.personId))), path: paths[String(visit._id)] || [] })),
      passers,
    },
  });
}));

venues.get("/:venueId/staff", asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const staff = await Staff.find({ venueId: venue._id, ownerId: req.user._id }).sort({ active: -1, name: 1 });
  res.json({ staff: staff.map((item) => item.toJSON()) });
}));

venues.post("/:venueId/staff", validate(schemas.staffCreate), asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const member = await Staff.create({ ...req.validated.body, venueId: venue._id, ownerId: req.user._id });
  people.invalidateStaff(venue._id);
  res.status(201).json({ staff: member.toJSON() });
}));

venues.get("/:venueId/staff-day", validate(schemas.dayQuery, "query"), asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const { day, today, timeZone, from, to } = await dayOf(req, venue);
  const live = day === today;
  const nowSec = Date.now() / 1000;
  const cameras = await guestCameras(venue, req.user._id);
  const cameraById = new Map(cameras.map((camera) => [String(camera._id), camera]));
  const [staff, persons] = await Promise.all([
    Staff.find({ venueId: venue._id, ownerId: req.user._id }).lean(),
    Person.find({ venueId: venue._id, day, $or: [{ role: "staff" }, { review: { $ne: null } }] }).lean(),
  ]);
  const staffPersons = persons.filter((person) => person.role === "staff" && person.staffId);
  const tracks = staffPersons.length
    ? await LiveTrack.find({ personId: { $in: staffPersons.map((person) => person._id) } }).select("cameraId personId startAt endAt points").lean()
    : [];
  const shifts = staff.filter((member) => member.active || staffPersons.some((person) => String(person.staffId) === String(member._id))).map((member) => {
    const ids = new Set(staffPersons.filter((person) => String(person.staffId) === String(member._id)).map((person) => String(person._id)));
    const own = tracks.filter((track) => ids.has(String(track.personId)));
    // A shift is computed per camera; with several cameras the one that saw the person longest wins.
    let shift = null;
    for (const camera of cameras) {
      const onCamera = own.filter((track) => String(track.cameraId) === String(camera._id));
      const candidate = onCamera.length ? pm.staffShift(onCamera, camera, { nowSec, live }) : null;
      if (candidate && (!shift || candidate.onSiteSec > shift.onSiteSec)) shift = candidate;
    }
    return { staff: { ...member, id: String(member._id), _id: undefined, ownerId: undefined, venueId: undefined }, personIds: [...ids], shift };
  });
  // Waiting at the counter is measured on cameras that have both the staff and the queue zone.
  let waiting = null;
  const waitCameras = cameras.filter((camera) => camera.staffZone && camera.queueZone);
  if (waitCameras.length) {
    const dayTracks = await LiveTrack.find({ cameraId: { $in: waitCameras.map((camera) => camera._id) }, startAt: { $lt: new Date(to) }, endAt: { $gte: new Date(from) } })
      .select("cameraId startAt points").lean();
    waiting = { episodes: [], totalSec: 0 };
    for (const camera of waitCameras) {
      const result = pm.counterWaiting(dayTracks.filter((track) => String(track.cameraId) === String(camera._id)), camera);
      if (!result) continue;
      waiting.episodes.push(...result.episodes.map((episode) => ({ ...episode, cameraId: String(camera._id) })));
      waiting.totalSec += result.totalSec;
    }
    waiting.episodes.sort((a, b) => a.from - b.from);
  }
  res.json({
    staffDay: {
      day,
      today,
      timezone: timeZone,
      live,
      from: new Date(from),
      to: new Date(to),
      zones: {
        staff: cameras.some((camera) => camera.staffZone),
        queue: cameras.some((camera) => camera.queueZone),
        camera: cameras[0] ? { id: String(cameras[0]._id), name: cameras[0].name } : null,
      },
      shifts,
      reviews: persons.filter((person) => person.review).map((person) => personView(person, { cameraName: cameraById.get(String(person.shot?.cameraId))?.name ?? null })),
      waiting,
    },
  });
}));

venues.get("/:venueId/people/summary", asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const day = pm.localDay(Date.now(), venue.timezone || "Europe/Kyiv");
  const reviews = await Person.countDocuments({ venueId: venue._id, day, review: { $ne: null } });
  res.json({ summary: { day, reviews } });
}));

// ---- people of the day (mounted under /api/persons) ----

const persons = express.Router();

persons.get("/:personId", asyncHandler(async (req, res) => {
  const person = await ownedById(Person, req.params.personId, req.user._id, "Person");
  const visits = await Visit.find({ personId: person._id }).sort({ startAt: 1 }).lean();
  const tracks = await LiveTrack.find({ personId: person._id }).select("key cameraId startAt points").lean();
  const paths = Object.fromEntries(visits.map((visit) => {
    const own = tracks.filter((track) => visit.trackKeys.includes(track.key)).flatMap((track) => pm.absolutePoints(track));
    own.sort((a, b) => a[0] - b[0]);
    const step = Math.max(1, Math.ceil(own.length / 240));
    return [String(visit._id), own.filter((_, index) => index % step === 0).map(([t, x, y]) => [Math.round(t), x, y])];
  }));
  res.json({ person: { ...personView(person.toObject()), visits: visits.map((visit) => ({ ...visitView(visit, person), path: paths[String(visit._id)] || [] })) } });
}));

// Thumbnails: the best frame of a person or a passer-by, kept on the node (no longer than its 24 h archive),
// never stored on the server (only a short in-memory cache).
const thumbs = new Map(); // ref:at -> { at, jpeg }
async function sendThumb(res, { cameraId, shot, ownerId }) {
  if (!shot?.ref || Date.now() - new Date(shot.at).getTime() > ARCHIVE_MS - 60_000) throw new ApiError(404, "No frame in the archive", "THUMB_NOT_AVAILABLE");
  const cacheKey = `${shot.ref}:${new Date(shot.at).getTime()}`;
  let cached = thumbs.get(cacheKey);
  if (!cached) {
    const camera = await Camera.findOne({ _id: cameraId, ownerId }).select("nodeId").lean();
    const node = camera?.nodeId ? await Node.findById(camera.nodeId).lean() : null;
    if (!node || !isNodeOnline(node) || !channel.isConnected(node._id)) throw new ApiError(503, "Processing node of this camera is offline", "NODE_OFFLINE");
    const data = await channel.request(node._id, { type: "archive.frame", ref: shot.ref }, 15_000).catch((error) => {
      if (error.code === "THUMB_NOT_AVAILABLE") throw new ApiError(404, "The frame was deleted with the archive", "THUMB_NOT_AVAILABLE");
      throw new ApiError(502, error.message || "Node could not return the frame", "THUMB_FAILED");
    });
    const jpeg = Buffer.from(String(data?.jpeg || ""), "base64");
    if (jpeg.length < 100 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new ApiError(502, "Node returned no frame", "THUMB_FAILED");
    cached = { at: Date.now(), jpeg };
    thumbs.set(cacheKey, cached);
    if (thumbs.size > 300) thumbs.delete(thumbs.keys().next().value);
  }
  res.set("Cache-Control", "private, max-age=3600");
  res.type("image/jpeg").send(cached.jpeg);
}

persons.get("/:personId/thumb", asyncHandler(async (req, res) => {
  const person = await ownedById(Person, req.params.personId, req.user._id, "Person");
  await sendThumb(res, { cameraId: person.shot?.cameraId, shot: person.shot, ownerId: req.user._id });
}));

persons.post("/:personId/role", validate(schemas.personRole), asyncHandler(async (req, res) => {
  const person = await ownedById(Person, req.params.personId, req.user._id, "Person");
  const body = req.validated.body;
  let staffId = null;
  if (body.newStaff) {
    const member = await Staff.create({ ...body.newStaff, venueId: person.venueId, ownerId: req.user._id });
    people.invalidateStaff(person.venueId);
    staffId = member._id;
  } else if (body.staffId) {
    const member = await ownedById(Staff, body.staffId, req.user._id, "Staff");
    if (String(member.venueId) !== String(person.venueId)) throw new ApiError(404, "Staff not found", "STAFF_NOT_FOUND");
    staffId = member._id;
  }
  const result = await people.assignRole(person, { role: staffId ? "staff" : "guest", staffId });
  const brief = (item) => ({ id: String(item._id), no: item.no });
  res.json({
    person: personView(result.person.toObject()),
    merged: result.merged.map(brief),
    demoted: result.demoted.map(brief),
  });
}));

persons.post("/:personId/merge", validate(schemas.personMerge), asyncHandler(async (req, res) => {
  const source = await ownedById(Person, req.params.personId, req.user._id, "Person");
  const target = await ownedById(Person, req.validated.body.intoPersonId, req.user._id, "Person");
  if (String(source._id) === String(target._id) || String(source.venueId) !== String(target.venueId) || source.day !== target.day) {
    throw new ApiError(422, "Only two different people of the same day can be merged", "INVALID_MERGE");
  }
  if (await people.seenApart(source, target)) {
    // Shown as is in the UI.
    throw new ApiError(409, "Це різні люди: камера бачила їх одночасно в різних місцях", "PEOPLE_SEEN_APART");
  }
  const merged = await people.mergePeople(source, target);
  res.json({ person: personView(merged.toObject()) });
}));

// ---- tracks (mounted under /api/tracks): proof frames of passers-by ----

const tracksRouter = express.Router();

tracksRouter.get("/:trackId/thumb", asyncHandler(async (req, res) => {
  const track = await ownedById(LiveTrack, req.params.trackId, req.user._id, "Track");
  await sendThumb(res, { cameraId: track.cameraId, shot: track.shot, ownerId: req.user._id });
}));

// ---- visits (mounted under /api/visits) ----

const visitsRouter = express.Router();

visitsRouter.post("/:visitId/detach", asyncHandler(async (req, res) => {
  const visit = await ownedById(Visit, req.params.visitId, req.user._id, "Visit");
  const timeZone = await people.venueTimezone(visit.venueId);
  const fresh = await people.detachVisit(visit, timeZone);
  res.json({ person: personView(fresh.toObject()) });
}));

// ---- staff directory (mounted under /api/staff) ----

const staffRouter = express.Router();

staffRouter.patch("/:staffId", validate(schemas.staffUpdate), asyncHandler(async (req, res) => {
  const member = await ownedById(Staff, req.params.staffId, req.user._id, "Staff");
  member.set(req.validated.body);
  await member.save();
  people.invalidateStaff(member.venueId);
  res.json({ staff: member.toJSON() });
}));

staffRouter.get("/:staffId/history", asyncHandler(async (req, res) => {
  const member = await ownedById(Staff, req.params.staffId, req.user._id, "Staff");
  const timeZone = await people.venueTimezone(member.venueId);
  const days = [];
  for (let back = 6; back >= 0; back -= 1) days.push(pm.localDay(Date.now() - back * 86_400_000, timeZone));
  const visits = await Visit.aggregate([
    { $match: { venueId: member.venueId, day: { $in: days } } },
    { $lookup: { from: "people", localField: "personId", foreignField: "_id", as: "person" } },
    { $unwind: "$person" },
    { $match: { "person.staffId": member._id } },
    { $group: { _id: "$day", firstAt: { $min: "$startAt" }, lastAt: { $max: "$lastSeenAt" }, visits: { $sum: 1 } } },
  ]);
  const byDay = new Map(visits.map((item) => [item._id, item]));
  res.json({
    history: days.map((day) => {
      const item = byDay.get(day);
      return { day, onSiteSec: item ? Math.round((new Date(item.lastAt).getTime() - new Date(item.firstAt).getTime()) / 1000) : null, visits: item?.visits ?? 0 };
    }),
  });
}));

module.exports = { venues, persons, visits: visitsRouter, staff: staffRouter, tracks: tracksRouter };
