const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

// One continuous stay of a person (guest or staff) in the venue, built from one or more live tracks
// (a track lost behind someone and found again continues the same visit). Kept indefinitely, no images.
const visitSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
  personId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true },
  startAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  endAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  enteredBy: { type: String, enum: ["door", "hall"], default: "hall" },
  exitedBy: { type: String, enum: ["door", "lost", null], default: null },
  hallSec: { type: Number, default: 0 },
  staffSec: { type: Number, default: 0 },
  tables: { type: [{ _id: false, id: String, label: String, sec: Number }], default: [] },
  trackKeys: { type: [String], default: [] },
}, schemaOptions);

visitSchema.index({ venueId: 1, day: 1, startAt: 1 });
visitSchema.index({ personId: 1, startAt: -1 });
visitSchema.index({ active: 1 });
visitSchema.index({ cameraId: 1, active: 1 });

module.exports = mongoose.model("Visit", visitSchema);
