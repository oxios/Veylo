const express = require("express");
const Zone = require("../models/zone");
const PlanElement = require("../models/plan-element");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { refreshLocationCounters } = require("../services/location-counters");
const { ownedFloor, ownedLocation, ownedZone } = require("../services/ownership");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

async function allocatedCapacity(locationId, ownerId, excludingZoneId) {
  const query = { locationId, ownerId };
  if (excludingZoneId) query._id = { $ne: excludingZoneId };
  const result = await Zone.aggregate([
    { $match: query },
    { $group: { _id: null, capacity: { $sum: "$capacity" } } },
  ]);
  return result[0]?.capacity || 0;
}

async function ensureZoneCapacity(location, ownerId, requestedCapacity, excludingZoneId) {
  const allocated = await allocatedCapacity(location._id, ownerId, excludingZoneId);
  if (allocated + requestedCapacity > location.capacity) {
    throw new ApiError(
      409,
      `Zone capacity exceeds the location limit; ${location.capacity - allocated} places remain`,
      "CAPACITY_CONFLICT",
    );
  }
}

function ensureBounds(zone) {
  if (zone.left + zone.width > 100 || zone.top + zone.height > 100) {
    throw new ApiError(422, "Zone bounds must fit within the 0–100% canvas", "INVALID_ZONE_BOUNDS");
  }
}

router.get("/floors/:floorId/zones", asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const zones = await Zone.find({ floorId: floor._id, ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ zones: zones.map((zone) => zone.toJSON()) });
}));

router.post("/floors/:floorId/zones", validate(schemas.zoneCreate), asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const location = await ownedLocation(String(floor.locationId), req.user._id);
  await ensureZoneCapacity(location, req.user._id, req.validated.body.capacity);

  const zone = await Zone.create({
    ...req.validated.body,
    ownerId: req.user._id,
    locationId: location._id,
    floorId: floor._id,
    floor: String(floor.level),
    cameras: [],
    source: "manual",
  });
  const updatedLocation = await refreshLocationCounters(location._id, req.user._id);
  if (updatedLocation) {
    updatedLocation.readiness = Math.min(99, updatedLocation.readiness + 12);
    await updatedLocation.save();
  }
  res.status(201).json({ zone: zone.toJSON(), location: updatedLocation?.toJSON() });
}));

router.get("/zones/:zoneId", asyncHandler(async (req, res) => {
  const zone = await ownedZone(req.params.zoneId, req.user._id);
  res.json({ zone: zone.toJSON() });
}));

router.patch("/zones/:zoneId", validate(schemas.zoneUpdate), asyncHandler(async (req, res) => {
  const zone = await ownedZone(req.params.zoneId, req.user._id);
  const location = await ownedLocation(String(zone.locationId), req.user._id);
  const merged = { ...zone.toObject(), ...req.validated.body };
  ensureBounds(merged);
  await ensureZoneCapacity(location, req.user._id, merged.capacity, zone._id);
  Object.assign(zone, req.validated.body);
  await zone.save();
  res.json({ zone: zone.toJSON() });
}));

router.delete("/zones/:zoneId", asyncHandler(async (req, res) => {
  const zone = await ownedZone(req.params.zoneId, req.user._id);
  await PlanElement.updateMany(
    { zoneId: zone._id, ownerId: req.user._id },
    { $set: { zoneId: null } },
  );
  await zone.deleteOne();
  await refreshLocationCounters(zone.locationId, req.user._id);
  res.status(204).end();
}));

module.exports = router;
