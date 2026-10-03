const crypto = require("node:crypto");
const env = require("../config/env");
const Camera = require("../models/camera");
const Node = require("../models/node");
const channel = require("./node-channel");
const { open } = require("./secret-box");
const { hashSecret } = require("./node-tokens");

const LOCAL_SLUG = "local";

function isNodeOnline(node, now = Date.now()) {
  if (!node?.enabled || !node.lastSeenAt) return false;
  return now - new Date(node.lastSeenAt).getTime() <= env.nodeStaleAfterMs;
}

const hubPath = (cameraId) => `cam_${cameraId}`;

// The only place where RTSP credentials are decrypted: the config goes to the node over the authenticated API.
async function buildNodeConfig(node, CameraModel = Camera) {
  const cameras = await CameraModel.find({ nodeId: node._id, source: "rtsp" })
    .select("+rtspMainSealed +rtspSubSealed")
    .sort({ createdAt: 1 })
    .lean();
  const items = [];
  for (const camera of cameras) {
    let main = "";
    let sub = "";
    try {
      main = open(camera.rtspMainSealed);
      sub = camera.rtspSubSealed ? open(camera.rtspSubSealed) : "";
    } catch {
      continue; // sealed with another key: the owner has to re-enter the address
    }
    items.push({
      id: String(camera._id),
      name: camera.name,
      kind: camera.kind,
      enabled: camera.enabled !== false,
      main,
      sub,
      analysis: camera.analysisStream === "main" || !sub ? "main" : "sub",
      hubPath: hubPath(camera._id),
      // Where a lost person must NOT be held as "still here, just hidden": the doorway / sidewalk and the threshold.
      noHold: {
        zones: [camera.doorZone, camera.streetZone].filter((zone) => zone?.points?.length >= 3).map((zone) => zone.points.map(({ x, y }) => [x, y])),
        line: camera.entryLine ? [[camera.entryLine.a.x, camera.entryLine.a.y], [camera.entryLine.b.x, camera.entryLine.b.y]] : null,
      },
    });
  }
  channel.setNodeCameras(node._id, items.map((item) => item.id));
  const config = { cameras: items, hub: { rtspUrl: env.hubRtspUrl } };
  const revision = crypto.createHash("sha1").update(JSON.stringify(config)).digest("hex").slice(0, 16);
  return { revision, ...config };
}

async function nodeLoad(NodeModel = Node, CameraModel = Camera) {
  const nodes = await NodeModel.find({ enabled: true }).lean();
  const counts = await CameraModel.aggregate([
    { $match: { source: "rtsp", nodeId: { $ne: null } } },
    { $group: { _id: "$nodeId", count: { $sum: 1 } } },
  ]);
  const byNode = new Map(counts.map((item) => [String(item._id), item.count]));
  return nodes.map((node) => ({ node, cameras: byNode.get(String(node._id)) || 0 }));
}

// Least loaded online node with spare capacity, or null.
async function pickNode({ exclude = [] } = {}) {
  const now = Date.now();
  const candidates = (await nodeLoad())
    .filter(({ node, cameras }) => isNodeOnline(node, now) && cameras < (node.maxCameras || 8) && !exclude.includes(String(node._id)))
    .sort((a, b) => a.cameras / (a.node.maxCameras || 8) - b.cameras / (b.node.maxCameras || 8));
  return candidates[0]?.node || null;
}

function notifyConfig(nodeId) {
  if (nodeId) channel.send(nodeId, { type: "config" });
}

async function assignCamera(camera) {
  const node = await pickNode();
  if (!node) return null;
  const updated = await Camera.findOneAndUpdate({ _id: camera._id, nodeId: null }, { $set: { nodeId: node._id, live: { state: "connecting", updatedAt: new Date() } } }, { new: true });
  if (updated) notifyConfig(node._id);
  return updated ? node : null;
}

async function assignPendingCameras() {
  const pending = await Camera.find({ source: "rtsp", nodeId: null }).sort({ createdAt: 1 }).limit(50);
  for (const camera of pending) {
    if (!(await assignCamera(camera))) break;
  }
}

// The local node of the development stack authenticates with LOCAL_NODE_SECRET from .env.
async function ensureLocalNode(log = console.log) {
  if (!env.localNodeSecret) return null;
  const node = await Node.findOneAndUpdate(
    { slug: LOCAL_SLUG },
    { $set: { tokenHash: hashSecret(env.localNodeSecret), managedBy: "env" }, $setOnInsert: { name: "Локальний вузол", enabled: true } },
    { upsert: true, new: true },
  );
  log(`Local processing node ready (slug "${LOCAL_SLUG}")`);
  return node;
}

/**
 * UI status of a camera:
 * upload | disabled | pending (no node) | node_offline | connecting | online | error
 */
function cameraStatus(camera, node, now = Date.now()) {
  if (camera.source !== "rtsp") return { state: "upload" };
  if (camera.enabled === false) return { state: "disabled" };
  if (!camera.nodeId) return { state: "pending" };
  if (!node || !isNodeOnline(node, now)) return { state: "node_offline", nodeName: node?.name || "" };
  const live = camera.live || {};
  const fresh = live.updatedAt && now - new Date(live.updatedAt).getTime() <= env.nodeStaleAfterMs;
  if (!fresh) return { state: "connecting", nodeName: node.name };
  if (live.state === "online") {
    return { state: "online", nodeName: node.name, fps: live.fps, width: live.width, height: live.height, codec: live.codec, mainCodec: live.mainCodec, lastFrameAt: live.lastFrameAt, recording: live.recording, archiveFrom: live.archiveFrom };
  }
  if (live.state === "error") return { state: "error", nodeName: node.name, error: live.error, errorCode: live.errorCode };
  return { state: "connecting", nodeName: node.name };
}

async function camerasWithStatus(cameras) {
  const nodeIds = [...new Set(cameras.map((camera) => camera.nodeId && String(camera.nodeId)).filter(Boolean))];
  const nodes = nodeIds.length ? await Node.find({ _id: { $in: nodeIds } }).lean() : [];
  const byId = new Map(nodes.map((node) => [String(node._id), node]));
  const now = Date.now();
  return cameras.map((camera) => {
    const json = typeof camera.toJSON === "function" ? camera.toJSON() : camera;
    delete json.live;
    return { ...json, status: cameraStatus(camera, byId.get(String(camera.nodeId)), now) };
  });
}

module.exports = {
  LOCAL_SLUG,
  isNodeOnline,
  hubPath,
  buildNodeConfig,
  nodeLoad,
  pickNode,
  assignCamera,
  assignPendingCameras,
  notifyConfig,
  ensureLocalNode,
  cameraStatus,
  camerasWithStatus,
};
