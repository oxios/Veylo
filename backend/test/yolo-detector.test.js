const test = require("node:test");
const assert = require("node:assert/strict");
const { detectWithYolo } = require("../src/services/yolo-detector");

function response(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test("sends an image in percentage coordinate space and accepts an actual YOLO result", async () => {
  let request;
  const result = await detectWithYolo({
    url: "http://yolo:8000/detect",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    mimeType: "image/jpeg",
    fileName: "frame.jpg",
    fetchImpl: async (_url, init) => {
      request = init;
      return response({
        status: "completed",
        actual: true,
        model: "yolo11n.pt",
        detections: [{ id: "yolo11-001", label: "person", confidence: 0.91, x: 10, y: 20, width: 30, height: 40 }],
      });
    },
  });

  assert.equal(request.method, "POST");
  assert.equal(request.body.get("coordinateSpace"), "percent");
  assert.equal(request.body.get("image").name, "frame.jpg");
  assert.equal(result.model, "yolo11n.pt");
  assert.equal(result.detections[0].id, "yolo11-001");
});

test("does not promote an upstream fallback to an actual YOLO result", async () => {
  await assert.rejects(
    detectWithYolo({
      url: "http://yolo:8000/detect",
      buffer: Buffer.from("image"),
      mimeType: "image/jpeg",
      fetchImpl: async () => response({ status: "fallback", actual: false, reason: "model unavailable", detections: [] }),
    }),
    (error) => error.code === "YOLO_FALLBACK_RESPONSE" && /model unavailable/.test(error.message),
  );
});

test("surfaces FastAPI detail for an invalid detector request", async () => {
  await assert.rejects(
    detectWithYolo({
      url: "http://yolo:8000/detect",
      buffer: Buffer.from("bad"),
      mimeType: "image/jpeg",
      fetchImpl: async () => response({ detail: "Uploaded file is not a valid image" }, { ok: false, status: 415 }),
    }),
    (error) => error.code === "YOLO_UPSTREAM_ERROR" && /not a valid image/.test(error.message),
  );
});

test("enforces a hard YOLO deadline when fetch ignores AbortSignal", async () => {
  let requestSignal;
  const startedAt = Date.now();
  await assert.rejects(
    detectWithYolo({
      url: "http://yolo:8000/detect",
      buffer: Buffer.from("image"),
      mimeType: "image/jpeg",
      timeoutMs: 25,
      fetchImpl: async (_url, init) => {
        requestSignal = init.signal;
        return new Promise(() => {});
      },
    }),
    (error) => error.code === "YOLO_TIMEOUT" && /25 ms/.test(error.message),
  );
  const elapsedMs = Date.now() - startedAt;
  assert.equal(requestSignal.aborted, true);
  assert.ok(elapsedMs >= 15 && elapsedMs < 500, `YOLO deadline took ${elapsedMs} ms`);
});

test("cancels YOLO immediately when the camera request is aborted", async () => {
  const controller = new AbortController();
  let requestSignal;
  const startedAt = Date.now();
  const pending = detectWithYolo({
    url: "http://yolo:8000/detect",
    buffer: Buffer.from("image"),
    mimeType: "image/jpeg",
    timeoutMs: 2_000,
    signal: controller.signal,
    fetchImpl: async (_url, init) => {
      requestSignal = init.signal;
      return new Promise(() => {});
    },
  });
  setTimeout(() => controller.abort(), 20);

  await assert.rejects(pending, (error) => error.code === "CAMERA_VISION_REQUEST_ABORTED");

  assert.equal(requestSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 500);
});
