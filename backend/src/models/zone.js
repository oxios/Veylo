const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const zoneSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true, index: true },
  floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", required: true, index: true },
  floor: { type: String, required: true, trim: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  type: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  capacity: { type: Number, default: 0, min: 0, max: 100_000 },
  cameras: [{ type: String, trim: true, maxlength: 80 }],
  coverage: { type: Number, default: 0, min: 0, max: 100 },
  source: { type: String, enum: ["manual", "pdf-auto", "image-ai"], default: "manual" },
  left: { type: Number, required: true, min: 0, max: 100 },
  top: { type: Number, required: true, min: 0, max: 100 },
  width: { type: Number, required: true, min: 0.1, max: 100 },
  height: { type: Number, required: true, min: 0.1, max: 100 },
}, schemaOptions);

zoneSchema.index({ floorId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Zone", zoneSchema);
