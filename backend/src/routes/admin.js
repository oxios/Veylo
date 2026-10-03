// Platform administration (users with isAdmin): processing nodes and camera placement across all owners.

const express = require("express");
const mongoose = require("mongoose");
const Camera = require("../models/camera");
const Node = require("../models/node");
const User = require("../models/user");
const Venue = require("../models/venue");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const channel = require("../services/node-channel");
const { cameraStatus, isNodeOnline, notifyConfig } = require("../services/nodes");
const { formatToken, hashSecret, newSecret, newSlug } = require("../services/node-tokens");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

function publicOrigin(req) {
  const host = req.get("x-forwarded-host") || req.get("host") || "127.0.0.1:5173";
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  return `${proto}://${host}`;
}

function setupFor(req, token) {
  const url = publicOrigin(req);
  return {
    env: `VENUEFLOW_URL=${url}\nNODE_TOKEN=${token}`,
    commands: [
      "git clone <repo> venueflow && cd venueflow/deploy/node",
      "cp .env.example .env   # встав VENUEFLOW_URL і NODE_TOKEN",
      "docker compose up -d --build",
    ],
    gpuCommand: "docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build",
  };
}

async function nodeView(node, cameraCount) {
  const json = node.toJSON ? node.toJSON() : { ...node, id: String(node._id) };
  delete json._id;
  return {
    ...json,
    online: isNodeOnline(node),
    connected: channel.isConnected(node._id),
    cameraCount,
  };
}

async function ownedNode(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new ApiError(404, "Node not found", "NODE_NOT_FOUND");
  const node = await Node.findById(id);
  if (!node) throw new ApiError(404, "Node not found", "NODE_NOT_FOUND");
  return node;
}

router.get("/nodes", asyncHandler(async (_req, res) => {
  const nodes = await Node.find().sort({ createdAt: 1 });
  const counts = await Camera.aggregate([{ $match: { source: "rtsp", nodeId: { $ne: null } } }, { $group: { _id: "$nodeId", count: { $sum: 1 } } }]);
  const byNode = new Map(counts.map((item) => [String(item._id), item.count]));
  res.json({ nodes: await Promise.all(nodes.map((node) => nodeView(node, byNode.get(String(node._id)) || 0))) });
}));

router.post("/nodes", validate(schemas.nodeCreate), asyncHandler(async (req, res) => {
  const secret = newSecret();
  const node = await Node.create({ ...req.validated.body, slug: newSlug(), tokenHash: hashSecret(secret) });
  const token = formatToken(node.slug, secret);
  res.status(201).json({ node: await nodeView(node, 0), token, setup: setupFor(req, token) });
}));

router.patch("/nodes/:nodeId", validate(schemas.nodeUpdate), asyncHandler(async (req, res) => {
  const node = await ownedNode(req.params.nodeId);
  node.set(req.validated.body);
  await node.save();
  if (req.validated.body.enabled === false) channel.sockets.get(String(node._id))?.close(4003, "disabled");
  const count = await Camera.countDocuments({ nodeId: node._id, source: "rtsp" });
  res.json({ node: await nodeView(node, count) });
}));

router.post("/nodes/:nodeId/token", asyncHandler(async (req, res) => {
  const node = await ownedNode(req.params.nodeId);
  if (node.managedBy === "env") throw new ApiError(409, "The local node token comes from LOCAL_NODE_SECRET in .env", "NODE_MANAGED_BY_ENV");
  const secret = newSecret();
  node.tokenHash = hashSecret(secret);
  await node.save();
  channel.sockets.get(String(node._id))?.close(4001, "token rotated");
  const token = formatToken(node.slug, secret);
  res.json({ token, setup: setupFor(req, token) });
}));

// Cameras of a deleted node go back to "waiting for a node" and are reassigned automatically.
router.delete("/nodes/:nodeId", asyncHandler(async (req, res) => {
  const node = await ownedNode(req.params.nodeId);
  await Camera.updateMany({ nodeId: node._id }, { $set: { nodeId: null, live: null } });
  channel.sockets.get(String(node._id))?.close(4004, "deleted");
  await node.deleteOne();
  res.status(204).end();
}));

router.get("/cameras", asyncHandler(async (_req, res) => {
  const cameras = await Camera.find({ source: "rtsp" }).sort({ createdAt: 1 }).lean();
  const [venues, owners, nodes] = await Promise.all([
    Venue.find({ _id: { $in: cameras.map((camera) => camera.venueId) } }).select("name").lean(),
    User.find({ _id: { $in: cameras.map((camera) => camera.ownerId) } }).select("email name").lean(),
    Node.find().lean(),
  ]);
  const venueById = new Map(venues.map((venue) => [String(venue._id), venue]));
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const nodeById = new Map(nodes.map((node) => [String(node._id), node]));
  res.json({
    cameras: cameras.map((camera) => ({
      id: String(camera._id),
      name: camera.name,
      kind: camera.kind,
      venue: venueById.get(String(camera.venueId))?.name || "—",
      owner: ownerById.get(String(camera.ownerId))?.email || "—",
      nodeId: camera.nodeId ? String(camera.nodeId) : null,
      rtspDisplay: camera.rtspDisplay,
      status: cameraStatus(camera, nodeById.get(String(camera.nodeId))),
    })),
  });
}));

router.patch("/cameras/:cameraId", validate(schemas.cameraAssign), asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.cameraId)) throw new ApiError(404, "Camera not found", "CAMERA_NOT_FOUND");
  const camera = await Camera.findOne({ _id: req.params.cameraId, source: "rtsp" });
  if (!camera) throw new ApiError(404, "Camera not found", "CAMERA_NOT_FOUND");
  const target = req.validated.body.nodeId ? await ownedNode(req.validated.body.nodeId) : null;
  const previous = camera.nodeId;
  camera.nodeId = target?._id ?? null;
  camera.live = target ? { state: "connecting", updatedAt: new Date() } : null;
  await camera.save();
  notifyConfig(previous);
  notifyConfig(camera.nodeId);
  res.json({ camera: { id: camera.id, nodeId: camera.nodeId ? String(camera.nodeId) : null } });
}));

module.exports = router;
