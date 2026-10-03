// Endpoints for services of the main stack (not for browsers or nodes).

const crypto = require("node:crypto");
const express = require("express");
const env = require("../config/env");
const Camera = require("../models/camera");
const Node = require("../models/node");
const { READER_USER } = require("../services/hub");
const { findNodeByToken } = require("../services/node-tokens");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();
const HUB_PATH = /^cam_([a-f0-9]{24})$/;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * MediaMTX hub external authentication (authMethod: http). The hook URL carries ?secret=MEDIAMTX_SECRET.
 * publish: a node publishing the live stream of a camera assigned to it (password = node token);
 * read: only the API's WHEP proxy (user "venueflow", password = MEDIAMTX_SECRET).
 */
router.post("/mediamtx/auth", express.json({ limit: "16kb" }), asyncHandler(async (req, res) => {
  if (!safeEqual(req.query.secret, env.mediamtxSecret)) return res.status(401).end();
  const { user, password, action, path } = req.body || {};
  const match = HUB_PATH.exec(String(path || ""));
  let allowed = false;
  if (match && action === "read") {
    allowed = user === READER_USER && safeEqual(password, env.mediamtxSecret);
  } else if (match && action === "publish") {
    const node = await findNodeByToken(password, Node);
    if (node?.enabled) allowed = Boolean(await Camera.exists({ _id: match[1], nodeId: node._id, source: "rtsp" }));
  }
  return res.status(allowed ? 200 : 401).end();
}));

module.exports = router;
