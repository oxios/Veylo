const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const coordinatesSchema = new mongoose.Schema({
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
}, { _id: false });

const locationSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  externalId: { type: String, trim: true, maxlength: 100 },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  city: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  address: { type: String, required: true, trim: true, minlength: 3, maxlength: 240 },
  format: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  timezone: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  capacity: { type: Number, required: true, min: 1, max: 100_000 },
  businessHours: { type: String, required: true, trim: true, maxlength: 80 },
  coordinates: { type: coordinatesSchema, required: true },
  floors: { type: Number, default: 0, min: 0 },
  zones: { type: Number, default: 0, min: 0 },
  cameras: { type: Number, default: 0, min: 0 },
  online: { type: Number, default: 0, min: 0 },
  readiness: { type: Number, default: 18, min: 0, max: 100 },
  status: { type: String, enum: ["ready", "attention", "setup"], default: "setup" },
  demoSeeded: { type: Boolean, default: false },
  privacyConfigured: { type: Boolean, default: false },
  historyDays: { type: Number, default: 0, min: 0 },
  planFloors: [{ type: String, trim: true, maxlength: 20 }],
  connectedSources: [{ type: String, trim: true, maxlength: 100 }],
  configuredCameras: { type: [mongoose.Schema.Types.Mixed], default: [] },
  configuredScreens: { type: [mongoose.Schema.Types.Mixed], default: [] },
  zoneCameraLinks: { type: Map, of: [String], default: {} },
}, schemaOptions);

locationSchema.index({ ownerId: 1, name: 1 });
locationSchema.index({ ownerId: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Location", locationSchema);
