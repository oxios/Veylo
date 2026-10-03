const env = require("../config/env");
const Camera = require("../models/camera");
const CameraHour = require("../models/camera-hour");
const LiveTrack = require("../models/live-track");
const Visit = require("../models/visit");
const ApiError = require("../utils/api-error");
const { clearNow } = require("./live-pipeline");
const { open, seal } = require("./secret-box");
const { displayAddress, parseRtspInput, withCredentials } = require("./rtsp-url");
const { deleteVideos } = require("./video-cleanup");
const { removeQuietly, storagePath } = require("./video-files");

const MARKUP_KEYS = ["entryLine", "hallZone", "streetZone", "doorZone", "staffZone", "queueZone", "tables"];

// Seals main and sub addresses. An empty password keeps the previously stored one (edit form never sees it).
function sealRtsp(input, previous = null) {
  let previousPassword = "";
  let previousUser = "";
  if (previous?.rtspMainSealed) {
    try {
      const parsed = parseRtspInput(open(previous.rtspMainSealed));
      previousPassword = parsed.password;
      previousUser = parsed.username;
    } catch {
      // unreadable (different key): the owner must type the password again
    }
  }
  const main = parseRtspInput(input.url, { username: input.username, password: input.password });
  if (!main.password && previousPassword && (!main.username || main.username === previousUser)) {
    main.password = previousPassword;
    main.username = main.username || previousUser;
  }
  const fields = {
    rtspMainSealed: seal(withCredentials(main.address, main.username, main.password)),
    rtspDisplay: displayAddress(main.address),
    rtspUsername: main.username,
    rtspSubSealed: "",
    rtspSubDisplay: "",
  };
  if (input.subUrl) {
    const sub = parseRtspInput(input.subUrl);
    if (sub.address === main.address) throw new ApiError(422, "Substream must differ from the main stream", "INVALID_RTSP_URL");
    // The substream normally shares the camera's credentials.
    fields.rtspSubSealed = seal(withCredentials(sub.address, sub.username || main.username, sub.password || main.password));
    fields.rtspSubDisplay = displayAddress(sub.address);
  }
  return { fields, main: withCredentials(main.address, main.username, main.password), sub: fields.rtspSubSealed ? open(fields.rtspSubSealed) : "" };
}

function storedUrls(camera) {
  return {
    main: camera.rtspMainSealed ? open(camera.rtspMainSealed) : "",
    sub: camera.rtspSubSealed ? open(camera.rtspSubSealed) : "",
  };
}

const markupChanged = (update) => MARKUP_KEYS.some((key) => key in update) || "kind" in update;

// Removes everything that belongs to a camera: videos (+ tracks, files), live tracks, hourly aggregates, snapshot.
async function deleteCameraData(camera) {
  await deleteVideos({ cameraId: camera._id, ownerId: camera.ownerId });
  await LiveTrack.deleteMany({ cameraId: camera._id });
  await CameraHour.deleteMany({ cameraId: camera._id });
  await Visit.deleteMany({ cameraId: camera._id });
  const withSnapshot = await Camera.findById(camera._id).select("+snapshotKey").lean();
  if (withSnapshot?.snapshotKey) await removeQuietly(storagePath(env.videoStorageDir, withSnapshot.snapshotKey));
  clearNow(camera._id);
}

module.exports = { sealRtsp, storedUrls, markupChanged, deleteCameraData, MARKUP_KEYS };
