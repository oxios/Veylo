const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { open, seal } = require("../src/services/secret-box");
const { displayAddress, parseRtspInput, suggestSubstream, withCredentials } = require("../src/services/rtsp-url");

test("sealed secrets round-trip and fail on tampering or a wrong key", () => {
  const key = crypto.randomBytes(32);
  const envelope = seal("rtsp://admin:p@ss@cam.local/stream", key);
  assert.doesNotMatch(envelope, /p@ss/);
  assert.equal(open(envelope, key), "rtsp://admin:p@ss@cam.local/stream");
  assert.throws(() => open(envelope, crypto.randomBytes(32)));
  const parts = envelope.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => open(parts.join("."), key));
  assert.notEqual(seal("same", key), seal("same", key), "random IV per envelope");
});

test("embedded credentials are split from the address; explicit ones win", () => {
  const parsed = parseRtspInput("rtsp://admin:secret@93.175.202.209:5692/cam/realmonitor?channel=1&subtype=0");
  assert.deepEqual(parsed, {
    address: "rtsp://93.175.202.209:5692/cam/realmonitor?channel=1&subtype=0",
    username: "admin",
    password: "secret",
  });
  assert.equal(parseRtspInput("rtsp://a:b@host/x", { username: "u", password: "p" }).password, "p");
  assert.equal(parseRtspInput("rtsp://a:b@host/x", { username: "", password: "" }).password, "b", "empty form fields keep embedded values");
  assert.equal(displayAddress(parsed.address), "93.175.202.209:5692/cam/realmonitor?channel=1&subtype=0");
});

test("special characters in credentials survive the round trip", () => {
  const full = withCredentials("rtsp://cam.local:554/live", "ad min", "p@ss:w/rd");
  assert.equal(full, "rtsp://ad%20min:p%40ss%3Aw%2Frd@cam.local:554/live");
  assert.deepEqual(parseRtspInput(full), { address: "rtsp://cam.local:554/live", username: "ad min", password: "p@ss:w/rd" });
});

test("invalid addresses are rejected with a validation error", () => {
  for (const bad of ["", "http://cam/stream", "rtsp://", "not a url", "rtsp://cam/stream with space"]) {
    assert.throws(() => parseRtspInput(bad), (error) => error.status === 422 && error.code === "INVALID_RTSP_URL", bad);
  }
});

test("substream suggestions for common vendors", () => {
  assert.equal(suggestSubstream("rtsp://h:554/cam/realmonitor?channel=1&subtype=0"), "rtsp://h:554/cam/realmonitor?channel=1&subtype=1");
  assert.equal(suggestSubstream("rtsp://h:554/Streaming/Channels/101"), "rtsp://h:554/Streaming/Channels/102");
  assert.equal(suggestSubstream("rtsp://h/stream1"), "rtsp://h/stream2");
  assert.equal(suggestSubstream("rtsp://h/live"), "");
});
