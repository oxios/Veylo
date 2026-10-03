const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

// Staff directory of a venue: names and roles only, no photos or biometric data.
const STAFF_ROLES = ["barista", "waiter", "cook", "admin", "other"];
const STAFF_COLORS = ["violet", "teal", "amber", "rose", "sky", "lime", "indigo", "brown"];

const staffSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
  role: { type: String, enum: STAFF_ROLES, default: "other" },
  color: { type: String, enum: STAFF_COLORS, default: "violet" },
  active: { type: Boolean, default: true },
}, schemaOptions);

module.exports = mongoose.model("Staff", staffSchema);
module.exports.STAFF_ROLES = STAFF_ROLES;
module.exports.STAFF_COLORS = STAFF_COLORS;
