const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { NodeChannel, WATCH_TTL_SEC } = require("../src/services/node-channel");
const { formatToken, hashSecret, parseToken, secretMatches } = require("../src/services/node-tokens");

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  ping() {}

  terminate() {
    this.readyState = 3;
    this.emit("close");
  }
}

function channelWithClock() {
  let now = 0;
  const timers = { setInterval: () => ({ unref() {} }), clearInterval() {}, setTimeout, clearTimeout };
  const channel = new NodeChannel({ now: () => now, timers });
  return { channel, advance: (ms) => { now += ms; } };
}

test("watching a camera asks its node to publish, and stops it after the last viewer and lease", () => {
  const { channel, advance } = channelWithClock();
  const ws = new FakeSocket();
  channel.attach("n1", ws);
  const release = channel.addViewer("c1", "n1");
  assert.deepEqual(ws.sent.at(-1), { type: "watch", cameraId: "c1", ttlSec: WATCH_TTL_SEC });
  const second = channel.addViewer("c1", "n1");
  assert.equal(ws.sent.length, 1, "a second viewer does not repeat the command");
  release();
  channel.refreshDemand();
  assert.deepEqual(ws.sent.at(-1).ttlSec, WATCH_TTL_SEC, "still watched by the second viewer");
  second();
  assert.deepEqual(ws.sent.at(-1), { type: "watch", cameraId: "c1", ttlSec: 0 });

  channel.lease("c2", "n1", 30_000);
  advance(10_000);
  channel.refreshDemand();
  assert.equal(ws.sent.at(-1).ttlSec, WATCH_TTL_SEC, "the WebRTC handshake lease keeps the stream alive");
  advance(30_000);
  channel.refreshDemand();
  assert.deepEqual(ws.sent.at(-1), { type: "watch", cameraId: "c2", ttlSec: 0 });
});

test("a reconnecting node learns which of its cameras are being watched", () => {
  const { channel } = channelWithClock();
  channel.addViewer("c1", "n1");
  const ws = new FakeSocket();
  channel.attach("n1", ws);
  assert.deepEqual(ws.sent, [{ type: "watch", cameraId: "c1", ttlSec: WATCH_TTL_SEC }]);
});

test("requests resolve with the node's reply and fail when the node disconnects", async () => {
  const { channel } = channelWithClock();
  const ws = new FakeSocket();
  channel.attach("n1", ws);
  const pending = channel.request("n1", { type: "probe" }, 5000);
  const { requestId } = ws.sent.at(-1);
  channel.handle("n2", JSON.stringify({ type: "reply", requestId, ok: true, data: "forged" }));
  channel.handle("n1", JSON.stringify({ type: "reply", requestId, ok: true, data: { ok: 1 } }));
  assert.deepEqual(await pending, { ok: 1 }, "a reply from another node is ignored");

  const lost = channel.request("n1", { type: "archive.list" }, 5000);
  ws.terminate();
  await assert.rejects(lost, (error) => error.code === "NODE_DISCONNECTED");
  await assert.rejects(channel.request("n1", { type: "probe" }), (error) => error.code === "NODE_OFFLINE");
});

test("detections are relayed only for cameras assigned to the sending node", () => {
  const { channel } = channelWithClock();
  channel.setNodeCameras("n1", ["c1"]);
  const frames = [];
  const unsubscribe = channel.subscribeFrames("c1", (frame) => frames.push(frame));
  channel.handle("n2", JSON.stringify({ type: "frame", cameraId: "c1", people: [] }));
  channel.handle("n1", JSON.stringify({ type: "frame", cameraId: "c1", people: [[1, 0, 0, 1, 1, 0.9]] }));
  channel.handle("n1", "not json");
  unsubscribe();
  channel.handle("n1", JSON.stringify({ type: "frame", cameraId: "c1", people: [] }));
  assert.equal(frames.length, 1);
});

test("node tokens: format, parsing and constant-time secret check", () => {
  const token = formatToken("ab12cd34ef56ab78", "s".repeat(43));
  assert.deepEqual(parseToken(token), { slug: "ab12cd34ef56ab78", secret: "s".repeat(43) });
  for (const bad of ["", "vfn_x_short", "bearer vfn_a_b", "vfn_UPPER_" + "s".repeat(43)]) assert.equal(parseToken(bad), null, bad);
  const hash = hashSecret("s".repeat(43));
  assert.equal(secretMatches("s".repeat(43), hash), true);
  assert.equal(secretMatches("t".repeat(43), hash), false);
  assert.equal(secretMatches("s".repeat(43), "not-a-hash"), false);
});
