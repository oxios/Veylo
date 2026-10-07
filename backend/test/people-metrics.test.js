const test = require("node:test");
const assert = require("node:assert/strict");
const pm = require("../src/services/people-metrics");
const { cameraRegions } = require("../src/services/live-metrics");

const square = (x, y, size = 0.1) => ({ points: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }] });
// A door line at y = 0.3 (inside = below it), hall below, staff zone at the right.
const camera = {
  kind: "hybrid",
  entryLine: { a: { x: 0, y: 0.3 }, b: { x: 1, y: 0.3 }, inside: "positive" },
  doorZone: square(0, 0, 0.25),
  hallZone: { points: [{ x: 0, y: 0.32 }, { x: 0.7, y: 0.32 }, { x: 0.7, y: 1 }, { x: 0, y: 1 }] },
  staffZone: { points: [{ x: 0.75, y: 0.4 }, { x: 1, y: 0.4 }, { x: 1, y: 1 }, { x: 0.75, y: 1 }] },
  queueZone: { points: [{ x: 0.55, y: 0.4 }, { x: 0.7, y: 0.4 }, { x: 0.7, y: 1 }, { x: 0.55, y: 1 }] },
  tables: [{ id: "t1", label: "Крісло", points: square(0.2, 0.6, 0.1).points }],
};
const startAt = new Date("2026-10-03T09:00:00Z");
const base = startAt.getTime() / 1000;
// Points every 0.5 s along a list of [x, y] waypoints, `sec` seconds per waypoint.
function walk(waypoints, sec = 2) {
  const points = [];
  let t = 0;
  for (const [x, y] of waypoints) {
    for (let i = 0; i < sec * 2; i += 1) points.push([t += 0.5, x, y]);
  }
  return points;
}
const track = (points, offsetSec = 0, extra = {}) => ({ startAt: new Date(startAt.getTime() + offsetSec * 1000), points, ...extra });

test("local day and its range follow the venue time zone", () => {
  assert.equal(pm.localDay(Date.parse("2026-10-03T22:30:00Z"), "Europe/Kyiv"), "2026-10-04");
  const { from, to } = pm.dayRange("2026-10-04", "Europe/Kyiv");
  assert.equal(new Date(from).toISOString(), "2026-10-03T21:00:00.000Z");
  assert.equal(to - from, 24 * 3_600_000);
});

test("a guest number needs an entry through the threshold (30 s in the hall only without a threshold line)", () => {
  const regions = cameraRegions(camera);
  const entered = pm.trackFacts(pm.absolutePoints(track(walk([[0.4, 0.2], [0.4, 0.5]], 2))), regions);
  assert.notEqual(entered.entryAt, null);
  assert.equal(pm.newPersonKind(entered, { requireEntry: true }), "guest");
  const short = pm.trackFacts(pm.absolutePoints(track(walk([[0.4, 0.5]], 10))), regions);
  assert.equal(pm.newPersonKind(short, { requireEntry: false }), null);
  assert.ok(pm.insideVenue(short), "10 s inside is enough to continue a known person's day");
  const long = pm.trackFacts(pm.absolutePoints(track(walk([[0.4, 0.5]], 31))), regions);
  assert.equal(pm.newPersonKind(long, { requireEntry: true }), null, "nobody materialises in the hall");
  assert.equal(pm.newPersonKind(long, { requireEntry: true, nobodyHidden: true }), "guest_unseen", "inside before the camera started");
  assert.equal(pm.newPersonKind(short, { requireEntry: true, nobodyHidden: true }), null);
  assert.equal(pm.newPersonKind(long, { requireEntry: false }), "guest");
  const barista = pm.trackFacts(pm.absolutePoints(track(walk([[0.9, 0.6]], 61))), regions);
  assert.equal(pm.newPersonKind(barista, { requireEntry: true }), "staff_candidate");
  const passerby = pm.trackFacts(pm.absolutePoints(track(walk([[0.1, 0.1], [0.2, 0.1]], 3))), regions);
  assert.equal(pm.insideVenue(passerby), false);
});

test("staff zone time is not hall time", () => {
  const facts = pm.trackFacts(pm.absolutePoints(track(walk([[0.9, 0.6]], 20))), cameraRegions(camera));
  assert.equal(facts.hallSec, 0);
  assert.ok(facts.staffSec >= 19);
});

