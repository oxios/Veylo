function shortText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function finitePercent(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

function compactPlanBox(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const width = finitePercent(value.width, 1);
  const height = finitePercent(value.height, 1);
  const x = finitePercent(value.x ?? value.left, 0);
  const y = finitePercent(value.y ?? value.top, 0);
  return {
    ...(options.kind ? { kind: shortText(value.kind || value.type, 24) } : {}),
    name: shortText(value.name || value.label, 120),
    type: shortText(value.type, 80),
    x,
    y,
    left: x,
    top: y,
    width: Math.min(width, 100 - x),
    height: Math.min(height, 100 - y),
    rotation: Math.min(360, Math.max(-360, Number(value.rotation) || 0)),
    seats: Math.min(50, Math.max(0, Math.round(Number(value.seats) || 0))),
  };
}

function compactVisionContext(requestedContext = {}) {
  const camera = compactPlanBox(requestedContext.camera, { kind: true });
  const zone = compactPlanBox(requestedContext.zone);
  const zones = (Array.isArray(requestedContext.plan?.zones) ? requestedContext.plan.zones : [])
    .slice(0, 30)
    .map((item) => compactPlanBox(item))
    .filter(Boolean);
  const elements = (Array.isArray(requestedContext.plan?.elements) ? requestedContext.plan.elements : [])
    .slice(0, 150)
    .map((item) => compactPlanBox(item, { kind: true }))
    .filter(Boolean);
  return {
    mode: requestedContext.mode === "existing-plan" ? "existing-plan" : "video-plan",
    placementMode: requestedContext.placementMode === "manual" ? "manual" : "auto",
    camera,
    zone,
    plan: { zones, elements },
  };
}

module.exports = { compactVisionContext };
