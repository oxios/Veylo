const test = require("node:test");
const assert = require("node:assert/strict");
const { toFrontendPlanElement, toStoredPlanElement } = require("../src/services/plan-elements");

const floor = { level: 1, canvas: { width: 1200, height: 800 } };

test("normalised canvas coordinates round-trip through storage coordinates", () => {
  const input = {
    clientId: "table-1",
    type: "table",
    x: 25,
    y: 10,
    width: 8,
    height: 12,
    rotation: 15,
    label: "Стол 1",
    shape: "round",
    color: "#d8b46b",
    zIndex: 2,
    locked: false,
    seats: 6,
  };
  const stored = toStoredPlanElement(input, floor);
  const output = toFrontendPlanElement({ ...stored, _id: "mongo-id" }, floor);

  assert.equal(stored.x, 300);
  assert.equal(stored.y, 80);
  assert.deepEqual(
    { x: output.x, y: output.y, width: output.width, height: output.height },
    { x: 25, y: 10, width: 8, height: 12 },
  );
  assert.equal(output.id, "table-1");
  assert.equal(output.kind, "table");
  assert.equal(output.floor, "1");
  assert.equal(output.shape, "round");
  assert.equal(output.color, "#d8b46b");
  assert.equal(output.zIndex, 2);
  assert.equal(output.locked, false);
  assert.equal(output.seats, 6);
});

test("infers a safe seat count for older table records", () => {
  const stored = toStoredPlanElement({
    clientId: "legacy-table",
    type: "table",
    x: 10,
    y: 10,
    width: 14,
    height: 7,
    rotation: 0,
    label: "Большой стол",
    shape: "rectangle",
    color: "#8d672f",
    zIndex: 0,
    locked: false,
  }, floor);
  assert.equal(stored.seats, 8);
});
