const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCameraRemovalPipeline,
  deriveCameraRemovalState,
  removeConfiguredCamera,
} = require("../src/services/camera-removal");

function camera(id, overrides = {}) {
  return {
    id,
    name: id,
    status: "online",
    sourceType: "rtsp",
    calibrated: true,
    privacy: { blur: true, audio: false },
    planElementId: `plan-${id}`,
    ...overrides,
  };
}

function matchesLocation(record, filter) {
  if (String(record.ownerId) !== String(filter.ownerId)) return false;
  return filter.$or.some((selector) =>
    (selector.externalId !== undefined && record.externalId === selector.externalId) ||
    (selector._id !== undefined && String(record._id) === String(selector._id)));
}

function fakeLocationModel(seed) {
  const records = seed.map((item) => structuredClone(item));
  const calls = [];
  return {
    calls,
    records,
    async findOneAndUpdate(filter, pipeline) {
      calls.push({ method: "findOneAndUpdate", filter, pipeline });
      const record = records.find((item) => matchesLocation(item, filter));
      if (!record || !record.configuredCameras.some((item) => item.id === filter["configuredCameras.id"])) return null;
      Object.assign(record, deriveCameraRemovalState(record, filter["configuredCameras.id"]));
      return record;
    },
    async findOne(filter) {
      calls.push({ method: "findOne", filter });
      return records.find((item) => matchesLocation(item, filter)) || null;
    },
  };
}

function location(overrides = {}) {
  return {
    _id: "66bb7f40de82a720bd193a55",
    externalId: "promprylad",
    ownerId: "owner-a",
    cameras: 3,
    online: 2,
    readiness: 88,
    privacyConfigured: true,
    status: "ready",
    configuredCameras: [
      camera("CAM-01"),
      camera("CAM-02", { status: "degraded", sourceType: "upload", calibrated: false }),
      camera("CAM-03", { status: "offline", calibrated: false }),
    ],
    zoneCameraLinks: {
      "zone-a": ["CAM-01", "CAM-02"],
      "zone-b": ["CAM-02", "CAM-03"],
      "zone-c": ["CAM-03"],
    },
    ...overrides,
  };
}

test("atomically removes a configured camera and recalculates derived location state", async () => {
  const Model = fakeLocationModel([location()]);
  const updated = await removeConfiguredCamera({
    locationId: "promprylad",
    ownerId: "owner-a",
    cameraId: "CAM-01",
    LocationModel: Model,
  });

  assert.deepEqual(updated.configuredCameras.map((item) => item.id), ["CAM-02", "CAM-03"]);
  assert.equal(updated.cameras, 2);
  assert.equal(updated.online, 1);
  assert.equal(updated.readiness, 63);
  assert.equal(updated.privacyConfigured, true);
  assert.equal(updated.status, "attention");
  assert.deepEqual(updated.zoneCameraLinks, {
    "zone-a": ["CAM-02"],
    "zone-b": ["CAM-02", "CAM-03"],
    "zone-c": ["CAM-03"],
  });
  assert.equal(Model.calls.length, 1);
  assert.equal(Model.calls[0].method, "findOneAndUpdate");
  assert.equal(Array.isArray(Model.calls[0].pipeline), true);
});

test("keeps every other camera and its physical plan-element reference", async () => {
  const Model = fakeLocationModel([location()]);
  const updated = await removeConfiguredCamera({
    locationId: "66bb7f40de82a720bd193a55",
    ownerId: "owner-a",
    cameraId: "CAM-02",
    LocationModel: Model,
  });

  assert.deepEqual(updated.configuredCameras.map((item) => [item.id, item.planElementId]), [
    ["CAM-01", "plan-CAM-01"],
    ["CAM-03", "plan-CAM-03"],
  ]);
  assert.equal(updated.online, 2, "temporary MP4 did not contribute to online count");
  assert.equal(updated.readiness, 82, "temporary MP4 contributes six readiness points");
  assert.equal(JSON.stringify(buildCameraRemovalPipeline("CAM-02")).includes("PlanElement"), false);
});

test("returns LOCATION_NOT_FOUND for another owner's location without mutating it", async () => {
  const original = location({ ownerId: "owner-b" });
  const Model = fakeLocationModel([original]);
  await assert.rejects(
    removeConfiguredCamera({
      locationId: "promprylad",
      ownerId: "owner-a",
      cameraId: "CAM-01",
      LocationModel: Model,
    }),
    (error) => error.status === 404 && error.code === "LOCATION_NOT_FOUND",
  );
  assert.equal(Model.records[0].configuredCameras.length, 3);
});

test("returns CAMERA_NOT_FOUND when the owned location has no such camera", async () => {
  const Model = fakeLocationModel([location()]);
  await assert.rejects(
    removeConfiguredCamera({
      locationId: "promprylad",
      ownerId: "owner-a",
      cameraId: "CAM-99",
      LocationModel: Model,
    }),
    (error) => error.status === 404 && error.code === "CAMERA_NOT_FOUND",
  );
  assert.deepEqual(Model.records[0].configuredCameras.map((item) => item.id), ["CAM-01", "CAM-02", "CAM-03"]);
});

test("last camera removal resets setup and privacy state", () => {
  const state = deriveCameraRemovalState(location({
    cameras: 1,
    online: 1,
    readiness: 43,
    configuredCameras: [camera("CAM-01")],
    zoneCameraLinks: new Map([["zone-a", ["CAM-01"]]]),
  }), "CAM-01");

  assert.equal(state.cameras, 0);
  assert.equal(state.online, 0);
  assert.equal(state.readiness, 18);
  assert.equal(state.privacyConfigured, false);
  assert.equal(state.status, "setup");
  assert.deepEqual(state.zoneCameraLinks, { "zone-a": [] });
});
