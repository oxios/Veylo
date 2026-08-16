const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  AVI_TEMP_PREFIX,
  assertAviSignature,
  cleanupTemporaryAviDirectory,
  extractVideoFrame,
  isSupportedAviFile,
  resolveVideoFrameUrl,
} = require("../src/services/video-frame-extractor");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

async function fixture(payload = Buffer.from("RIFF\x08\x00\x00\x00AVI test")) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "venueflow-node-avi-test-"));
  const filePath = path.join(directory, "fixture.avi");
  await fs.promises.writeFile(filePath, payload);
  return {
    filePath,
    cleanup: () => fs.promises.rm(directory, { recursive: true, force: true }),
  };
}

function jpegResponse(buffer = JPEG, overrides = {}) {
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "x-frame-width": "640",
      "x-frame-height": "360",
      "x-video-width": "1280",
      "x-video-height": "720",
      "x-video-duration": "12.5",
      "x-video-frame-time": "6.2",
      "x-video-fps": "25",
      "x-video-frame-count": "312",
      "x-video-source-bytes": "4096",
      "x-video-engine": "opencv",
      ...overrides,
    },
  });
}

test("proxies an AVI as normalized video/x-msvideo and returns the frontend frame contract", async (t) => {
  const source = await fixture();
  t.after(source.cleanup);
  let sent;

  const result = await extractVideoFrame({
    url: "http://yolo:8000/video/frame",
    apiKey: "detector-secret",
    filePath: source.filePath,
    fileName: "../../camera TEST.AVI",
    fetchImpl: async (url, init) => {
      sent = { url: String(url), init };
      return jpegResponse();
    },
  });

  assert.equal(sent.url, "http://yolo:8000/video/frame");
  assert.equal(sent.init.method, "POST");
  assert.equal(sent.init.headers.Authorization, "Bearer detector-secret");
  assert.equal(sent.init.body.get("video").type, "video/x-msvideo");
  assert.equal(sent.init.body.get("video").name, "camera TEST.avi");
  assert.equal(result.status, "completed");
  assert.equal(result.frameDataUrl, `data:image/jpeg;base64,${JPEG.toString("base64")}`);
  assert.equal(result.width, 640);
  assert.equal(result.height, 360);
  assert.equal(result.duration, 12.5);
  assert.equal(result.frameTime, 6.2);
  assert.equal(result.videoWidth, 1280);
  assert.equal(result.videoHeight, 720);
  assert.equal(result.engine, "opencv");
  assert.equal("dataUrl" in result, false);
});

test("accepts common browser AVI MIME variants but still requires an .avi name", () => {
  for (const mimetype of ["video/x-msvideo", "video/avi", "video/msvideo", "video/vnd.avi", "", "application/octet-stream"]) {
    assert.equal(isSupportedAviFile({ originalname: "clip.AVI", mimetype }), true, mimetype);
  }
  assert.equal(isSupportedAviFile({ originalname: "clip.mp4", mimetype: "video/x-msvideo" }), false);
  assert.equal(isSupportedAviFile({ originalname: "clip.avi", mimetype: "video/mp4" }), false);
});

test("rejects invalid AVI magic before calling the worker", async (t) => {
  const source = await fixture(Buffer.from("this is not an avi"));
  t.after(source.cleanup);
  let called = false;

  await assert.rejects(
    extractVideoFrame({
      url: "http://yolo:8000/video/frame",
      filePath: source.filePath,
      fetchImpl: async () => {
        called = true;
        return jpegResponse();
      },
    }),
    (error) => error.status === 415 && error.code === "INVALID_AVI_SIGNATURE",
  );
  assert.equal(called, false);
});

test("temporary upload cleanup removes only the guarded request directory", async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), AVI_TEMP_PREFIX));
  const partialUpload = path.join(directory, "partial.avi");
  await fs.promises.writeFile(partialUpload, Buffer.from("partial"));

  await cleanupTemporaryAviDirectory(directory);

  assert.equal(fs.existsSync(directory), false);
  await assert.rejects(
    cleanupTemporaryAviDirectory(path.join(os.tmpdir(), "unrelated-directory")),
    /Refusing to clean/,
  );
});

test("preserves an upstream 413 as a public AVI limit error", async (t) => {
  const source = await fixture();
  t.after(source.cleanup);

  await assert.rejects(
    extractVideoFrame({
      url: "http://yolo:8000/video/frame",
      filePath: source.filePath,
      fetchImpl: async () => new Response(JSON.stringify({ detail: "AVI exceeds the upload limit" }), {
        status: 413,
        headers: { "content-type": "application/json" },
      }),
    }),
    (error) => error.status === 413 && error.code === "AVI_TOO_LARGE" && /upload limit/.test(error.message),
  );
});

test("rejects an invalid JPEG returned by the worker", async (t) => {
  const source = await fixture();
  t.after(source.cleanup);

  await assert.rejects(
    extractVideoFrame({
      yoloApiUrl: "http://yolo:8000/detect",
      filePath: source.filePath,
      fetchImpl: async () => jpegResponse(Buffer.from("not-jpeg")),
    }),
    (error) => error.status === 502 && error.code === "INVALID_VIDEO_FRAME_RESPONSE",
  );
});

test("derives /video/frame from the image detector URL", () => {
  assert.equal(
    resolveVideoFrameUrl({ yoloApiUrl: "http://yolo:8000/detect?ignored=true" }),
    "http://yolo:8000/video/frame",
  );
});

test("AVI signature validator accepts RIFF AVI and rejects other RIFF files", async (t) => {
  const valid = await fixture();
  const invalid = await fixture(Buffer.from("RIFF\x08\x00\x00\x00WAVEtest"));
  t.after(valid.cleanup);
  t.after(invalid.cleanup);

  await assert.doesNotReject(assertAviSignature(valid.filePath));
  await assert.rejects(
    assertAviSignature(invalid.filePath),
    (error) => error.status === 415 && error.code === "INVALID_AVI_SIGNATURE",
  );
});
