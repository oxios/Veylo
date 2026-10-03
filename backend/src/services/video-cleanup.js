const env = require("../config/env");
const Track = require("../models/track");
const Video = require("../models/video");
const { removeQuietly, storagePath } = require("./video-files");

// Deletes videos with their tracks and stored files. The worker notices a missing video and aborts.
async function deleteVideos(filter, { VideoModel = Video, TrackModel = Track, remove = removeQuietly, storageDir = env.videoStorageDir } = {}) {
  const videos = await VideoModel.find(filter).select("+storageKey +snapshotKey");
  if (!videos.length) return 0;
  const ids = videos.map((video) => video._id);
  await VideoModel.deleteMany({ _id: { $in: ids } });
  await TrackModel.deleteMany({ videoId: { $in: ids } });
  for (const video of videos) {
    for (const key of [video.storageKey, video.snapshotKey]) {
      if (key) await remove(storagePath(storageDir, key));
    }
  }
  return videos.length;
}

module.exports = { deleteVideos };
