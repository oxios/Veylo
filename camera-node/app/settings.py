"""Node configuration from environment variables."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .pipeline import env_bool, env_float, env_int

TOKEN_PATTERN = re.compile(r"^vfn_[a-z0-9]{2,40}_[A-Za-z0-9_-]{24,128}$")
VERSION = "1.0.0"


@dataclass(frozen=True)
class Settings:
    api_url: str
    token: str
    mediamtx_api: str
    mediamtx_rtsp: str
    mediamtx_playback: str
    recordings_dir: Path
    work_dir: Path
    model_path: str
    reid_model_path: str
    sam_model_path: str
    device: str
    live_fps: float
    job_fps: float
    confidence: float
    image_size: int
    table_confidence: float
    table_interval_sec: int
    snapshot_interval_sec: int
    archive_hours: int
    max_duration_sec: int
    torch_threads: int
    heartbeat_file: Path

    @classmethod
    def from_env(cls) -> "Settings":
        api_url = os.getenv("VENUEFLOW_URL", "").strip().rstrip("/")
        if not re.match(r"^https?://", api_url):
            raise RuntimeError("VENUEFLOW_URL must be the http(s) address of the main server")
        token = os.getenv("NODE_TOKEN", "").strip()
        if not TOKEN_PATTERN.match(token):
            raise RuntimeError("NODE_TOKEN is missing or malformed (expected vfn_<id>_<secret> from the admin panel)")
        device = os.getenv("NODE_DEVICE", "auto").strip().lower()
        if device not in {"auto", "cpu", "cuda"}:
            raise RuntimeError("NODE_DEVICE must be auto, cpu or cuda")
        return cls(
            api_url=api_url,
            token=token,
            mediamtx_api=os.getenv("MEDIAMTX_API_URL", "http://node-mediamtx:9997").rstrip("/"),
            mediamtx_rtsp=os.getenv("MEDIAMTX_RTSP_URL", "rtsp://node-mediamtx:8554").rstrip("/"),
            mediamtx_playback=os.getenv("MEDIAMTX_PLAYBACK_URL", "http://node-mediamtx:9996").rstrip("/"),
            recordings_dir=Path(os.getenv("RECORDINGS_DIR", "/recordings")),
            work_dir=Path(os.getenv("NODE_WORK_DIR", "/tmp/venueflow")),
            model_path=os.getenv("YOLO_MODEL_PATH", "/opt/models/yolo11s.pt"),
            # Empty REID_MODEL_PATH disables appearance matching (tracking still works, guests get no repeat numbers).
            reid_model_path=os.getenv("REID_MODEL_PATH", "/opt/models/yolo26s-reid.onnx").strip(),
            sam_model_path=os.getenv("SAM_MODEL_PATH", "/opt/models/sam2.1_b.pt").strip(),
            device=device,
            live_fps=env_float("LIVE_SAMPLE_FPS", 5.0, 1.0, 15.0),
            job_fps=env_float("VIDEO_SAMPLE_FPS", 5.0, 1.0, 30.0),
            confidence=env_float("YOLO_CONFIDENCE", 0.3, 0.05, 0.95),
            image_size=env_int("YOLO_IMAGE_SIZE", 640, 320, 1920),
            table_confidence=env_float("TABLE_CONFIDENCE", 0.2, 0.05, 0.95),
            table_interval_sec=env_int("TABLE_DETECT_INTERVAL_SEC", 300, 30, 86400),
            snapshot_interval_sec=env_int("SNAPSHOT_INTERVAL_SEC", 300, 30, 86400),
            archive_hours=env_int("ARCHIVE_HOURS", 24, 1, 720),
            max_duration_sec=env_int("VIDEO_MAX_DURATION_SECONDS", 4 * 3600, 10, 24 * 3600),
            torch_threads=env_int("YOLO_TORCH_THREADS", 2, 1, 64),
            heartbeat_file=Path("/tmp/camera-node-heartbeat"),
        )

    @property
    def reid_model(self) -> str | None:
        return self.reid_model_path if self.reid_model_path and Path(self.reid_model_path).is_file() else None

    @property
    def shots_dir(self) -> Path:
        """Best crops of people (guest journal thumbnails): on the recordings volume, so they survive a restart
        and are deleted together with the archive."""
        return self.recordings_dir / "_shots"

    @property
    def tracker_config(self) -> Path:
        return self.work_dir / "tracker-live.yaml"

    @property
    def ws_url(self) -> str:
        return re.sub(r"^http", "ws", self.api_url) + "/api/node/ws"
