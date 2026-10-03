const mongoose = require("mongoose");

// Written by the video worker: one person track, foot points as [secondsFromStart, x, y] with x/y in 0..1.
const trackSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  trackId: { type: Number, required: true },
  points: { type: [[Number]], required: true },
}, { versionKey: false });

module.exports = mongoose.model("Track", trackSchema);
