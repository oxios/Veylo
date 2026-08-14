const { z } = require("zod");

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const finiteNumber = z.coerce.number().finite();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB id");

const coordinates = z.object({
  lat: finiteNumber.min(-90).max(90),
  lng: finiteNumber.min(-180).max(180),
});

const businessHours = z.string().trim().max(80).refine(
  (value) => /^(?:[01]\d|2[0-3]):[0-5]\d\s*[–-]\s*(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
  "Use a time range such as 08:00–22:00",
);

const locationFields = {
  name: trimmed(2, 120),
  city: trimmed(2, 120),
  address: trimmed(3, 240),
  format: trimmed(2, 80),
  timezone: trimmed(2, 80),
  capacity: finiteNumber.int().min(1).max(100_000),
  businessHours,
  coordinates,
};

const externalId = z.string().trim().regex(/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,99}$/u, "Invalid location id");
const locationCreate = z.object({ id: externalId.optional(), ...locationFields });
const locationUpdate = z.object({
  ...Object.fromEntries(Object.entries(locationFields).map(([key, value]) => [key, value.optional()])),
  status: z.enum(["ready", "attention", "setup"]).optional(),
  privacyConfigured: z.boolean().optional(),
  connectedSources: z.array(trimmed(1, 100)).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const canvas = z.object({
  width: finiteNumber.int().min(320).max(10_000).default(1200),
  height: finiteNumber.int().min(240).max(10_000).default(800),
  gridSize: finiteNumber.int().min(1).max(500).default(20),
});

const floorCreate = z.object({
  level: finiteNumber.int().min(-10).max(250).optional(),
  name: trimmed(1, 100).optional(),
  canvas: canvas.optional(),
});

const floorUpdate = z.object({
  level: finiteNumber.int().min(-10).max(250).optional(),
  name: trimmed(1, 100).optional(),
  canvas: z.object({
    width: finiteNumber.int().min(320).max(10_000).optional(),
    height: finiteNumber.int().min(240).max(10_000).optional(),
    gridSize: finiteNumber.int().min(1).max(500).optional(),
  }).refine((value) => Object.keys(value).length > 0, "At least one canvas field is required").optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const zoneFields = {
  name: trimmed(1, 100),
  type: trimmed(1, 80),
  capacity: finiteNumber.int().min(0).max(100_000).default(0),
  coverage: finiteNumber.min(0).max(100).default(0),
  left: finiteNumber.min(0).max(100),
  top: finiteNumber.min(0).max(100),
  width: finiteNumber.min(0.1).max(100),
  height: finiteNumber.min(0.1).max(100),
};

const boundsFit = (zone) => zone.left === undefined || zone.width === undefined ||
  zone.top === undefined || zone.height === undefined ||
  (zone.left + zone.width <= 100 && zone.top + zone.height <= 100);

const zoneCreate = z.object(zoneFields).refine(boundsFit, "Zone bounds must fit within the 0–100% canvas");
const zoneUpdate = z.object({
  name: trimmed(1, 100).optional(),
  type: trimmed(1, 80).optional(),
  capacity: finiteNumber.int().min(0).max(100_000).optional(),
  coverage: finiteNumber.min(0).max(100).optional(),
  left: finiteNumber.min(0).max(100).optional(),
  top: finiteNumber.min(0).max(100).optional(),
  width: finiteNumber.min(0.1).max(100).optional(),
  height: finiteNumber.min(0.1).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const planElementFields = {
  id: trimmed(1, 100).optional(),
  clientId: trimmed(1, 100).optional(),
  floor: trimmed(1, 20).optional(),
  kind: z.enum(["table", "camera", "wall", "door", "label"]).optional(),
  zoneId: objectId.nullable().optional(),
  type: z.enum(["table", "camera", "wall", "door", "label"]).optional(),
  x: finiteNumber.min(0).max(100),
  y: finiteNumber.min(0).max(100),
  width: finiteNumber.min(0.05).max(100),
  height: finiteNumber.min(0.05).max(100),
  rotation: finiteNumber.min(-360).max(360).default(0),
  label: z.string().trim().max(160).default(""),
  shape: z.enum(["rectangle", "round", "line", "icon"]).default("rectangle"),
  color: z.string().trim().regex(/^#[\da-f]{3,8}$/i, "Use a hex color").default("#5f746b"),
  zIndex: finiteNumber.int().min(-10_000).max(10_000).default(0),
  locked: z.boolean().default(false),
};

const normalizePlanElement = (value) => {
  const normalized = { ...value };
  if (value.clientId || value.id) normalized.clientId = value.clientId || value.id;
  if (value.kind || value.type) normalized.type = value.kind || value.type;
  delete normalized.id;
  delete normalized.kind;
  delete normalized.floor;
  return normalized;
};

const planElementCreate = z.object(planElementFields)
  .refine((value) => Boolean(value.kind || value.type), "kind is required")
  .refine((value) => value.x + value.width <= 100 && value.y + value.height <= 100,
    "Element bounds must fit within the 0–100% canvas")
  .transform(normalizePlanElement);
const planElementUpdate = z.object({
  id: trimmed(1, 100).optional(),
  clientId: trimmed(1, 100).optional(),
  floor: trimmed(1, 20).optional(),
  kind: z.enum(["table", "camera", "wall", "door", "label"]).optional(),
  type: z.enum(["table", "camera", "wall", "door", "label"]).optional(),
  zoneId: objectId.nullable().optional(),
  x: finiteNumber.min(0).max(100).optional(),
  y: finiteNumber.min(0).max(100).optional(),
  width: finiteNumber.min(0.05).max(100).optional(),
  height: finiteNumber.min(0.05).max(100).optional(),
  rotation: finiteNumber.min(-360).max(360).optional(),
  label: z.string().trim().max(160).optional(),
  shape: z.enum(["rectangle", "round", "line", "icon"]).optional(),
  color: z.string().trim().regex(/^#[\da-f]{3,8}$/i, "Use a hex color").optional(),
  zIndex: finiteNumber.int().min(-10_000).max(10_000).optional(),
  locked: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .transform(normalizePlanElement);
const planElementsBulk = z.object({
  elements: z.array(planElementCreate).max(500),
});

const login = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

module.exports = {
  login,
  locationCreate,
  locationUpdate,
  floorCreate,
  floorUpdate,
  zoneCreate,
  zoneUpdate,
  planElementCreate,
  planElementUpdate,
  planElementsBulk,
};
