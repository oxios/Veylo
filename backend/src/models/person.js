const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

// A person seen in a venue during one local day: "Гість №N" or a staff member. Numbers restart every day.
// `vec` is an appearance vector (clothes/silhouette, no face, no image); it never leaves the API, is used only
// to recognise the same person later the same day and is erased after the day ends (`vecExpiresAt`).
const personSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true }, // venue-local YYYY-MM-DD
  no: { type: Number, required: true },
  role: { type: String, enum: ["guest", "staff"], default: "guest" },
  staffId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Waiting for the owner: "staff_candidate" (long time behind the counter) or "staff_uncertain" (looks like a staff member).
  review: {
    type: new mongoose.Schema({
      kind: { type: String, enum: ["staff_candidate", "staff_uncertain"], required: true },
      suggestedStaffId: { type: mongoose.Schema.Types.ObjectId, default: null },
      at: { type: Date, required: true },
    }, { _id: false }),
    default: null,
  },
  reviewDismissed: { type: Boolean, default: false },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  visitCount: { type: Number, default: 0 },
  hallSec: { type: Number, default: 0 },
  staffSec: { type: Number, default: 0 },
  // Best frame of the person (largest unobstructed box); the crop itself stays on the node (deleted with the 24 h archive).
  shot: {
    type: new mongoose.Schema({
      cameraId: { type: mongoose.Schema.Types.ObjectId, required: true },
      at: { type: Date, required: true },
      box: { type: [Number], required: true },
      score: { type: Number, default: 0 },
      ref: { type: String, default: "" }, // the node's saved crop
    }, { _id: false }),
    default: null,
  },
  vec: { type: [Number], default: undefined, select: false },
  vecN: { type: Number, default: 0 },
  vecExpiresAt: { type: Date, default: null },
}, { ...schemaOptions, collection: "people" });

personSchema.index({ venueId: 1, day: 1, no: 1 }, { unique: true });
personSchema.index({ venueId: 1, day: 1, lastSeenAt: -1 });
personSchema.index({ vecExpiresAt: 1 }, { sparse: true });

personSchema.set("toJSON", {
  ...schemaOptions.toJSON,
  transform: (document, returned) => {
    schemaOptions.toJSON.transform(document, returned);
    delete returned.vec;
    delete returned.vecN;
    delete returned.vecExpiresAt;
    return returned;
  },
});

module.exports = mongoose.model("Person", personSchema);
