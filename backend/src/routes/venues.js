const express = require("express");
const Camera = require("../models/camera");
const Person = require("../models/person");
const Staff = require("../models/staff");
const Venue = require("../models/venue");
const Video = require("../models/video");
const Visit = require("../models/visit");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { deleteCameraData } = require("../services/cameras");
const { camerasWithStatus, notifyConfig } = require("../services/nodes");
const { ownedVenue } = require("../services/ownership");
const { deleteVideos } = require("../services/video-cleanup");
const { createCamera } = require("./cameras");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  const venues = await Venue.find({ ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ venues: venues.map((venue) => venue.toJSON()) });
}));

router.post("/", validate(schemas.venueCreate), asyncHandler(async (req, res) => {
  const venue = await Venue.create({ ...req.validated.body, ownerId: req.user._id });
  res.status(201).json({ venue: venue.toJSON() });
}));

router.patch("/:venueId", validate(schemas.venueUpdate), asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  venue.set(req.validated.body);
  await venue.save();
  res.json({ venue: venue.toJSON() });
}));

router.delete("/:venueId", asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const cameras = await Camera.find({ venueId: venue._id, ownerId: req.user._id });
  for (const camera of cameras) {
    await deleteCameraData(camera);
    await camera.deleteOne();
    notifyConfig(camera.nodeId);
  }
  await deleteVideos({ venueId: venue._id, ownerId: req.user._id });
  await Promise.all([Person.deleteMany({ venueId: venue._id }), Visit.deleteMany({ venueId: venue._id }), Staff.deleteMany({ venueId: venue._id })]);
  await venue.deleteOne();
  res.status(204).end();
}));

router.get("/:venueId/cameras", asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const cameras = await Camera.find({ venueId: venue._id, ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ cameras: await camerasWithStatus(cameras) });
}));

router.post("/:venueId/cameras", validate(schemas.cameraCreate), asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  res.status(201).json({ camera: await createCamera({ venue, ownerId: req.user._id, body: req.validated.body }) });
}));

router.get("/:venueId/videos", asyncHandler(async (req, res) => {
  const venue = await ownedVenue(req.params.venueId, req.user._id);
  const videos = await Video.find({ venueId: venue._id, ownerId: req.user._id }).sort({ createdAt: -1 }).limit(200);
  res.json({ videos: videos.map((video) => video.toJSON()) });
}));

module.exports = router;
