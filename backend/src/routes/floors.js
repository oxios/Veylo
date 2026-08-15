const express = require("express");
const Floor = require("../models/floor");
const PlanAsset = require("../models/plan-asset");
const PlanElement = require("../models/plan-element");
const Zone = require("../models/zone");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { refreshLocationCounters } = require("../services/location-counters");
const { ownedFloor, ownedLocation } = require("../services/ownership");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/locations/:locationId/floors", asyncHandler(async (req, res) => {
  const location = await ownedLocation(req.params.locationId, req.user._id);
  const floors = await Floor.find({ locationId: location._id, ownerId: req.user._id }).sort({ level: 1 });
  res.json({ floors: floors.map((floor) => floor.toJSON()) });
}));

router.post("/locations/:locationId/floors", validate(schemas.floorCreate), asyncHandler(async (req, res) => {
  const location = await ownedLocation(req.params.locationId, req.user._id);
  const input = req.validated.body;
  let level = input.level;
  if (level === undefined) {
    const highest = await Floor.findOne({ locationId: location._id, ownerId: req.user._id }).sort({ level: -1 });
    level = (highest?.level || 0) + 1;
  }

  const floor = await Floor.create({
    ownerId: req.user._id,
    locationId: location._id,
    level,
    name: input.name,
    spaceType: input.spaceType,
    purpose: input.purpose,
    canvas: input.canvas,
  });
  const updatedLocation = await refreshLocationCounters(location._id, req.user._id);
  if (updatedLocation) {
    updatedLocation.readiness = Math.max(10, updatedLocation.readiness - 2);
    await updatedLocation.save();
  }
  res.status(201).json({ floor: floor.toJSON(), location: updatedLocation?.toJSON() });
}));

router.get("/floors/:floorId", asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  res.json({ floor: floor.toJSON() });
}));

router.patch("/floors/:floorId", validate(schemas.floorUpdate), asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const previousLevel = String(floor.level);
  const { canvas, ...fields } = req.validated.body;
  Object.assign(floor, fields);
  if (canvas) Object.assign(floor.canvas, canvas);
  await floor.save();

  let location;
  if (fields.level !== undefined && String(fields.level) !== previousLevel) {
    await Zone.updateMany({ floorId: floor._id, ownerId: req.user._id }, { $set: { floor: String(fields.level) } });
    location = await ownedLocation(String(floor.locationId), req.user._id);
    location.planFloors = location.planFloors.map((item) => item === previousLevel ? String(fields.level) : item);
    await location.save();
  }

  res.json({ floor: floor.toJSON(), location: location?.toJSON() });
}));

router.delete("/floors/:floorId", asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  await Promise.all([
    PlanAsset.deleteMany({ floorId: floor._id, ownerId: req.user._id }),
    PlanElement.deleteMany({ floorId: floor._id, ownerId: req.user._id }),
    Zone.deleteMany({ floorId: floor._id, ownerId: req.user._id }),
  ]);
  await floor.deleteOne();
  const location = await refreshLocationCounters(floor.locationId, req.user._id);
  if (location) {
    location.planFloors = location.planFloors.filter((item) => item !== String(floor.level));
    await location.save();
  }
  res.status(204).end();
}));

module.exports = router;
