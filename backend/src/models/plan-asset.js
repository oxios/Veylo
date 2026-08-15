const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const planAssetSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true, index: true },
  floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor", required: true, unique: true, index: true },
  fileName: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"], required: true },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  sha256: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  data: { type: Buffer, required: true, select: false },
}, schemaOptions);

module.exports = mongoose.model("PlanAsset", planAssetSchema);
