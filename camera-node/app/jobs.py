"""Uploaded video files: claims jobs from the API queue, tracks people with YOLO + ByteTrack, uploads tracks."""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING

import cv2

from .client import ApiError
from .pipeline import JobCancelled, JobFailed, TrackCollector, foot_point, frame_step, inference_size, normalized_fps

if TYPE_CHECKING:
    from .agent import Agent

log = logging.getLogger("camera-node.jobs")
PROGRESS_INTERVAL_SEC = 2.0
POLL_INTERVAL_SEC = 3.0


class FileJobRunner(threading.Thread):
    def __init__(self, agent: "Agent"):
        super().__init__(name="file-jobs", daemon=True)
        self.agent = agent
        self.stopped = threading.Event()
        self.current: str | None = None

    def stop(self) -> None:
        self.stopped.set()

    def run(self) -> None:
        while not self.stopped.is_set():
            try:
                job = self.agent.client.claim_job()
            except ApiError as error:
                log.debug("claim failed: %s", error)
                job = None
            if job is None:
                self.stopped.wait(POLL_INTERVAL_SEC)
                continue
            self.handle(job)

    def handle(self, job: dict) -> None:
        job_id = job["id"]
        self.current = job_id
        work_dir = self.agent.settings.work_dir / "jobs"
        work_dir.mkdir(parents=True, exist_ok=True)
        source = work_dir / f"{job_id}.{job['format']}"
        started = time.monotonic()
        try:
            self.agent.client.download_source(job_id, source)
            result = self.process(job_id, source)
            self.agent.client.job_result(job_id, result)
            log.info("video %s done: %s tracks in %.0fs", job_id, len(result["tracks"]), time.monotonic() - started)
        except JobCancelled:
            log.info("video %s was deleted during processing", job_id)
        except JobFailed as error:
            log.warning("video %s failed: %s", job_id, error)
            self._fail(job_id, str(error))
        except ApiError as error:
            if error.status == 409:
                log.info("video %s is no longer ours", job_id)
            else:
                log.warning("video %s: API error %s", job_id, error)
                self._fail(job_id, "Вузол обробки втратив зв'язок із сервером. Спробуйте завантажити відео ще раз.")
        except Exception:  # noqa: BLE001 - any crash must end as a visible failed job
            log.exception("video %s crashed", job_id)
            self._fail(job_id, "Внутрішня помилка обробки. Спробуйте завантажити відео ще раз.")
        finally:
            source.unlink(missing_ok=True)
            self.current = None

    def _fail(self, job_id: str, message: str) -> None:
        try:
            self.agent.client.job_fail(job_id, message)
        except ApiError:
            pass

    def _progress(self, job_id: str, progress: float) -> None:
        try:
            self.agent.client.job_progress(job_id, progress)
        except ApiError as error:
            if error.status == 409:
                raise JobCancelled() from error

    def process(self, job_id: str, source: Path) -> dict:
        settings = self.agent.settings
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise JobFailed("Не вдалося відкрити відео: формат або кодек не підтримується.")
        try:
            fps = normalized_fps(capture.get(cv2.CAP_PROP_FPS))
            frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            image_size = inference_size(width, settings.image_size, self.agent.detector.quantize is not None)
            if width <= 0 or height <= 0:
                raise JobFailed("Не вдалося визначити розмір кадру відео.")
            too_long = f"Відео довше за {settings.max_duration_sec // 60} хв. Розділіть його на частини."
            if frame_count and frame_count / fps > settings.max_duration_sec:
                raise JobFailed(too_long)

            step = frame_step(fps, settings.job_fps)
            model = self.agent.detector.new_model()  # fresh instance = fresh tracker state
            collector = TrackCollector()
            index = 0
            snapshot_sent = False
            last_progress = time.monotonic()
            while True:
                sampled = index % step == 0
                ok, frame = capture.read() if sampled else (capture.grab(), None)
                if not ok:
                    break
                if sampled:
                    t = index / fps
                    if t > settings.max_duration_sec:
                        raise JobFailed(too_long)
                    if not snapshot_sent and frame.mean() > 12:
                        encoded, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        if encoded:
                            try:
                                self.agent.client.job_snapshot(job_id, buffer.tobytes())
                                snapshot_sent = True
                            except ApiError as error:
                                if error.status == 409:
                                    raise JobCancelled() from error
                    boxes = self.agent.detector.track_people(model, frame, image_size, str(settings.work_dir / "tracker-job.yaml"))
                    if boxes is not None and boxes.id is not None:
                        for xyxy, track_id in zip(boxes.xyxy.tolist(), boxes.id.int().tolist()):
                            x, y = foot_point(xyxy, width, height)
                            collector.add(track_id, t, x, y)
                index += 1
                if time.monotonic() - last_progress >= PROGRESS_INTERVAL_SEC:
                    last_progress = time.monotonic()
                    self._progress(job_id, min(0.99, index / frame_count) if frame_count else 0)
            if index == 0:
                raise JobFailed("У відео немає кадрів, які вдалося прочитати.")
            return {
                "tracks": collector.finalize(),
                "durationSec": round(index / fps, 2),
                "sampleFps": round(fps / step, 3),
                "width": width,
                "height": height,
                "model": self.agent.detector.model_name,
            }
        finally:
            capture.release()
