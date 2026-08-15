const test = require("node:test");
const assert = require("node:assert/strict");
const { extractResponseText, normalizeAnalysis, parseJsonResponse } = require("../src/services/image-plan-ai");

test("extracts JSON text from a Responses API message", () => {
  const text = extractResponseText({
    output: [{ content: [{ type: "output_text", text: "```json\n{\"zones\":[]}\n```" }] }],
  });
  assert.deepEqual(parseJsonResponse(text), { zones: [] });
});

test("normalizes AI geometry and removes unsupported kinds", () => {
  const result = normalizeAnalysis({
    confidence: 3,
    summary: "Черновик",
    zones: [{ name: "Зал", type: "Dining", left: 95, top: -5, width: 20, height: 15 }],
    elements: [
      { kind: "table", x: 98, y: 99, width: 8, height: 7, label: "Стол" },
      { kind: "rtsp", x: 1, y: 1, width: 1, height: 1 },
    ],
  });
  assert.equal(result.confidence, 1);
  assert.equal(result.zones[0].left, 80);
  assert.equal(result.zones[0].top, 0);
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].x, 92);
  assert.equal(result.elements[0].y, 93);
});
