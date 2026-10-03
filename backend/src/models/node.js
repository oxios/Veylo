const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

// A processing node: a Docker host running camera-node + node-mediamtx. It authenticates with a bearer token
// "vfn_<slug>_<secret>"; only sha256(secret) is stored.
const nodeSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, match: /^[a-z0-9]{2,40}$/ },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  tokenHash: { type: String, required: true, select: false },
  // "env" = the local node defined by LOCAL_NODE_SECRET; its token cannot be rotated from the UI.
  managedBy: { type: String, enum: ["admin", "env"], default: "admin" },
  enabled: { type: Boolean, default: true },
  maxCameras: { type: Number, default: 8, min: 1, max: 64 },
  lastSeenAt: { type: Date, default: null },
  connectedAt: { type: Date, default: null },
  version: { type: String, default: "" },
  info: { type: mongoose.Schema.Types.Mixed, default: {} },
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },
}, schemaOptions);

module.exports = mongoose.model("Node", nodeSchema);
