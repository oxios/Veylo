const ApiError = require("../utils/api-error");

function locationSelectors(locationId) {
  const selectors = [{ externalId: locationId }];
  if (/^[a-f\d]{24}$/i.test(locationId)) selectors.push({ _id: locationId });
  return selectors;
}

function cameraCountsAsOnline(camera) {
  return camera?.status !== "offline" && camera?.sourceType !== "upload";
}

function cameraReadinessContribution(camera) {
  const connection = camera?.sourceType === "upload" ? 6 : 10;
  return connection + (camera?.calibrated === true ? 15 : 0);
}

function privacyIsSafe(camera) {
  return camera?.privacy?.blur !== false && camera?.privacy?.audio !== true;
}

function linksObject(value) {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function deriveCameraRemovalState(location, cameraId) {
  const configuredCameras = Array.isArray(location?.configuredCameras) ? location.configuredCameras : [];
  const removedCamera = configuredCameras.find((camera) => camera?.id === cameraId);
  if (!removedCamera) return null;

  const remainingCameras = configuredCameras.filter((camera) => camera?.id !== cameraId);
  const totalCameras = Math.max(0, Number(location?.cameras || 0) - 1);
  const online = Math.max(0, Math.min(
    totalCameras,
    Number(location?.online || 0) - (cameraCountsAsOnline(removedCamera) ? 1 : 0),
  ));
  const zoneCameraLinks = Object.fromEntries(Object.entries(linksObject(location?.zoneCameraLinks)).map(([zoneId, ids]) => [
    zoneId,
    (Array.isArray(ids) ? ids : []).filter((id) => id !== cameraId),
  ]));
  const privacyConfigured = totalCameras > 0 &&
    remainingCameras.length === totalCameras &&
    remainingCameras.every(privacyIsSafe);

  return {
    configuredCameras: remainingCameras,
    cameras: totalCameras,
    online,
    readiness: Math.max(0, Number(location?.readiness || 0) - cameraReadinessContribution(removedCamera)),
    privacyConfigured,
    status: totalCameras === 0 ? "setup" : "attention",
    zoneCameraLinks,
  };
}

function buildCameraRemovalPipeline(cameraId) {
  const remainingCameras = {
    $filter: {
      input: { $ifNull: ["$configuredCameras", []] },
      as: "camera",
      cond: { $ne: ["$$camera.id", cameraId] },
    },
  };
  const cameraToRemove = {
    $first: {
      $filter: {
        input: { $ifNull: ["$configuredCameras", []] },
        as: "camera",
        cond: { $eq: ["$$camera.id", cameraId] },
      },
    },
  };
  const nextCameraCount = { $max: [0, { $subtract: [{ $ifNull: ["$cameras", 0] }, 1] }] };

  return [
    {
      $set: {
        __cameraToRemove: cameraToRemove,
        __remainingCameras: remainingCameras,
      },
    },
    {
      $set: {
        configuredCameras: "$__remainingCameras",
        cameras: nextCameraCount,
        online: {
          $let: {
            vars: {
              removedOnline: {
                $cond: [{
                  $and: [
                    { $ne: [{ $ifNull: ["$__cameraToRemove.status", "offline"] }, "offline"] },
                    { $ne: [{ $ifNull: ["$__cameraToRemove.sourceType", ""] }, "upload"] },
                  ],
                }, 1, 0],
              },
            },
            in: {
              $max: [0, {
                $min: [
                  nextCameraCount,
                  { $subtract: [{ $ifNull: ["$online", 0] }, "$$removedOnline"] },
                ],
              }],
            },
          },
        },
        readiness: {
          $let: {
            vars: {
              connectionContribution: {
                $cond: [{ $eq: [{ $ifNull: ["$__cameraToRemove.sourceType", ""] }, "upload"] }, 6, 10],
              },
              calibrationContribution: {
                $cond: [{ $eq: [{ $ifNull: ["$__cameraToRemove.calibrated", false] }, true] }, 15, 0],
              },
            },
            in: {
              $max: [0, {
                $subtract: [
                  { $ifNull: ["$readiness", 0] },
                  { $add: ["$$connectionContribution", "$$calibrationContribution"] },
                ],
              }],
            },
          },
        },
        privacyConfigured: {
          $and: [
            { $gt: [nextCameraCount, 0] },
            { $eq: [{ $size: "$__remainingCameras" }, nextCameraCount] },
            {
              $eq: [{
                $size: {
                  $filter: {
                    input: "$__remainingCameras",
                    as: "camera",
                    cond: {
                      $or: [
                        { $eq: [{ $ifNull: ["$$camera.privacy.blur", true] }, false] },
                        { $eq: [{ $ifNull: ["$$camera.privacy.audio", false] }, true] },
                      ],
                    },
                  },
                },
              }, 0],
            },
          ],
        },
        status: { $cond: [{ $eq: [nextCameraCount, 0] }, "setup", "attention"] },
        zoneCameraLinks: {
          $arrayToObject: {
            $map: {
              input: { $objectToArray: { $ifNull: ["$zoneCameraLinks", {}] } },
              as: "link",
              in: {
                k: "$$link.k",
                v: {
                  $filter: {
                    input: { $cond: [{ $isArray: "$$link.v" }, "$$link.v", []] },
                    as: "linkedCameraId",
                    cond: { $ne: ["$$linkedCameraId", cameraId] },
                  },
                },
              },
            },
          },
        },
        updatedAt: "$$NOW",
      },
    },
    { $unset: ["__cameraToRemove", "__remainingCameras"] },
  ];
}

async function removeConfiguredCamera({ locationId, ownerId, cameraId, LocationModel }) {
  const Model = LocationModel || require("../models/location");
  const baseFilter = { ownerId, $or: locationSelectors(locationId) };
  const updated = await Model.findOneAndUpdate(
    { ...baseFilter, "configuredCameras.id": cameraId },
    buildCameraRemovalPipeline(cameraId),
    { new: true },
  );
  if (updated) return updated;

  const location = await Model.findOne(baseFilter);
  if (!location) throw new ApiError(404, "Location not found", "LOCATION_NOT_FOUND");
  throw new ApiError(404, "Configured camera not found", "CAMERA_NOT_FOUND");
}

module.exports = {
  buildCameraRemovalPipeline,
  cameraCountsAsOnline,
  cameraReadinessContribution,
  deriveCameraRemovalState,
  locationSelectors,
  removeConfiguredCamera,
};
