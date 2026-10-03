const { z } = require("zod");

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const nonEmpty = (schema) => schema.refine((value) => Object.keys(value).length > 0, "At least one field is required");
const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid identifier");
const fraction = z.number().finite().min(0).max(1);

const timezone = z.string().trim().min(1).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Unknown time zone");

const login = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

const venueCreate = z.object({
  name: trimmed(2, 120),
  address: z.string().trim().max(240).optional().default(""),
  timezone: timezone.optional(),
}).strict();

const venueUpdate = nonEmpty(z.object({
  name: trimmed(2, 120).optional(),
  address: z.string().trim().max(240).optional(),
  timezone: timezone.optional(),
}).strict());

const point = z.object({ x: fraction, y: fraction }).strict();

const entryLine = z.object({
  a: point,
  b: point,
  inside: z.enum(["positive", "negative"]),
}).strict().refine((line) => Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) >= 0.02, "Entry line is too short");

const zone = z.object({
  points: z.array(point).min(3).max(24),
}).strict();

const table = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
  label: trimmed(1, 40),
  points: z.array(point).min(3).max(32),
}).strict();

const tables = z.array(table).max(40).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Table ids must be unique");

const cameraKind = z.enum(["indoor", "outdoor", "hybrid"]);

// Credentials can be typed separately or embedded in the address; an empty password keeps the stored one on update.
const rtspInput = z.object({
  url: trimmed(8, 1000),
  username: z.string().max(200).optional().default(""),
  password: z.string().max(200).optional().default(""),
  subUrl: z.string().trim().max(1000).optional().default(""),
}).strict();

const cameraCreate = z.discriminatedUnion("source", [
  z.object({ source: z.literal("upload"), name: trimmed(2, 120), kind: cameraKind.optional().default("indoor") }).strict(),
  z.object({ source: z.literal("rtsp"), name: trimmed(2, 120), kind: cameraKind, rtsp: rtspInput }).strict(),
]);

const cameraUpdate = nonEmpty(z.object({
  name: trimmed(2, 120).optional(),
  kind: cameraKind.optional(),
  enabled: z.boolean().optional(),
  analysisStream: z.enum(["sub", "main"]).optional(),
  rtsp: rtspInput.optional(),
  entryLine: entryLine.nullable().optional(),
  hallZone: zone.nullable().optional(),
  streetZone: zone.nullable().optional(),
  doorZone: zone.nullable().optional(),
  staffZone: zone.nullable().optional(),
  queueZone: zone.nullable().optional(),
  tables: tables.optional(),
}).strict());

const cameraProbe = z.object({
  rtsp: rtspInput,
}).strict();

const statsQuery = z.object({
  period: z.enum(["today", "yesterday", "7d", "30d"]).optional().default("today"),
});

const clipCreate = z.object({
  start: z.string().datetime({ offset: true }),
  durationSec: z.number().int().min(5).max(600),
  codec: z.enum(["copy", "h264"]).optional().default("copy"),
}).strict();

// ---- guests & staff ----

const dayQuery = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const staffRole = z.enum(["barista", "waiter", "cook", "admin", "other"]);
const staffColor = z.enum(["violet", "teal", "amber", "rose", "sky", "lime", "indigo", "brown"]);

const staffCreate = z.object({
  name: trimmed(1, 60),
  role: staffRole.optional().default("other"),
  color: staffColor.optional().default("violet"),
}).strict();

const staffUpdate = nonEmpty(z.object({
  name: trimmed(1, 60).optional(),
  role: staffRole.optional(),
  color: staffColor.optional(),
  active: z.boolean().optional(),
}).strict());

// Exactly one of: back to a guest, an existing staff member, or a new staff member.
const personRole = z.union([
  z.object({ role: z.literal("guest") }).strict(),
  z.object({ staffId: objectId }).strict(),
  z.object({ newStaff: staffCreate }).strict(),
]);

const personMerge = z.object({ intoPersonId: objectId }).strict();

const segmentRequest = z.object({ x: fraction, y: fraction }).strict();

// Multipart text fields of the video upload.
const videoUpload = z.object({
  recordedAt: z.string().trim().min(1, "Recording start time is required").pipe(z.coerce.date())
    .refine((date) => date instanceof Date && date.getTime() <= Date.now() + 24 * 60 * 60 * 1000, "Recording start cannot be in the future")
    .refine((date) => date instanceof Date && date.getFullYear() >= 2000, "Recording start is too old"),
});

// ---- processing node protocol ----

