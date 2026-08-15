const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const floorSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true, index: true },
  level: { type: Number, required: true, min: -10, max: 250 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  spaceType: {
    type: String,
    enum: ["building-floor", "hall", "outdoor", "terrace", "basement", "mezzanine", "service", "other"],
    default: "building-floor",
  },
  purpose: { type: String, trim: true, maxlength: 80, default: "Гостевая зона" },
  canvas: {
    width: { type: Number, default: 1200, min: 320, max: 10_000 },
    height: { type: Number, default: 800, min: 240, max: 10_000 },
    gridSize: { type: Number, default: 20, min: 1, max: 500 },
  },
  planImport: {
    originalName: { type: String, maxlength: 180 },
    assetType: { type: String, enum: ["pdf", "image", "manual"] },
    mimeType: { type: String, maxlength: 80 },
    pageCount: { type: Number, min: 0, max: 1000 },
    parsedPageCount: { type: Number, min: 0, max: 10 },
    textCharacters: { type: Number, min: 0 },
    generatedElements: { type: Number, min: 0 },
    importedAt: Date,
  },
}, schemaOptions);

floorSchema.index({ locationId: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("Floor", floorSchema);
