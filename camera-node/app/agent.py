"""Processing node: registers with the main server, runs live cameras and uploaded-file jobs."""

from __future__ import annotations

import base64
import logging
import os
import platform
import shutil
import socket
import threading
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np

import torch

from .client import ApiClient, ApiError
from .control import ControlChannel
from .detector import Detector, write_tracker_config
from .jobs import FileJobRunner
from .live import CameraWorker
from .segment import Segmenter
from .media import MediaMtx, finalize_clip, grab_jpeg, nvenc_available, probe_stream, utc_from_ms
from .pipeline import CAMERA_ID_PATTERN, mediamtx_paths, path_available, path_names, recording_start
from .settings import VERSION, Settings
from .system import host_stats

log = logging.getLogger("camera-node")
SHOT_REF = re.compile(r"^[a-f0-9]{10}_\d{1,9}$")
HEARTBEAT_SEC = 5.0
SWEEP_SEC = 60.0


class CommandError(Exception):
    def __init__(self, message: str, code: str = "NODE_ERROR"):
        super().__init__(message)
        self.code = code


class Agent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = ApiClient(settings.api_url, settings.token)
        self.media = MediaMtx(settings.mediamtx_api, settings.mediamtx_rtsp, settings.mediamtx_playback)
        self.detector = Detector(settings.model_path, settings.device)
        self.table_model = self.detector.new_model()
        self.table_lock = threading.Lock()
        self.segmenter = Segmenter(settings.sam_model_path, self.detector.device)
        self.nvenc = nvenc_available() and self.detector.device.startswith("cuda")
        self.workers: dict[str, CameraWorker] = {}
        self.cameras: dict[str, dict] = {}
        self.revision: str | None = None
        self.hub_rtsp = ""
        self.archive: dict[str, dict] = {}
        self.absent_sweeps: dict[str, int] = {}
        self.started = time.time()
        self.wake = threading.Event()
        self.control = ControlChannel(settings.ws_url, settings.token, {
            "config": lambda _message: self.wake.set(),
            "watch": self.on_watch,
            "probe": self.on_probe,
            "archive.list": self.on_archive_list,
            "archive.clip": self.on_archive_clip,
            "tables.detect": self.on_tables,
            "archive.frame": self.on_person_frame,
            "segment": self.on_segment,
            "snapshot": self.on_snapshot,
        }, on_connect=self.wake.set)
        self.jobs = FileJobRunner(self)

    # ---- lifecycle ----

    def run(self) -> None:
        if not self.media.wait_ready(180):
            raise RuntimeError("node MediaMTX is not reachable at MEDIAMTX_API_URL")
        self.settings.work_dir.mkdir(parents=True, exist_ok=True)
        reid = self.settings.reid_model
        write_tracker_config(self.settings.tracker_config, confidence=self.settings.confidence, fps=self.settings.live_fps, reid_model=reid)
        # Uploaded files need no appearance vectors (guests are a live-camera feature).
        write_tracker_config(self.settings.work_dir / "tracker-job.yaml", confidence=self.settings.confidence, fps=self.settings.job_fps, reid_model=None)
        log.info("tracker: BoT-SORT, ReID %s", Path(reid).name if reid else "off (no model)")
        self.control.start()
        self.jobs.start()
        threading.Thread(target=self.sweep_loop, name="archive-sweep", daemon=True).start()
        log.info("node ready: api=%s device=%s %s", self.settings.api_url, self.detector.device, self.detector.gpu_name)
        while True:
            self.heartbeat()
            self.settings.heartbeat_file.touch()
            self.wake.wait(HEARTBEAT_SEC)
            self.wake.clear()

    def info(self) -> dict:
        return {
            "hostname": socket.gethostname(),
            "platform": platform.platform(terse=True),
            "cpuCount": os.cpu_count(),
            "device": self.detector.device,
            "gpu": self.detector.gpu_name,
            "model": self.detector.model_name,
            "torch": torch.__version__,
            "nvenc": self.nvenc,
            "liveFps": self.settings.live_fps,
        }

    def heartbeat(self) -> None:
        cameras = [self.camera_status(camera_id) for camera_id in self.cameras]
        stats = host_stats(self.settings.recordings_dir)
        stats.update({
            "uptimeSec": int(time.time() - self.started),
            "camerasOnline": sum(1 for camera in cameras if camera["state"] == "online"),
            "analysisFps": round(sum(camera.get("fps") or 0 for camera in cameras), 1),
            "jobActive": self.jobs.current is not None,
            "controlConnected": self.control.connected.is_set(),
        })
        try:
            response = self.client.heartbeat({"version": VERSION, "info": self.info(), "stats": stats, "cameras": cameras})
        except ApiError as error:
            if error.status in (401, 403):
                log.error("heartbeat rejected: %s", error)
            else:
                log.warning("heartbeat failed: %s", error)
            return
        config = response.get("config")
        if config:
            try:
                self.apply(config)
            except Exception:  # noqa: BLE001 - a bad config must not kill the node
                log.exception("failed to apply config")

    def camera_status(self, camera_id: str) -> dict:
        worker = self.workers.get(camera_id)
        if worker is None:
            return {"id": camera_id, "state": "stopped"}
        status = worker.heartbeat_status()
        names = path_names(camera_id)
        status["recording"] = path_available(self.media.path_state(names["rec"]))
        archive = self.archive.get(camera_id) or {}
        status["archiveFrom"] = archive.get("from")
        status["archiveBytes"] = archive.get("bytes")
        return {key: value for key, value in status.items() if value is not None or key in {"fps"}}

    def apply(self, config: dict) -> None:
        if config.get("revision") == self.revision:
            return
        self.hub_rtsp = config.get("hub", {}).get("rtspUrl", "")
        desired = {camera["id"]: camera for camera in config.get("cameras", []) if CAMERA_ID_PATTERN.match(camera.get("id", ""))}
        enabled = {camera_id: camera for camera_id, camera in desired.items() if camera.get("enabled")}
        paths: dict[str, dict] = {}
        for camera in enabled.values():
            paths.update(mediamtx_paths(camera))
        self.media.sync(paths)
        for camera_id, worker in list(self.workers.items()):
            if camera_id not in enabled or worker.config != enabled[camera_id]:
                worker.stop()
                del self.workers[camera_id]
        for camera_id, camera in enabled.items():
            if camera_id not in self.workers:
                worker = CameraWorker(camera, self)
                self.workers[camera_id] = worker
                worker.start()
        self.cameras = desired
        self.revision = config.get("revision")
        log.info("config %s applied: %s camera(s), %s active", self.revision, len(desired), len(enabled))

    # ---- commands ----

    def on_watch(self, message: dict) -> None:
        worker = self.workers.get(str(message.get("cameraId")))
        if worker:
            worker.watch(float(message.get("ttlSec") or 0))

    def on_probe(self, message: dict) -> dict:
        main_url, sub_url = message.get("main") or "", message.get("sub") or ""
        if not main_url.startswith(("rtsp://", "rtsps://")):
            raise CommandError("Invalid RTSP address", "INVALID_RTSP_URL")
        main = probe_stream(main_url, timeout=12)
        sub = probe_stream(sub_url, timeout=12) if sub_url else None
        frame = grab_jpeg(main_url, timeout=25, max_width=1280) if main.get("ok") else None
        return {"main": main, "sub": sub, "frame": base64.b64encode(frame).decode() if frame else None}

    def on_archive_list(self, message: dict) -> dict:
        camera_id = str(message.get("cameraId"))
        if camera_id not in self.cameras:
            raise CommandError("Camera is not on this node", "CAMERA_NOT_ASSIGNED")
        start = utc_from_ms(int(message["from"]))
        end = utc_from_ms(int(message["to"]))
        return {"segments": self.media.list_recordings(path_names(camera_id)["rec"], start, end)}

    def on_archive_clip(self, message: dict) -> None:
        clip_id = str(message.get("clipId"))
        camera_id = str(message.get("cameraId"))
        work = self.settings.work_dir / "clips"
        work.mkdir(parents=True, exist_ok=True)
        raw = work / f"{clip_id}.raw.mp4"
        final = work / f"{clip_id}.mp4"
        try:
            if camera_id not in self.cameras:
                raise CommandError("Камера більше не обробляється цим вузлом")
            self.media.fetch_recording(path_names(camera_id)["rec"], utc_from_ms(int(message["start"])), float(message["durationSec"]), raw)
            finalize_clip(raw, final, transcode=bool(message.get("transcode")), use_nvenc=self.nvenc)
            self.client.upload_clip(clip_id, final)
        except Exception as error:  # noqa: BLE001 - the browser must learn why the clip failed
            log.warning("clip %s failed: %s", clip_id, error)
            try:
                self.client.fail_clip(clip_id, str(error) or "Не вдалося підготувати фрагмент")
            except ApiError:
                pass
        finally:
            raw.unlink(missing_ok=True)
            final.unlink(missing_ok=True)

    def on_person_frame(self, message: dict) -> dict:
        """The saved best frame of a person (guest journal thumbnail)."""
        ref = str(message.get("ref") or "")
        if not SHOT_REF.match(ref):
            raise CommandError("Unknown frame", "THUMB_NOT_AVAILABLE")
        path = self.settings.shots_dir / f"{ref}.jpg"
        if not path.is_file():
            raise CommandError("Кадр уже видалено разом з архівом", "THUMB_NOT_AVAILABLE")
        return {"jpeg": base64.b64encode(path.read_bytes()).decode()}

    def on_segment(self, message: dict) -> dict:
        camera_id = str(message.get("cameraId"))
        if camera_id not in self.cameras:
            raise CommandError("Camera is not on this node", "CAMERA_NOT_ASSIGNED")
        if not Path(self.settings.sam_model_path).is_file():
            raise CommandError("SAM 2 не встановлено на цьому вузлі", "SAM_UNAVAILABLE")
        jpeg = grab_jpeg(self.media.rtsp_url(path_names(camera_id)["main"]), timeout=25, max_width=1280)
        if not jpeg:
            raise CommandError("Не вдалося отримати кадр з камери")
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        with self.detector.slots:
            return self.segmenter.outline(frame, float(message["x"]), float(message["y"]))

    def on_tables(self, message: dict) -> None:
        worker = self.workers.get(str(message.get("cameraId")))
        if worker:
            worker.request_tables()

    def on_snapshot(self, message: dict) -> None:
        worker = self.workers.get(str(message.get("cameraId")))
        if worker:
            worker.request_snapshot()

    def detect_tables(self, frame):
        with self.table_lock:
            return self.detector.detect_tables(self.table_model, frame, self.settings.table_confidence)

    # ---- archive housekeeping ----

    def sweep_loop(self) -> None:
        while True:
            try:
                self.sweep()
            except Exception:  # noqa: BLE001
                log.exception("archive sweep failed")
            time.sleep(SWEEP_SEC)

    def sweep(self) -> None:
        """Deletes recordings older than the retention (MediaMTX does too; this also covers removed cameras)
        and collects archive size/start per camera for the heartbeat."""
        # Person thumbnails live no longer than the video they were cut from.
        shots = self.settings.shots_dir
        if shots.is_dir():
            oldest = time.time() - self.settings.archive_hours * 3600
            for file in shots.iterdir():
                if file.stat().st_mtime < oldest:
                    file.unlink(missing_ok=True)
        root = self.settings.recordings_dir
        if not root.exists():
            return
        cutoff = datetime.now(timezone.utc) - timedelta(hours=self.settings.archive_hours, minutes=15)
        archive: dict[str, dict] = {}
        for directory in root.iterdir():
            if not directory.is_dir() or not directory.name.endswith("_rec"):
                continue
            camera_id = directory.name[1:-4]
            if not CAMERA_ID_PATTERN.match(camera_id):
                continue
            if self.revision is not None and camera_id not in self.cameras:
                self.absent_sweeps[camera_id] = self.absent_sweeps.get(camera_id, 0) + 1
                if self.absent_sweeps[camera_id] >= 2:
                    shutil.rmtree(directory, ignore_errors=True)
                    log.info("deleted recordings of camera %s (no longer on this node)", camera_id)
                    continue
            else:
                self.absent_sweeps.pop(camera_id, None)
            earliest, size = None, 0
            for file in directory.iterdir():
                start = recording_start(file.name)
                if start is None:
                    continue
                if start < cutoff:
                    file.unlink(missing_ok=True)
                    continue
                size += file.stat().st_size
                earliest = start if earliest is None or start < earliest else earliest
            archive[camera_id] = {"from": int(earliest.timestamp() * 1000) if earliest else None, "bytes": size}
        self.archive = archive


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("websocket").setLevel(logging.WARNING)
    settings = Settings.from_env()
    torch.set_num_threads(settings.torch_threads)
    Agent(settings).run()


if __name__ == "__main__":
    main()
