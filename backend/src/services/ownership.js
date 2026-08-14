const Floor = require("../models/floor");
const Location = require("../models/location");
const PlanElement = require("../models/plan-element");
const Zone = require("../models/zone");
const ApiError = require("../utils/api-error");
const { requireObjectId } = require("../utils/id");

async function ownedLocation(id, ownerId) {
  const selectors = [{ externalId: id }];
  if (/^[a-f\d]{24}$/i.test(id)) selectors.push({ _id: id });
  const location = await Location.findOne({ ownerId, $or: selectors });
  if (!location) throw new ApiError(404, "Location not found", "LOCATION_NOT_FOUND");
  return location;
}

async function ownedFloor(id, ownerId) {
  requireObjectId(id, "floorId");
  const floor = await Floor.findOne({ _id: id, ownerId });
  if (!floor) throw new ApiError(404, "Floor not found", "FLOOR_NOT_FOUND");
  return floor;
}

async function ownedZone(id, ownerId) {
  requireObjectId(id, "zoneId");
  const zone = await Zone.findOne({ _id: id, ownerId });
  if (!zone) throw new ApiError(404, "Zone not found", "ZONE_NOT_FOUND");
  return zone;
}

async function ownedPlanElement(id, ownerId) {
  const selectors = [{ clientId: id }];
  if (/^[a-f\d]{24}$/i.test(id)) selectors.push({ _id: id });
  const element = await PlanElement.findOne({ ownerId, $or: selectors });
  if (!element) throw new ApiError(404, "Plan element not found", "PLAN_ELEMENT_NOT_FOUND");
  return element;
}

module.exports = { ownedLocation, ownedFloor, ownedZone, ownedPlanElement };
