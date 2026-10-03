const express = require("express");
const env = require("../config/env");
const { ownedVideo } = require("../services/ownership");
const { deleteVideos } = require("../services/video-cleanup");
const { storagePath } = require("../services/video-files");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

router.get("/:videoId", asyncHandler(async (req, res) => {
  const video = await ownedVideo(req.params.videoId, req.user._id);
  res.json({ video: video.toJSON() });
}));

router.delete("/:videoId", asyncHandler(async (req, res) => {
  const video = await ownedVideo(req.params.videoId, req.user._id);
  await deleteVideos({ _id: video._id, ownerId: req.user._id });
  res.status(204).end();
}));

router.get("/:videoId/snapshot", asyncHandler(async (req, res) => {
  const video = await ownedVideo(req.params.videoId, req.user._id, "+snapshotKey");
  if (!video.snapshotKey) throw new ApiError(404, "Snapshot is not ready", "SNAPSHOT_NOT_FOUND");
  res.set("Cache-Control", "private, no-cache");
  res.type("image/jpeg").sendFile(storagePath(env.videoStorageDir, video.snapshotKey));
}));

module.exports = router;
