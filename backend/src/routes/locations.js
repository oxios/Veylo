const express = require("express");
const Floor = require("../models/floor");
const Location = require("../models/location");
const PlanElement = require("../models/plan-element");
const PlanAsset = require("../models/plan-asset");
const Zone = require("../models/zone");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { ownedLocation } = require("../services/ownership");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

async function ensureCapacity(locationId, ownerId, capacity) {
  const aggregate = await Zone.aggregate([
    { $match: { locationId, ownerId } },
    { $group: { _id: null, capacity: { $sum: "$capacity" } } },
  ]);
  const allocated = aggregate[0]?.capacity || 0;
  if (capacity < allocated) {
    throw new ApiError(409, `Capacity cannot be lower than ${allocated}, already allocated to zones`, "CAPACITY_CONFLICT");
  }
}

async function createLocationWithDefaultFloor(ownerId, input, fallbackExternalId) {
  const { id, ...fields } = input;
  const location = await Location.create({
    ...fields,
    externalId: id || fallbackExternalId,
    ownerId,
    floors: 0,
    zones: 0,
    cameras: 0,
    online: 0,
    readiness: 18,
    status: "setup",
    demoSeeded: false,
    privacyConfigured: false,
    historyDays: 0,
    planFloors: [],
    connectedSources: [],
    configuredCameras: [],
    configuredScreens: [],
    zoneCameraLinks: {},
  });

  try {
    const floor = await Floor.create({
      ownerId,
      locationId: location._id,
      level: 1,
      name: "1 этаж · Основной",
      canvas: { width: 1200, height: 800, gridSize: 20 },
    });
    location.floors = 1;
    await location.save();
    return { location, floor };
  } catch (error) {
    await Location.deleteOne({ _id: location._id, ownerId });
    throw error;
  }
}

router.get("/", asyncHandler(async (req, res) => {
  const locations = await Location.find({ ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ locations: locations.map((location) => location.toJSON()) });
}));

router.post("/", validate(schemas.locationCreate), asyncHandler(async (req, res) => {
  const created = await createLocationWithDefaultFloor(req.user._id, req.validated.body);
  res.status(201).json({
    location: created.location.toJSON(),
    floor: created.floor.toJSON(),
  });
}));

router.get("/:locationId", asyncHandler(async (req, res) => {
  const location = await ownedLocation(req.params.locationId, req.user._id);
  res.json({ location: location.toJSON() });
}));

router.put("/:locationId", validate(schemas.locationCreate), asyncHandler(async (req, res) => {
  const { id, ...fields } = req.validated.body;
  let location = null;
  try {
    location = await ownedLocation(req.params.locationId, req.user._id);
  } catch (error) {
    if (error.code !== "LOCATION_NOT_FOUND") throw error;
  }

  if (!location) {
    if (id && id !== req.params.locationId) {
      throw new ApiError(409, "Body id must match the URL when creating a location with PUT", "ID_MISMATCH");
    }
    const created = await createLocationWithDefaultFloor(req.user._id, req.validated.body, req.params.locationId);
    return res.status(201).json({ location: created.location.toJSON(), floor: created.floor.toJSON() });
  }

  if (id && id !== location.toJSON().id && id !== req.params.locationId) {
    throw new ApiError(409, "Location id cannot be changed", "ID_MISMATCH");
  }
  await ensureCapacity(location._id, req.user._id, fields.capacity);
  Object.assign(location, fields);
  await location.save();
  return res.json({ location: location.toJSON() });
}));

router.patch("/:locationId", validate(schemas.locationUpdate), asyncHandler(async (req, res) => {
  const location = await ownedLocation(req.params.locationId, req.user._id);
  if (req.validated.body.capacity !== undefined) {
    await ensureCapacity(location._id, req.user._id, req.validated.body.capacity);
  }
  Object.assign(location, req.validated.body);
  await location.save();
  res.json({ location: location.toJSON() });
}));

router.delete("/:locationId", asyncHandler(async (req, res) => {
  const location = await ownedLocation(req.params.locationId, req.user._id);
  await Promise.all([
    PlanAsset.deleteMany({ locationId: location._id, ownerId: req.user._id }),
    PlanElement.deleteMany({ locationId: location._id, ownerId: req.user._id }),
    Zone.deleteMany({ locationId: location._id, ownerId: req.user._id }),
    Floor.deleteMany({ locationId: location._id, ownerId: req.user._id }),
  ]);
  await location.deleteOne();
  res.status(204).end();
}));

module.exports = router;
