function round(value) {
  return Math.round(value * 1000) / 1000;
}

function inferTableSeats({ type, seats, label, width }, floor) {
  if (type !== "table") return 0;
  const explicit = Number(seats);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(50, Math.max(1, Math.round(explicit)));
  const labelMatch = String(label || "").match(/\b(\d{1,2})\s*(?:мест(?:а)?|seats?)\b/i);
  if (labelMatch) return Math.min(50, Math.max(1, Number(labelMatch[1])));
  if (/барн|bar\s*counter/i.test(String(label || ""))) return 6;
  const widthPercent = floor && Number(width) > 100 ? (Number(width) / floor.canvas.width) * 100 : Number(width);
  return Number.isFinite(widthPercent) && widthPercent >= 12 ? 8 : 4;
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
    viewAngle: element.viewAngle,
    viewRadius: element.viewRadius,
    viewEnabled: element.viewEnabled,
    seats: inferTableSeats(element, floor),
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
    viewAngle: input.viewAngle,
    viewRadius: input.viewRadius,
    viewEnabled: input.viewEnabled,
    seats: inferTableSeats({ ...input, type: input.type }, floor),
    source: context.source || "manual",
  };
}

module.exports = { inferTableSeats, toFrontendPlanElement, toStoredPlanElement };
