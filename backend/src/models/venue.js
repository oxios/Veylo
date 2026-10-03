const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const venueSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  address: { type: String, trim: true, maxlength: 240, default: "" },
  // IANA zone for "today", day buckets and hour-of-day profiles.
  timezone: { type: String, trim: true, maxlength: 64, default: "Europe/Kyiv" },
}, schemaOptions);

module.exports = mongoose.model("Venue", venueSchema);