const nodeCameraState = z.object({
  id: objectId,
  state: z.enum(["connecting", "online", "error", "stopped"]),
  error: z.string().max(300).optional().default(""),
  errorCode: z.string().max(40).optional().default(""),
  fps: z.number().finite().min(0).max(240).nullable().optional(),
  width: z.number().int().min(0).max(10000).nullable().optional(),
  height: z.number().int().min(0).max(10000).nullable().optional(),
  codec: z.string().max(30).optional().default(""),
  mainCodec: z.string().max(30).optional().default(""),
  lastFrameAt: z.number().int().nullable().optional(),
  recording: z.boolean().optional().default(false),
  archiveFrom: z.number().int().nullable().optional(),
  archiveBytes: z.number().min(0).nullable().optional(),
}).strict();

const nodeHeartbeat = z.object({
  version: z.string().max(40).optional().default(""),
  info: z.record(z.string(), z.unknown()).optional().default({}),
  stats: z.record(z.string(), z.unknown()).optional().default({}),
  cameras: z.array(nodeCameraState).max(64).optional().default([]),
}).strict();

const trackPoint = z.tuple([z.number().finite().min(0).max(86400), fraction, fraction]);

const nodeObservations = z.object({
  cameraId: objectId,
  coverage: z.array(z.object({ minute: z.number().int(), seconds: z.number().int().min(0).max(60) }).strict()).max(600).optional().default([]),
  tracks: z.array(z.object({
    key: z.string().regex(/^[A-Za-z0-9:_-]{1,80}$/),
    startAt: z.number().int(),
    endAt: z.number().int(),
    from: z.number().int().min(0),
    points: z.array(trackPoint).max(20_000),
    final: z.boolean(),
    // Appearance vector (L2-normalised mean of ReID embeddings) and the best frame for a thumbnail.
    feat: z.array(z.number().finite().min(-1).max(1)).min(64).max(1024).optional(),
    featN: z.number().int().min(1).max(100_000).optional(),
    // "bicycle" tracks only feed passer-by counts; `bike` = this person rode a bicycle.
    cls: z.enum(["person", "bicycle"]).optional(),
    conf: z.number().min(0).max(1).optional(),
    bike: z.boolean().optional(),
    shot: z.object({
      at: z.number().int(),
      box: z.tuple([fraction, fraction, fraction, fraction]),
      score: z.number().min(0).max(10),
      ref: z.string().regex(/^[a-f0-9]{10}_\d{1,9}$/),
    }).strict().optional(),
  }).strict().refine((track) => track.endAt >= track.startAt, "endAt precedes startAt")).max(2000).optional().default([]),
  now: z.object({
    at: z.number().int(),
    people: z.array(z.tuple([z.number().int(), fraction, fraction])).max(500),
  }).strict().optional(),
}).strict();

const nodeTables = z.object({
  candidates: z.array(z.object({
    x1: fraction, y1: fraction, x2: fraction, y2: fraction,
    score: z.number().min(0).max(1),
    hits: z.number().int().min(1).max(10_000),
    kind: z.enum(["table", "seat"]).optional().default("table"),
  }).strict()).max(60),
}).strict();

const nodeJobProgress = z.object({ progress: z.number().min(0).max(1) }).strict();

const nodeJobResult = z.object({
  durationSec: z.number().positive(),
  sampleFps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  model: z.string().max(80),
  tracks: z.array(z.object({
    trackId: z.number().int(),
    points: z.array(z.tuple([z.number().finite().min(0), fraction, fraction])).min(1).max(200_000),
  }).strict()).max(100_000),
}).strict();

const nodeFailure = z.object({ error: z.string().trim().min(1).max(400) }).strict();

// ---- admin ----

const nodeCreate = z.object({
  name: trimmed(2, 80),
  maxCameras: z.number().int().min(1).max(64).optional().default(8),
}).strict();

const nodeUpdate = nonEmpty(z.object({
  name: trimmed(2, 80).optional(),
  enabled: z.boolean().optional(),
  maxCameras: z.number().int().min(1).max(64).optional(),
}).strict());

const cameraAssign = z.object({ nodeId: objectId.nullable() }).strict();

module.exports = {
  login,
  venueCreate,
  venueUpdate,
  cameraCreate,
  cameraUpdate,
  cameraProbe,
  statsQuery,
  clipCreate,
  videoUpload,
  dayQuery,
  staffCreate,
  staffUpdate,
  personRole,
  personMerge,
  segmentRequest,
  nodeHeartbeat,
  nodeObservations,
  nodeTables,
  nodeJobProgress,
  nodeJobResult,
  nodeFailure,
  nodeCreate,
  nodeUpdate,
  cameraAssign,
};
