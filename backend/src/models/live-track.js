const mongoose = require("mongoose");
const env = require("../config/env");

// One person track from a live camera. Points are [secondsFromStartAt, x, y] (foot point, frame fractions),
// appended by the node every few seconds. Raw tracks expire after LIVE_TRACK_RETENTION_DAYS; hourly
// aggregates (camerahours) stay.
const liveTrackSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  final: { type: Boolean, default: false },
  // Number of points stored; the node sends `from` so retried uploads are not appended twice.
  n: { type: Number, default: 0 },
  points: { type: [[Number]], default: [] },
  // Identity of the day (see models/person). `feat` is the track's appearance vector, erased after the day ends.
  personId: { type: mongoose.Schema.Types.ObjectId, default: null },
  feat: { type: [Number], default: undefined, select: false },
  featN: { type: Number, default: 0 },
  featExpiresAt: { type: Date, default: null },
  shot: { type: { _id: false, at: Date, box: [Number], score: Number, ref: String }, default: null },
  // "bicycle": a bicycle (counted as a passing cyclist only); `bike`: a person riding one.
  cls: { type: String, enum: ["person", "bicycle"], default: "person" },
  bike: { type: Boolean, default: false },
  // Best detection confidence of the track (absent on tracks from older nodes).
  maxConf: { type: Number, default: null },
}, { versionKey: false, collection: "livetracks", timestamps: { createdAt: false, updatedAt: true } });

liveTrackSchema.index({ cameraId: 1, key: 1 }, { unique: true });
liveTrackSchema.index({ cameraId: 1, startAt: 1, endAt: 1 });
liveTrackSchema.index({ final: 1, endAt: 1 });
liveTrackSchema.index({ personId: 1, startAt: 1 }, { sparse: true });
liveTrackSchema.index({ featExpiresAt: 1 }, { sparse: true });
liveTrackSchema.index({ endAt: 1 }, { expireAfterSeconds: env.liveTrackRetentionDays * 24 * 3600 });

module.exports = mongoose.model("LiveTrack", liveTrackSchema);
