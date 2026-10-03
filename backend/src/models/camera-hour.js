const mongoose = require("mongoose");

// Hourly aggregate of a live camera, kept forever.
// `cov` (seconds actually analysed per minute, keys "0".."59") is written by node uploads with $max;
// everything else is recomputed from live tracks by the rollup loop whenever the hour is marked dirty.
const cameraHourSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
  hour: { type: Date, required: true },
  cov: { type: mongoose.Schema.Types.Mixed, default: {} },
  dirty: { type: Boolean, default: false },
  dirtyAt: { type: Date, default: null },
  computedAt: { type: Date, default: null },
  markupVersion: { type: Number, default: null },
  // Per-minute arrays (length 60).
  entries: { type: [Number], default: undefined },
  exits: { type: [Number], default: undefined },
  passersby: { type: [Number], default: undefined },
  occSum: { type: [Number], default: undefined },
  occMax: { type: [Number], default: undefined },
  dwellSum: { type: Number, default: 0 },
  dwellCount: { type: Number, default: 0 },
  // Sparse heatmap [[cellIndex, personSeconds]] on the HEAT_COLS x HEAT_ROWS grid.
  heat: { type: [[Number]], default: undefined },
  tables: { type: [{ _id: false, id: String, occupiedSec: Number, sessions: Number }], default: undefined },
}, { versionKey: false, collection: "camerahours" });

cameraHourSchema.index({ cameraId: 1, hour: 1 }, { unique: true });
cameraHourSchema.index({ dirty: 1, dirtyAt: 1 });

module.exports = mongoose.model("CameraHour", cameraHourSchema);
