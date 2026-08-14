function round(value) {
  return Math.round(value * 1000) / 1000;
}

function toFrontendPlanElement(element, floor) {
  return {
    id: element.clientId || String(element._id),
    floor: String(floor.level),
    kind: element.type,
    x: round((element.x / floor.canvas.width) * 100),
    y: round((element.y / floor.canvas.height) * 100),
    width: round((element.width / floor.canvas.width) * 100),
    height: round((element.height / floor.canvas.height) * 100),
    rotation: element.rotation,
    label: element.label || "",
    zoneId: element.zoneId ? String(element.zoneId) : null,
    shape: element.shape,
    color: element.color,
    zIndex: element.zIndex,
    locked: element.locked,
    source: element.source,
  };
}

function toStoredPlanElement(input, floor, context = {}) {
  return {
    ...context,
    clientId: input.clientId,
    zoneId: input.zoneId || null,
    type: input.type,
    x: (input.x / 100) * floor.canvas.width,
    y: (input.y / 100) * floor.canvas.height,
    width: Math.max(1, (input.width / 100) * floor.canvas.width),
    height: Math.max(1, (input.height / 100) * floor.canvas.height),
    rotation: input.rotation,
    label: input.label,
    shape: input.shape,
    color: input.color,
    zIndex: input.zIndex,
    locked: input.locked,
    source: context.source || "manual",
  };
}

module.exports = { toFrontendPlanElement, toStoredPlanElement };
