const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeCameraSnapshot,
  buildDeterministicFallback,
  detectedImageMime,
  normalizeAnalysis,
} = require("../src/services/camera-vision-ai");
const { compactVisionContext } = require("../src/services/camera-vision-context");

function rawAnalysis() {
  return {
    layout: {
      summary: "По кадру виден основной гостевой зал.",
      confidence: 0.82,
      room: {
        name: "Главный зал",
        type: "Dining",
        confidence: 0.86,
        left: 8,
        top: 6,
        width: 84,
        height: 86,
        outline: [{ x: 8, y: 6 }, { x: 92, y: 6 }, { x: 92, y: 92 }, { x: 8, y: 92 }],
      },
      camera: {
        id: "camera-vision-1",
        label: "Камера по кадру",
        confidence: 0.72,
        x: 50,
        y: 96,
        rotation: 4,
        viewAngle: 88,
        viewRadius: 64,
      },
      objects: [
        { id: "table-1", kind: "table", label: "Стол 1", confidence: 0.8, x: 21, y: 30, width: 18, height: 12, rotation: 0, seats: 4 },
        { id: "door-1", kind: "door", label: "Вход", confidence: 0.7, x: 45, y: 6, width: 10, height: 3, rotation: 0, seats: 0 },
      ],
    },
    detections: [
      { id: "det-table", label: "table", confidence: 0.91, x: 18, y: 52, width: 34, height: 28 },
      { id: "det-person", label: "person", confidence: 0.88, x: 55, y: 18, width: 14, height: 58 },
    ],
    reconciliation: {
      status: "warning",
      score: 0.79,
      summary: "Стол совпадает, часть мест закрыта людьми.",
      counts: [
        { label: "Столы", plan: 1, detected: 1, status: "ok" },
        { label: "Места", plan: 4, detected: 0, status: "mismatch" },
        { label: "Люди", plan: 0, detected: 1, status: "warning" },
        { label: "Двери", plan: 1, detected: 0, status: "warning" },
      ],
      recommendations: ["Проверьте закрытые стулья."],
    },
    recommendedAnalytics: ["People count", "Occupancy", "Table service", "Privacy mask"],
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("normalizes room geometry, YOLO boxes, counts, and analytics", () => {
  const raw = rawAnalysis();
  raw.layout.room.left = 97;
  raw.layout.room.width = 18;
  raw.detections = [{ id: "same", label: "dining table", conf: 4, x: 0.2, y: 0.3, width: 0.5, height: 0.4 }];
  raw.recommendedAnalytics.push("unsupported");
  const result = normalizeAnalysis(raw);

  assert.equal(result.layout.room.x, 82);
  assert.equal(result.layout.room.width, 18);
  assert.deepEqual(result.detections[0], {
    id: "same",
    label: "table",
    confidence: 1,
    x: 20,
    y: 30,
    width: 50,
    height: 40,
  });
  assert.deepEqual(result.reconciliation.counts[0], { label: "Столы", plan: 0, detected: 1, status: "warning" });
  assert.equal(result.recommendedAnalytics.includes("unsupported"), false);
});

test("removes perspective clutter, low-confidence objects, and overlapping duplicates from the visible-zone plan", () => {
  const raw = rawAnalysis();
  raw.layout.objects = [
    { id: "table-best", kind: "table", label: "Стол", confidence: 0.91, x: 20, y: 30, width: 28, height: 18, rotation: 8, seats: 6 },
    { id: "table-duplicate", kind: "table", label: "Тот же стол", confidence: 0.72, x: 22, y: 31, width: 27, height: 18, rotation: 4, seats: 6 },
    { id: "seat-noise", kind: "seat", label: "Место", confidence: 0.95, x: 22, y: 55, width: 20, height: 18, rotation: 0, seats: 0 },
    { id: "person-noise", kind: "person", label: "Гость", confidence: 0.99, x: 50, y: 20, width: 20, height: 50, rotation: 0, seats: 0 },
    { id: "weak-door", kind: "door", label: "Возможно дверь", confidence: 0.4, x: 45, y: 8, width: 12, height: 4, rotation: 0, seats: 0 },
  ];

  const result = normalizeAnalysis(raw);

  assert.deepEqual(result.layout.objects.map((item) => item.id), ["table-best"]);
  assert.equal(result.layout.objects[0].rotation, 0);
  assert.ok(result.layout.objects[0].width <= result.layout.room.width * 0.28);
  assert.equal(result.layout.objects[0].seats, 6);
});

test("uses a deterministic and explicitly marked fallback without configured engines", async () => {
  const input = { buffer: Buffer.from("same-frame"), mimeType: "image/jpeg", fileName: "frame.jpg" };
  const config = { openAiApiKey: "", openAiPlanModel: "gpt-5.6", yoloApiUrl: "", yoloApiKey: "" };
  const first = await analyzeCameraSnapshot(input, { config });
  const second = await analyzeCameraSnapshot(input, { config });

  assert.equal(first.analysisId, second.analysisId);
  assert.deepEqual(first.layout, second.layout);
  assert.equal(first.engines.room.fallback, true);
  assert.equal(first.engines.detector.actual, false);
  assert.equal(first.engines.detector.fallback, true);
  assert.equal(first.status, "fallback");
  assert.equal(first.reconciliation.status, "warning");
  assert.match(first.reconciliation.summary, /Тестовый fallback/);
});

test("OpenAI Vision supplies layout, compatible detections, and reconciliation when YOLO is absent", async () => {
  let requestBody;
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    requestBody = JSON.parse(init.body);
    return jsonResponse({ output_text: JSON.stringify(rawAnalysis()) });
  };
  const result = await analyzeCameraSnapshot({
    buffer: Buffer.from("camera-frame"),
    mimeType: "image/jpeg",
    fileName: "frame.jpg",
  }, {
    config: { openAiApiKey: "test-key", openAiPlanModel: "gpt-5.6", yoloApiUrl: "", yoloApiKey: "" },
    fetchImpl,
  });

  assert.equal(requestBody.store, false);
  assert.deepEqual(requestBody.reasoning, { effort: "medium" });
  assert.equal(requestBody.input[0].content[1].detail, "high");
  assert.equal(requestBody.text.verbosity, "low");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(result.layout.room.name, "Главный зал");
  assert.equal(result.status, "completed");
  assert.equal(result.detections.length, 1);
  assert.equal(result.detections.some((item) => item.label === "person"), false);
  assert.equal(result.engines.room.actual, true);
  assert.equal(result.engines.detector.provider, "openai-vision");
  assert.equal(result.engines.detector.actual, false);
  assert.equal(result.engines.detector.fallback, true);
});

test("enforces a hard OpenAI deadline and falls back even when fetch ignores abort", async () => {
  let requestSignal;
  let calls = 0;
  const startedAt = Date.now();
  const result = await analyzeCameraSnapshot({
    buffer: Buffer.from("slow-camera-frame"),
    mimeType: "image/jpeg",
    fileName: "frame.jpg",
  }, {
    config: { openAiApiKey: "test-key", openAiPlanModel: "gpt-5.6", yoloApiUrl: "", yoloApiKey: "" },
    openAiTimeoutMs: 25,
    fetchImpl: async (_url, init) => {
      calls += 1;
      requestSignal = init.signal;
      return new Promise(() => {});
    },
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(calls, 1);
  assert.equal(requestSignal.aborted, true);
  assert.ok(elapsedMs >= 15 && elapsedMs < 500, `deadline took ${elapsedMs} ms`);
  assert.equal(result.status, "fallback");
  assert.equal(result.engines.room.status, "fallback");
  assert.match(result.engines.room.reason, /timed out after 25 ms/);
});

test("external YOLO detections override OpenAI boxes and are marked actual", async () => {
  const fetchImpl = async (url) => {
    if (String(url) === "http://vision.local/detect") {
      return jsonResponse({
        model: "licensed-yolo-test",
        detections: [{ id: "real-chair", label: "chair", confidence: 0.93, x: 0.1, y: 0.2, width: 0.2, height: 0.3 }],
      });
    }
    return jsonResponse({ output_text: JSON.stringify(rawAnalysis()) });
  };
  const result = await analyzeCameraSnapshot({
    buffer: Buffer.from("camera-frame"),
    mimeType: "image/png",
    fileName: "frame.png",
  }, {
    config: {
      openAiApiKey: "test-key",
      openAiPlanModel: "gpt-5.6",
      yoloApiUrl: "http://vision.local/detect",
      yoloApiKey: "detector-key",
    },
    fetchImpl,
  });

  assert.equal(result.detections.length, 1);
  assert.equal(result.detections[0].id, "real-chair");
  assert.equal(result.detections[0].label, "seat");
  assert.equal(result.detections[0].x, 10);
  assert.equal(result.engines.detector.provider, "yolo-http");
  assert.equal(result.engines.detector.actual, true);
  assert.equal(result.engines.detector.fallback, false);
  assert.deepEqual(result.reconciliation.counts[1], { label: "Места", plan: 4, detected: 1, status: "mismatch" });
});

test("keeps an existing room plan authoritative and excludes people from validation", () => {
  const raw = rawAnalysis();
  raw.layout.room.name = "Выдуманный GPT-зал";
  raw.detections = [
    { id: "person", label: "person", confidence: 0.98, x: 10, y: 10, width: 20, height: 60 },
    { id: "table", label: "table", confidence: 0.88, x: 30, y: 40, width: 30, height: 25 },
  ];
  const result = normalizeAnalysis(raw, undefined, {
    context: {
      mode: "existing-plan",
      placementMode: "manual",
      zone: { name: "Зал №2", type: "Dining", left: 10, top: 12, width: 78, height: 76 },
      camera: { id: "camera-plan", name: "Камера 2", x: 50, y: 90, rotation: 0, viewAngle: 90, viewRadius: 40 },
      plan: {
        elements: [
          { id: "saved-table", kind: "table", name: "Стол 12", x: 25, y: 35, width: 15, height: 10, seats: 4 },
          { id: "saved-wall", kind: "wall", name: "Стена", x: 10, y: 12, width: 78, height: 2 },
        ],
      },
    },
  });

  assert.equal(result.layout.room.name, "Зал №2");
  assert.equal(result.layout.confidence, 1);
  assert.deepEqual(result.layout.objects.map((item) => item.id), ["saved-table"]);
  assert.deepEqual(result.detections.map((item) => item.label), ["table"]);
  assert.equal(result.reconciliation.counts.some((item) => item.label === "Люди"), false);
  assert.deepEqual(result.reconciliation.counts[0], { label: "Столы", plan: 1, detected: 1, status: "ok" });
});

test("bounds the sequential YOLO phase before continuing with OpenAI", async () => {
  let yoloCalls = 0;
  let openAiCalls = 0;
  const startedAt = Date.now();
  const result = await analyzeCameraSnapshot({
    buffer: Buffer.from("camera-frame"),
    mimeType: "image/jpeg",
    fileName: "frame.jpg",
  }, {
    config: {
      openAiApiKey: "test-key",
      openAiPlanModel: "gpt-5.6",
      openAiCameraVisionTimeoutMs: 1_000,
      yoloApiUrl: "http://vision.local/detect",
      yoloApiKey: "",
      yoloDetectTimeoutMs: 25,
    },
    fetchImpl: async (url) => {
      if (String(url) === "http://vision.local/detect") {
        yoloCalls += 1;
        return new Promise(() => {});
      }
      openAiCalls += 1;
      return jsonResponse({ output_text: JSON.stringify(rawAnalysis()) });
    },
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(yoloCalls, 1);
  assert.equal(openAiCalls, 1);
  assert.ok(elapsedMs >= 15 && elapsedMs < 500, `sequential fallback took ${elapsedMs} ms`);
  assert.equal(result.status, "completed");
  assert.equal(result.engines.detector.fallback, true);
  assert.match(result.engines.detector.reason, /timed out after 25 ms/);
});

test("propagates client cancellation instead of producing a fallback", async () => {
  const controller = new AbortController();
  const pending = analyzeCameraSnapshot({
    buffer: Buffer.from("camera-frame"),
    mimeType: "image/jpeg",
    fileName: "frame.jpg",
  }, {
    config: {
      openAiApiKey: "test-key",
      openAiPlanModel: "gpt-5.6",
      yoloApiUrl: "http://vision.local/detect",
      yoloApiKey: "",
    },
    yoloTimeoutMs: 2_000,
    signal: controller.signal,
    fetchImpl: async () => new Promise(() => {}),
  });
  setTimeout(() => controller.abort(), 20);

  await assert.rejects(pending, (error) => error.code === "CAMERA_VISION_REQUEST_ABORTED");
});

test("recognizes only supported snapshot signatures", () => {
  assert.equal(detectedImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(detectedImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectedImageMime(Buffer.from("not-an-image")), null);
  assert.match(buildDeterministicFallback({ reason: "offline" }).fallbackReason, /offline/);
});

test("keeps a bounded existing-plan subset for GPT reconciliation", () => {
  const context = compactVisionContext({
    mode: "existing-plan",
    placementMode: "manual",
    camera: { label: "Камера 1", x: 52, y: 91, width: 4, height: 4 },
    zone: { name: "Главный зал", type: "Dining", left: 5, top: 6, width: 90, height: 88 },
    plan: {
      zones: [{ name: "Главный зал", left: 5, top: 6, width: 90, height: 88 }],
      elements: Array.from({ length: 180 }, (_, index) => ({ kind: "table", label: `Стол ${index + 1}`, x: index % 80, y: 20, width: 5, height: 5, seats: 4 })),
    },
  });

  assert.equal(context.mode, "existing-plan");
  assert.equal(context.placementMode, "manual");
  assert.equal(context.zone.name, "Главный зал");
  assert.equal(context.plan.zones.length, 1);
  assert.equal(context.plan.elements.length, 150);
  assert.deepEqual(context.plan.elements[0], {
    kind: "table",
    name: "Стол 1",
    type: "",
    x: 0,
    y: 20,
    left: 0,
    top: 20,
    width: 5,
    height: 5,
    rotation: 0,
    seats: 4,
  });
});
