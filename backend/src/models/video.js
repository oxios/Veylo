const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const videoSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venue", required: true, index: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, ref: "Camera", required: true, index: true },
  originalName: { type: String, required: true, trim: true, maxlength: 255 },
  format: { type: String, enum: ["mp4", "mov", "avi", "mkv"], required: true },
  sizeBytes: { type: Number, required: true, min: 1 },
  recordedAt: { type: Date, required: true },
  status: { type: String, enum: ["queued", "processing", "done", "failed"], default: "queued", index: true },
  progress: { type: Number, default: 0, min: 0, max: 1 },
  error: { type: String, default: "" },
  // Filled in by the video worker.
  durationSec: { type: Number, default: null },
  sampleFps: { type: Number, default: null },
  frameWidth: { type: Number, default: null },
  frameHeight: { type: Number, default: null },
  trackCount: { type: Number, default: null },
  model: { type: String, default: "" },
  startedAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  sourceDeleted: { type: Boolean, default: false },
  // Processing node that claimed the job and its last progress report (stale jobs are requeued).
  nodeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  heartbeatAt: { type: Date, default: null },
  // Server-generated file names inside VIDEO_STORAGE_DIR; never exposed to clients.
  storageKey: { type: String, required: true, select: false },
  snapshotKey: { type: String, default: "", select: false },
}, schemaOptions);

videoSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("Video", videoSchema);
