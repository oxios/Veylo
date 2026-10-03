const mongoose = require("mongoose");
const Camera = require("../models/camera");
const Venue = require("../models/venue");
const Video = require("../models/video");
const ApiError = require("../utils/api-error");

// Another owner's resource is indistinguishable from a missing one: always 404, never 403.
async function ownedResource(Model, id, ownerId, code, label, select) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new ApiError(404, `${label} not found`, code);
  const query = Model.findOne({ _id: id, ownerId });
  if (select) query.select(select);
  const resource = await query;
  if (!resource) throw new ApiError(404, `${label} not found`, code);
  return resource;
}

const ownedVenue = (id, ownerId) => ownedResource(Venue, id, ownerId, "VENUE_NOT_FOUND", "Venue");
const ownedCamera = (id, ownerId, select) => ownedResource(Camera, id, ownerId, "CAMERA_NOT_FOUND", "Camera", select);
const ownedVideo = (id, ownerId, select) => ownedResource(Video, id, ownerId, "VIDEO_NOT_FOUND", "Video", select);

module.exports = { ownedVenue, ownedCamera, ownedVideo };