test("matching requires a high similarity and a clear margin; busy people are skipped", () => {
  const a = pm.normalize([1, 0, 0]);
  const b = pm.normalize([0.9, 0.1, 0]);
  const c = pm.normalize([0, 1, 0]);
  assert.equal(pm.chooseMatch(a, [{ id: "1", vec: b, role: "guest" }, { id: "2", vec: c, role: "guest" }]).decision, "match");
  assert.equal(pm.chooseMatch(a, [{ id: "1", vec: b, role: "guest", busy: true }]).decision, "none");
  // Two equally similar people: ambiguous → no match.
  const twin = pm.normalize([0.9, 0, 0.1]);
  assert.equal(pm.chooseMatch(a, [{ id: "1", vec: b, role: "guest" }, { id: "2", vec: twin, role: "guest" }]).decision, "none");
  // Looks somewhat like a staff member → ask the owner.
  const staffish = pm.normalize([0.75, 0.66, 0]);
  const result = pm.chooseMatch(a, [{ id: "s", vec: staffish, role: "staff" }]);
  assert.equal(result.decision, "uncertain_staff");
});

test("a new track continues the nearest person who vanished there a moment ago", () => {
  const candidates = [
    { personId: "a", endSec: 100, x: 0.5, y: 0.5 },
    { personId: "b", endSec: 105, x: 0.55, y: 0.52 },
    { personId: "c", endSec: 60, x: 0.5, y: 0.5 },
  ];
  assert.equal(pm.stitchCandidate({ t: 108, x: 0.56, y: 0.52 }, candidates).personId, "b");
  assert.equal(pm.stitchCandidate({ t: 108, x: 0.9, y: 0.9 }, candidates), null, "too far");
  assert.equal(pm.stitchCandidate({ t: 140, x: 0.62, y: 0.6 }, candidates), null, "too late for a nearby spot");
  assert.equal(pm.stitchCandidate({ t: 200, x: 0.51, y: 0.5 }, candidates).personId, "a", "the same spot (a seated guest) waits 3 min");
  assert.equal(pm.stitchCandidate({ t: 300, x: 0.51, y: 0.5 }, candidates), null);
});

test("a hall track without an entry continues a hidden guest: appearance first, then position", () => {
  const start = { x: 0.46, y: 0.34 };
  const near = { personId: "near", x: 0.47, y: 0.33, sim: null };
  const far = { personId: "far", x: 0.9, y: 0.9, sim: null };
  assert.equal(pm.pickHidden(start, [far, near]).personId, "near");
  assert.equal(pm.pickHidden(start, [{ ...near, sim: 0.2 }, { ...far, sim: 0.7 }]).personId, "far");
  assert.equal(pm.pickHidden(start, [{ ...near, sim: 0.1 }]), null);
  assert.equal(pm.pickHidden(start, []), null);
  // A staff member who walked from the sofa to behind the counter: far away, but the counter is her place.
  const barista = { personId: "staff", role: "staff", x: 0.45, y: 0.3, sim: null };
  const guest = { personId: "guest", role: "guest", x: 0.7, y: 0.6, sim: null };
  assert.equal(pm.pickHidden({ x: 0.9, y: 0.95, behindCounter: true }, [barista, guest]).personId, "staff");
  assert.equal(pm.pickHidden({ x: 0.5, y: 0.5, behindCounter: false }, [barista, guest]).personId, "guest");
  // Nobody of the staff hidden: a track behind the counter is not given to a guest without a clear appearance match.
  assert.equal(pm.pickHidden({ x: 0.9, y: 0.95, behindCounter: true }, [guest]), null);
  assert.equal(pm.pickHidden({ x: 0.9, y: 0.95, behindCounter: true }, [{ ...guest, sim: 0.7 }]).personId, "guest");
});

test("one person on two simultaneous tracks far apart is a conflict", () => {
  const girl = { startSec: 0, endSec: 100, x: 0.1, y: 0.5 };
  assert.ok(pm.concurrentConflict({ startSec: 50, endSec: 80, x: 0.9, y: 0.9 }, girl));
  assert.equal(pm.concurrentConflict({ startSec: 101, endSec: 130, x: 0.9, y: 0.9 }, girl), false, "one after another is fine");
  assert.equal(pm.concurrentConflict({ startSec: 50, endSec: 80, x: 0.12, y: 0.5 }, girl), false, "same place = duplicate box, not a conflict");
});

test("two people seen at the same moments in different places are different humans", () => {
  const counter = track(walk([[0.88, 0.97]], 10), 0, { cameraId: "c1" }); // staff behind the counter
  const guest = track(walk([[0.89, 0.76]], 10), 3, { cameraId: "c1" }); // a guest pressed to her, 0.21 away
  assert.ok(pm.seenApart([counter], [guest]));
  assert.ok(pm.seenApart([guest], [counter]), "symmetric");
  assert.equal(pm.seenApart([counter], [track(walk([[0.88, 0.97]], 10), 30, { cameraId: "c1" })]), false, "one after another = maybe the same person");
  assert.equal(pm.seenApart([counter], [track(walk([[0.9, 0.95]], 10), 3, { cameraId: "c1" })]), false, "same spot = duplicate box");
  assert.equal(pm.seenApart([counter], [track(walk([[0.89, 0.76]], 10), 3, { cameraId: "c2" })]), false, "other camera is not compared");
  assert.equal(pm.seenApart([counter], [track(walk([[0.89, 0.76]], 1), 3, { cameraId: "c1" })]), false, "a 1 s glitch is not proof");
});

