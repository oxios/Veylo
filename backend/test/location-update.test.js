const test = require("node:test");
const assert = require("node:assert/strict");
const schemas = require("../src/validation/schemas");

test("location update keeps the complete configured camera workflow", () => {
  const result = schemas.locationUpdate.safeParse({
    cameras: 1,
    online: 1,
    readiness: 48,
    privacyConfigured: true,
    configuredCameras: [{
      id: "CAM-01",
      name: "Камера 1 · Зал №2",
      floor: "1 этаж · Основной",
      zone: "Зал №2",
      zoneId: "66bb7f40de82a720bd193a55",
      source: "ONVIF · Hikvision DS-2CD",
      sourceType: "onvif",
      sourceRef: "192.168.1.42",
      analytics: ["People count"],
      status: "degraded",
      calibrated: false,
      retentionDays: 30,
      rawVideo: "local",
      privacy: { blur: true, audio: false },
      planElementId: "camera-1",
      snapshotId: "frame-1",
      snapshotCapturedAt: "2026-08-15T12:30:00.000Z",
      height: 3.2,
      angle: 72,
      orientation: 118,
    }],
  });

  assert.equal(result.success, true);
  assert.equal(result.data.configuredCameras[0].planElementId, "camera-1");
  assert.equal(result.data.configuredCameras[0].snapshotId, "frame-1");
  assert.equal(result.data.configuredCameras[0].zoneId, "66bb7f40de82a720bd193a55");
  assert.equal(result.data.online, 1);
});

test("configured camera rejects a non-ISO snapshot timestamp", () => {
  const result = schemas.locationUpdate.safeParse({
    configuredCameras: [{
      id: "CAM-01",
      name: "Камера 1",
      floor: "1 этаж",
      zone: "Зал",
      source: "RTSP URL",
      analytics: ["People count"],
      status: "degraded",
      calibrated: false,
      snapshotCapturedAt: "12:30:00",
    }],
  });

  assert.equal(result.success, false);
});
