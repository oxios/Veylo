const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

// All markup coordinates are fractions of the video frame (0..1), independent of resolution and stream.
const pointSchema = new mongoose.Schema({
  x: { type: Number, required: true, min: 0, max: 1 },
  y: { type: Number, required: true, min: 0, max: 1 },
}, { _id: false });

const entryLineSchema = new mongoose.Schema({
  a: { type: pointSchema, required: true },
  b: { type: pointSchema, required: true },
  // Sign of cross(b - a, p - a) for points inside the venue.
  inside: { type: String, enum: ["positive", "negative"], required: true },
}, { _id: false });

const zoneSchema = new mongoose.Schema({
  points: { type: [pointSchema], required: true },
}, { _id: false });

const tableSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true, trim: true, maxlength: 40 },
  points: { type: [pointSchema], required: true },
}, { _id: false });

const tableSuggestionSchema = new mongoose.Schema({
  x1: Number, y1: Number, x2: Number, y2: Number,
  score: Number,
  hits: Number,
  // "table" (COCO dining table) or "seat" (armchair, sofa, bench): both work as occupancy zones.
  kind: { type: String, enum: ["table", "seat"], default: "table" },
}, { _id: false });

// Reported by the processing node on every heartbeat.
const liveSchema = new mongoose.Schema({
  state: { type: String, enum: ["connecting", "online", "error", "stopped"], default: "connecting" },
  error: { type: String, default: "" },
  errorCode: { type: String, default: "" },
  fps: { type: Number, default: null },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  codec: { type: String, default: "" },
  mainCodec: { type: String, default: "" },
  lastFrameAt: { type: Date, default: null },
  recording: { type: Boolean, default: false },
  archiveFrom: { type: Date, default: null },
  archiveBytes: { type: Number, default: null },
  updatedAt: { type: Date, default: null },
}, { _id: false });

const cameraSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venue", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  source: { type: String, enum: ["upload", "rtsp"], default: "upload" },
  kind: { type: String, enum: ["indoor", "outdoor", "hybrid"], default: "indoor" },
  enabled: { type: Boolean, default: true },

  // RTSP: addresses with credentials are sealed (services/secret-box) and never leave the API except to the node.
  rtspMainSealed: { type: String, default: "", select: false },
  rtspSubSealed: { type: String, default: "", select: false },
  rtspDisplay: { type: String, default: "" },
  rtspSubDisplay: { type: String, default: "" },
  rtspUsername: { type: String, default: "" },
  analysisStream: { type: String, enum: ["sub", "main"], default: "sub" },
  nodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Node", default: null, index: true },
  live: { type: liveSchema, default: null },

  entryLine: { type: entryLineSchema, default: null },
  hallZone: { type: zoneSchema, default: null },
  streetZone: { type: zoneSchema, default: null },
  doorZone: { type: zoneSchema, default: null },
  // Behind the counter (staff) and in front of it (guests waiting to order).
  staffZone: { type: zoneSchema, default: null },
  queueZone: { type: zoneSchema, default: null },
  tables: { type: [tableSchema], default: [] },
  tableSuggestions: { type: [tableSuggestionSchema], default: [] },
  tableSuggestionsAt: { type: Date, default: null },
  // Incremented on every markup change; live hours remember the version they were computed with.
  markupVersion: { type: Number, default: 0 },
  markupChangedAt: { type: Date, default: null },

  snapshotKey: { type: String, default: "", select: false },
  snapshotAt: { type: Date, default: null },
}, schemaOptions);

module.exports = mongoose.model("Camera", cameraSchema);