test("day gallery: a person is recognised by the closest of their stored views", () => {
  const seated = pm.normalize([1, 0, 0]);
  const standing = pm.normalize([0, 1, 0]);
  let gallery = pm.addToGallery([], seated);
  gallery = pm.addToGallery(gallery, standing);
  gallery = pm.addToGallery(gallery, pm.normalize([1, 0.01, 0])); // same view again adds nothing
  assert.equal(gallery.length, 2);
  const average = pm.normalize([1, 1, 0]); // the blurred mean matches neither view well
  const person = { id: "girl", vec: average, gallery, role: "guest" };
  const later = pm.normalize([0.05, 1, 0]);
  assert.ok(pm.cosine(later, average) < 0.8);
  assert.ok(pm.personSimilarity(later, person) > 0.95);
  assert.equal(pm.chooseMatch(later, [person, { id: "other", vec: pm.normalize([0, 0, 1]), role: "guest" }]).personId, "girl");
  for (let i = 0; i < 30; i += 1) gallery = pm.addToGallery(gallery, pm.normalize([Math.cos(i), Math.sin(i), i / 10]));
  assert.ok(gallery.length <= pm.constants.GALLERY_SIZE);
});

test("vectors merge as a weighted mean and stay normalised", () => {
  const { vec, n } = pm.mergeVectors([1, 0], 3, [0, 1], 1);
  assert.equal(n, 4);
  assert.ok(Math.abs(Math.hypot(...vec) - 1) < 1e-3);
  assert.ok(vec[0] > vec[1]);
});

test("visit stats: hall time, tables, leaving through the door", () => {
  const inside = track(walk([[0.4, 0.2], [0.25, 0.65], [0.25, 0.65], [0.25, 0.65]], 10));
  const leaving = track(walk([[0.25, 0.65], [0.4, 0.5], [0.4, 0.2]], 3), 40);
  const stats = pm.visitStats([inside, leaving], camera);
  assert.ok(stats.hallSec >= 33);
  assert.equal(stats.tables[0].id, "t1");
  assert.ok(stats.tables[0].sec >= 25);
  assert.notEqual(stats.exitAt, null);
  assert.deepEqual(pm.visitClosing({ stats, allFinal: true, nowSec: stats.lastSeenAt + 2 }).exitedBy, "door");
  const stay = pm.visitStats([inside], camera);
  assert.equal(pm.visitClosing({ stats: stay, allFinal: true, nowSec: stay.lastSeenAt + 60 }).close, false);
  assert.equal(pm.visitClosing({ stats: stay, allFinal: true, nowSec: stay.lastSeenAt + 200 }).exitedBy, "lost");
});

test("a new track continues an active visit or one lost a moment ago, not one that left through the door", () => {
  const lost = { active: false, exitedBy: "lost", lastSeenAt: new Date((base + 100) * 1000) };
  assert.ok(pm.continuesVisit(lost, base + 200));
  assert.equal(pm.continuesVisit(lost, base + 400), false);
  assert.equal(pm.continuesVisit({ ...lost, exitedBy: "door" }, base + 110), false);
  assert.ok(pm.continuesVisit({ active: true }, base + 9999));
});

test("staff shift: counter / hall segments, absences longer than a minute", () => {
  const morning = track(walk([[0.9, 0.6]], 120));
  const hall = track(walk([[0.4, 0.6]], 30), 121);
  const back = track(walk([[0.9, 0.6]], 60), 300);
  const shift = pm.staffShift([morning, hall, back], camera, { nowSec: base + 365, live: true });
  assert.equal(shift.exits, 1);
  assert.ok(shift.longestAbsenceSec >= 120);
  assert.ok(shift.counterSec >= 170);
  assert.ok(shift.hallSec >= 25);
  assert.equal(shift.state, "counter");
  const later = pm.staffShift([morning], camera, { nowSec: base + 1000, live: true });
  assert.equal(later.state, "away");
});

test("waiting at the counter: guest in the queue while nobody is behind the counter", () => {
  const guest = track(walk([[0.6, 0.6]], 60));
  const barista = track(walk([[0.9, 0.6]], 20), 40);
  const result = pm.counterWaiting([guest, barista], camera);
  assert.equal(result.episodes.length, 1);
  assert.ok(result.totalSec >= 35 && result.totalSec <= 42);
  assert.equal(pm.counterWaiting([guest], { ...camera, queueZone: null }), null);
});
