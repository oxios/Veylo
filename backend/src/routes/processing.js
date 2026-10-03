const express = require("express");
const Node = require("../models/node");
const { isNodeOnline } = require("../services/nodes");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

// Uploaded videos are processed by any online node; the UI only needs to know whether one exists.
function workerView(nodes, now = Date.now()) {
  const online = nodes.filter((node) => isNodeOnline(node, now));
  const lastSeen = nodes.map((node) => node.lastSeenAt && new Date(node.lastSeenAt).getTime()).filter(Boolean).sort((a, b) => b - a)[0];
  return {
    online: online.length > 0,
    lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
    model: online[0]?.info?.model || "",
    nodes: online.length,
  };
}

router.get("/status", asyncHandler(async (_req, res) => {
  const nodes = await Node.find({ enabled: true }).select("enabled lastSeenAt info").lean();
  res.json({ worker: workerView(nodes) });
}));

module.exports = router;
module.exports.workerView = workerView;
