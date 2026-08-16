from __future__ import annotations

import asyncio
import io
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np
from fastapi import HTTPException
from starlette.requests import Request

from app.main import extract_video_frame, state


class MemoryUpload:
    def __init__(self, payload: bytes, *, filename: str = "sample.avi", content_type: str = "video/x-msvideo") -> None:
        self.filename = filename
        self.content_type = content_type
        self._source = io.BytesIO(payload)
        self.closed = False

    async def read(self, size: int = -1) -> bytes:
        return self._source.read(size)

    async def close(self) -> None:
        self.closed = True
        self._source.close()


def make_real_avi(path: Path, *, width: int = 160, height: int = 120, frames: int = 12, fps: float = 6.0) -> bytes:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("OpenCV MJPG AVI writer is unavailable")
    try:
        for index in range(frames):
            image = np.zeros((height, width, 3), dtype=np.uint8)
            image[:, :] = (index * 9, 30, 180 - index * 5)
            cv2.rectangle(image, (15 + index, 20), (80 + index, 90), (40, 220, 80), -1)
            writer.write(image)
    finally:
        writer.release()
    payload = path.read_bytes()
    if payload[:4] != b"RIFF" or payload[8:12] != b"AVI ":
        raise RuntimeError("OpenCV did not produce a valid AVI test fixture")
    return payload


def request(content_length: int | None = None) -> Request:
    headers = [] if content_length is None else [(b"content-length", str(content_length).encode("ascii"))]
    return Request({"type": "http", "method": "POST", "path": "/video/frame", "headers": headers})


class VideoFrameTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_settings = state.settings
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.upload_directory = self.root / "worker-uploads"
        state.settings = replace(
            state.settings,
            video_temp_dir=self.upload_directory,
            max_video_upload_bytes=4 * 1024 * 1024,
            max_video_pixels=1_000_000,
            max_video_duration_seconds=60,
        )

    def tearDown(self) -> None:
        state.settings = self.previous_settings
        self.temporary.cleanup()

    def assert_upload_directory_empty(self) -> None:
        self.assertEqual(list(self.upload_directory.glob("*")), [])

    def test_extracts_middle_frame_from_real_avi_and_removes_temporary_file(self) -> None:
        payload = make_real_avi(self.root / "fixture.avi")
        upload = MemoryUpload(payload)

        response = asyncio.run(extract_video_frame(request(len(payload) + 256), upload, None))

        self.assertEqual(response.media_type, "image/jpeg")
        self.assertTrue(response.body.startswith(b"\xff\xd8\xff"))
        self.assertTrue(response.body.endswith(b"\xff\xd9"))
        self.assertEqual(response.headers["x-frame-width"], "160")
        self.assertEqual(response.headers["x-frame-height"], "120")
        self.assertAlmostEqual(float(response.headers["x-video-duration"]), 2.0, places=1)
        self.assertGreater(float(response.headers["x-video-frame-time"]), 0.5)
        self.assertTrue(upload.closed)
        self.assert_upload_directory_empty()

    def test_rejects_oversized_avi_and_removes_partial_file(self) -> None:
        payload = make_real_avi(self.root / "large.avi")
        state.settings = replace(state.settings, max_video_upload_bytes=max(1, len(payload) - 1))
        upload = MemoryUpload(payload)

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(extract_video_frame(request(), upload, None))

        self.assertEqual(caught.exception.status_code, 413)
        self.assertTrue(upload.closed)
        self.assert_upload_directory_empty()

    def test_rejects_invalid_avi_signature_and_removes_file(self) -> None:
        upload = MemoryUpload(b"RIFF\x04\x00\x00\x00NOPEinvalid-video")

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(extract_video_frame(request(), upload, None))

        self.assertEqual(caught.exception.status_code, 415)
        self.assertTrue(upload.closed)
        self.assert_upload_directory_empty()

    def test_video_endpoint_uses_same_api_key_guard_as_detect(self) -> None:
        state.settings = replace(state.settings, api_key="worker-secret")
        upload = MemoryUpload(b"not-read")

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(extract_video_frame(request(), upload, "Bearer wrong"))

        self.assertEqual(caught.exception.status_code, 401)
        self.assertFalse(upload.closed)
        self.assert_upload_directory_empty()


if __name__ == "__main__":
    unittest.main()
