const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const WATCH_TTL_SEC = 45; // the node stops publishing if the API stops refreshing a watch
const WATCH_REFRESH_MS = 15_000;
const PING_MS = 20_000;

/**
 * Control channel to processing nodes (one WebSocket per node, opened by the node).
 *
 * API -> node: {type:"watch", cameraId, ttlSec}, {type:"config"}, request/response commands with a requestId.
 * node -> API: {type:"reply", requestId, ok, data|error}, {type:"frame", cameraId, ...} (live detections).
 *
 * "Demand" for a camera = someone is watching it live. While there is demand the node publishes the camera's
 * live stream to the MediaMTX hub and streams detections; without refreshes it stops on its own.
 */
class NodeChannel extends EventEmitter {
  constructor({ now = () => Date.now(), timers = { setInterval, clearInterval, setTimeout, clearTimeout } } = {}) {
    super();
    this.now = now;
    this.timers = timers;
    this.sockets = new Map(); // nodeId -> ws
    this.pending = new Map(); // requestId -> { nodeId, resolve, reject, timer }
    this.demand = new Map(); // cameraId -> { nodeId, viewers, leaseUntil }
    this.nodeCameras = new Map(); // nodeId -> Set(cameraId) the node may report on
    this.frameListeners = new Map(); // cameraId -> Set(fn)
    this.refreshTimer = null;
  }

  start() {
    if (this.refreshTimer) return;
    this.refreshTimer = this.timers.setInterval(() => this.refreshDemand(), WATCH_REFRESH_MS);
    this.refreshTimer.unref?.();
  }

  stop() {
    if (this.refreshTimer) this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    for (const ws of this.sockets.values()) ws.terminate?.();
  }

  isConnected(nodeId) {
    return this.sockets.has(String(nodeId));
  }

  setNodeCameras(nodeId, cameraIds) {
    this.nodeCameras.set(String(nodeId), new Set(cameraIds.map(String)));
  }

  attach(nodeId, ws) {
    const id = String(nodeId);
    const previous = this.sockets.get(id);
    if (previous && previous !== ws) previous.terminate?.();
    this.sockets.set(id, ws);
    let alive = true;
    ws.on("pong", () => { alive = true; });
    const ping = this.timers.setInterval(() => {
      if (!alive) return ws.terminate?.();
      alive = false;
      try { ws.ping?.(); } catch { /* closed */ }
    }, PING_MS);
    ping.unref?.();
    ws.on("message", (raw) => this.handle(id, raw));
    ws.on("close", () => {
      this.timers.clearInterval(ping);
      if (this.sockets.get(id) !== ws) return;
      this.sockets.delete(id);
      for (const [requestId, entry] of this.pending) {
        if (entry.nodeId !== id) continue;
        this.pending.delete(requestId);
        this.timers.clearTimeout(entry.timer);
        entry.reject(Object.assign(new Error("Processing node disconnected"), { code: "NODE_DISCONNECTED" }));
      }
      this.emit("disconnect", id);
    });
    // A reconnecting node immediately learns which of its cameras are being watched.
    for (const [cameraId, entry] of this.demand) {
      if (entry.nodeId === id) this.send(id, { type: "watch", cameraId, ttlSec: WATCH_TTL_SEC });
    }
    this.emit("connect", id);
  }

  send(nodeId, message) {
    const ws = this.sockets.get(String(nodeId));
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(message));
    return true;
  }

  request(nodeId, message, timeoutMs = 15_000) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        this.pending.delete(requestId);
        reject(Object.assign(new Error("Processing node did not answer in time"), { code: "NODE_TIMEOUT" }));
      }, timeoutMs);
      this.pending.set(requestId, { nodeId: String(nodeId), resolve, reject, timer });
      if (!this.send(nodeId, { ...message, requestId })) {
        this.timers.clearTimeout(timer);
        this.pending.delete(requestId);
        reject(Object.assign(new Error("Processing node is not connected"), { code: "NODE_OFFLINE" }));
      }
    });
  }

  handle(nodeId, raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.type === "reply" && typeof message.requestId === "string") {
      const entry = this.pending.get(message.requestId);
      if (!entry || entry.nodeId !== nodeId) return;
      this.pending.delete(message.requestId);
      this.timers.clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.data ?? null);
      else entry.reject(Object.assign(new Error(String(message.error || "Node command failed")), { code: String(message.code || "NODE_ERROR") }));
      return;
    }
    if (message?.type === "frame" && typeof message.cameraId === "string") {
      if (!this.nodeCameras.get(nodeId)?.has(message.cameraId)) return;
      for (const listener of this.frameListeners.get(message.cameraId) || []) listener(message);
    }
  }

  // ---- live demand ----

  touchDemand(cameraId, nodeId) {
    const key = String(cameraId);
    let entry = this.demand.get(key);
    const fresh = !entry || entry.nodeId !== String(nodeId);
    if (!entry) {
      entry = { nodeId: String(nodeId), viewers: 0, leaseUntil: 0 };
      this.demand.set(key, entry);
    }
    entry.nodeId = String(nodeId);
    if (fresh) this.send(entry.nodeId, { type: "watch", cameraId: key, ttlSec: WATCH_TTL_SEC });
    return entry;
  }

  // Keeps the camera live for `ms` (covers the WebRTC handshake before the overlay stream connects).
  lease(cameraId, nodeId, ms) {
    const entry = this.touchDemand(cameraId, nodeId);
    entry.leaseUntil = Math.max(entry.leaseUntil, this.now() + ms);
  }

  addViewer(cameraId, nodeId) {
    const entry = this.touchDemand(cameraId, nodeId);
    entry.viewers += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.viewers = Math.max(0, entry.viewers - 1);
      this.refreshDemand();
    };
  }

  refreshDemand() {
    const now = this.now();
    for (const [cameraId, entry] of this.demand) {
      if (entry.viewers > 0 || entry.leaseUntil > now) {
        this.send(entry.nodeId, { type: "watch", cameraId, ttlSec: WATCH_TTL_SEC });
      } else {
        this.demand.delete(cameraId);
        this.send(entry.nodeId, { type: "watch", cameraId, ttlSec: 0 });
      }
    }
  }

  subscribeFrames(cameraId, listener) {
    const key = String(cameraId);
    if (!this.frameListeners.has(key)) this.frameListeners.set(key, new Set());
    this.frameListeners.get(key).add(listener);
    return () => {
      const listeners = this.frameListeners.get(key);
      listeners?.delete(listener);
      if (listeners && !listeners.size) this.frameListeners.delete(key);
    };
  }
}

module.exports = new NodeChannel();
module.exports.NodeChannel = NodeChannel;
module.exports.WATCH_TTL_SEC = WATCH_TTL_SEC;
