const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const planElementSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true, index: true },
  floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", default: null },
  clientId: { type: String, trim: true, maxlength: 100 },
  type: { type: String, enum: ["table", "camera", "wall", "door", "label"], required: true },
  x: { type: Number, required: true, min: 0, max: 100_000 },
  y: { type: Number, required: true, min: 0, max: 100_000 },
  width: { type: Number, required: true, min: 1, max: 100_000 },
  height: { type: Number, required: true, min: 1, max: 100_000 },
  rotation: { type: Number, default: 0, min: -360, max: 360 },
  label: { type: String, trim: true, maxlength: 160, default: "" },
  shape: { type: String, enum: ["rectangle", "round", "line", "icon"], default: "rectangle" },
  color: { type: String, trim: true, maxlength: 32, default: "#5f746b" },
  zIndex: { type: Number, default: 0, min: -10_000, max: 10_000 },
  locked: { type: Boolean, default: false },
  viewAngle: { type: Number, default: 70, min: 20, max: 160 },
  viewRadius: { type: Number, default: 28, min: 5, max: 60 },
  viewEnabled: { type: Boolean, default: true },
  seats: { type: Number, default: 0, min: 0, max: 50 },
  source: { type: String, enum: ["manual", "pdf-auto", "image-ai"], default: "manual" },
}, schemaOptions);

planElementSchema.index({ floorId: 1, zIndex: 1 });

module.exports = mongoose.model("PlanElement", planElementSchema);
