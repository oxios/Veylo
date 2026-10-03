"""Live analysis of one RTSP camera on the node."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

import cv2
import numpy as np

from .client import ApiError
from .media import Publisher, grab_jpeg, hub_publish_url, probe_stream, save_person_crop
from .detector import BICYCLE, PERSON
from .pipeline import (
    RTSP_MESSAGES, CoverageCounter, LiveTrackBook, TableClusterer, appearance_quality, foot_point, inference_size, normalized_box,
    path_available, path_names, rides_bicycle, shot_quality,
)

if TYPE_CHECKING:
    from .agent import Agent

log = logging.getLogger("camera-node.live")
FLUSH_INTERVAL_SEC = 4.0
STREAM_READY_TIMEOUT_SEC = 25.0


class StreamError(Exception):
    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or RTSP_MESSAGES.get(code, RTSP_MESSAGES["unknown"]))
        self.code = code


class FrameReader(threading.Thread):
    """Reads the stream as fast as it arrives and keeps only the newest frame, so analysis never lags behind."""

    def __init__(self, url: str):
        super().__init__(name="frame-reader", daemon=True)
        self.capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        self.condition = threading.Condition()
        self.frame = None
        self.t = 0.0
        self.seq = 0
        self.failed = False
        self.stopped = False

    def run(self) -> None:
        failures = 0
        while not self.stopped:
            ok, frame = self.capture.read()
            if not ok:
                failures += 1
                if failures > 50:
                    break
                time.sleep(0.05)
                continue
            failures = 0
            with self.condition:
                self.frame, self.t, self.seq = frame, time.time(), self.seq + 1
                self.condition.notify_all()
        with self.condition:
            self.failed = True
            self.condition.notify_all()

    def latest(self, after_seq: int, timeout: float):
        with self.condition:
            self.condition.wait_for(lambda: self.seq > after_seq or self.failed or self.stopped, timeout=timeout)
            if self.seq > after_seq:
                return self.frame, self.t, self.seq
            return None

    def close(self) -> None:
        self.stopped = True
        self.join(timeout=5)
        self.capture.release()


class Uploader(threading.Thread):
    """Sends observation batches one at a time, retrying until the API accepts them."""

    def __init__(self, agent: "Agent", camera_id: str):
        super().__init__(name=f"upload-{camera_id[-6:]}", daemon=True)
        self.agent = agent
        self.camera_id = camera_id
        self.pending: dict | None = None
        self.wake = threading.Event()
        self.stopped = threading.Event()

    def idle(self) -> bool:
        return self.pending is None

    def submit(self, batch: dict) -> None:
        self.pending = batch
        self.wake.set()

    def run(self) -> None:
        backoff = 2.0
        while not (self.stopped.is_set() and self.pending is None):
            self.wake.wait(1.0)
            self.wake.clear()
            batch = self.pending
            if batch is None:
                continue
            try:
                self.agent.client.observations(batch)
                self.pending = None
                backoff = 2.0
            except ApiError as error:
                if 400 <= error.status < 500 and error.status != 429:
                    log.warning("camera %s: observations rejected (%s), dropping batch", self.camera_id, error)
                    self.pending = None
                    continue
                if self.stopped.is_set():
                    self.pending = None
                    continue
                self.stopped.wait(backoff)
                backoff = min(30.0, backoff * 2)
                self.wake.set()

    def stop(self) -> None:
        self.stopped.set()
        self.wake.set()


class FpsMeter:
    def __init__(self, window: float = 5.0):
        self.window = window
        self.times: deque[float] = deque()

    def tick(self, t: float) -> None:
        self.times.append(t)
        while self.times and t - self.times[0] > self.window:
            self.times.popleft()

    def value(self) -> float | None:
        if len(self.times) < 2:
            return None
        return round((len(self.times) - 1) / max(1e-6, self.times[-1] - self.times[0]), 1)


class CameraWorker(threading.Thread):
    def __init__(self, config: dict, agent: "Agent"):
        super().__init__(name=f"camera-{config['id'][-6:]}", daemon=True)
        self.config = config
        self.agent = agent
        self.camera_id = config["id"]
        self.names = path_names(self.camera_id)
        self.analysis_path = self.names["sub"] if config["analysis"] == "sub" and config.get("sub") else self.names["main"]
        self.live_path = self.names["sub"] if config.get("sub") else self.names["main"]
        self.stopped = threading.Event()
        self.watch_until = 0.0
        self.status: dict = {"id": self.camera_id, "state": "connecting", "error": "", "errorCode": ""}
        self.fps = FpsMeter()
        self.uploader = Uploader(agent, self.camera_id)
        settings = agent.settings
        self.publisher = Publisher(
            agent.media.rtsp_url(self.live_path),
            hub_publish_url(agent.hub_rtsp, config["hubPath"], settings.token),
            config["name"],
        )
        self.aux = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"aux-{self.camera_id[-6:]}")
        self.aux_busy = False
        self.clusterer = TableClusterer()
        self.snapshot_due = 0.0
        self.tables_due = time.time() + 45
        self.want_tables = threading.Event()

    # ---- control ----

    def watch(self, ttl_sec: float) -> None:
        self.watch_until = time.time() + ttl_sec if ttl_sec > 0 else 0.0
        self._manage_publisher()

    @property
    def watched(self) -> bool:
        return time.time() < self.watch_until

    def request_tables(self) -> None:
        self.want_tables.set()

    def request_snapshot(self) -> None:
        self.snapshot_due = 0.0

    def stop(self) -> None:
        self.stopped.set()

    def heartbeat_status(self) -> dict:
        return dict(self.status, fps=self.fps.value() if self.status.get("state") == "online" else None)

    # ---- main loop ----

    def run(self) -> None:
        self.uploader.start()
        backoff = 5.0
        while not self.stopped.is_set():
            try:
                self._session()
                backoff = 5.0
            except StreamError as error:
                self._set(state="error", error=str(error), errorCode=error.code)
                log.info("camera %s: %s", self.config["name"], error)
            except Exception:  # noqa: BLE001 - a crashed session restarts after a pause
                log.exception("camera %s: analysis crashed", self.config["name"])
                self._set(state="error", error="Внутрішня помилка аналізу, перезапускаємо", errorCode="internal")
            if self.stopped.wait(backoff):
                break
            backoff = min(60.0, backoff * 2)
        self.publisher.stop()
        self.uploader.stop()
        self.aux.shutdown(wait=False, cancel_futures=True)

    def _set(self, **values) -> None:
        self.status.update(values)

    def _wait_for_stream(self) -> None:
        deadline = time.time() + STREAM_READY_TIMEOUT_SEC
        while not self.stopped.is_set():
            if path_available(self.agent.media.path_state(self.analysis_path)):
                return
            if time.time() > deadline:
                # MediaMTX could not pull the camera; ask the camera directly what is wrong.
                result = probe_stream(self.config["main"], timeout=10)
                if result.get("ok"):
                    raise StreamError("unknown", "Камера відповідає, але потік ще не запустився")
                raise StreamError(result.get("errorCode", "unknown"), result.get("error"))
            self.stopped.wait(1.0)

    def _session(self) -> None:
        self._set(state="connecting", error="", errorCode="")
        self._wait_for_stream()
        if self.stopped.is_set():
            return
        analysis = probe_stream(self.agent.media.rtsp_url(self.analysis_path), timeout=8)
        main = analysis if self.analysis_path == self.names["main"] else probe_stream(self.agent.media.rtsp_url(self.names["main"]), timeout=8)
        reader = FrameReader(self.agent.media.rtsp_url(self.analysis_path))
        reader.start()
        model = self.agent.detector.new_model()
        reid = self.agent.settings.reid_model is not None
        book = LiveTrackBook(session=uuid.uuid4().hex[:10])
        coverage = CoverageCounter()
        settings = self.agent.settings
        interval = 1.0 / settings.live_fps
        last_seq = 0
        next_flush = time.monotonic() + FLUSH_INTERVAL_SEC
        try:
            first = reader.latest(0, timeout=20)
            if first is None:
                raise StreamError("unknown", "Потік відкрився, але кадри не надходять")
            height, width = first[0].shape[:2]
            image_size = inference_size(width, settings.image_size, self.agent.detector.quantize is not None)
            self._set(state="online", error="", errorCode="", width=width, height=height,
                      codec=analysis.get("codec", ""), mainCodec=main.get("codec", ""))
            log.info("camera %s online: %sx%s %s, yolo imgsz=%s", self.config["name"], width, height, analysis.get("codec", ""), image_size)
            while not self.stopped.is_set():
                started = time.monotonic()
                item = reader.latest(last_seq, timeout=5)
                if item is None:
                    if reader.failed or not reader.is_alive():
                        raise StreamError("unknown", "Потік камери обірвався")
                    continue
                frame, t, last_seq = item
                boxes = self.agent.detector.track_people(model, frame, image_size, str(settings.tracker_config), classes=(PERSON, BICYCLE))
                features = self.agent.detector.track_features(model) if reid else {}
                people, bikes, frame_boxes, bike_boxes = [], [], [], []
                if boxes is not None and boxes.id is not None:
                    for xyxy, track_id, confidence, cls in zip(boxes.xyxy.tolist(), boxes.id.int().tolist(), boxes.conf.tolist(), boxes.cls.int().tolist()):
                        x, y = foot_point(xyxy, width, height)
                        box = [track_id, *normalized_box(xyxy, width, height), round(confidence, 2)]
                        if cls == BICYCLE:
                            bikes.append((track_id, x, y))
                            bike_boxes.append(box)
                        else:
                            people.append((track_id, x, y))
                            frame_boxes.append(box)
                book.observe(t, people)
                book.observe(t, bikes, kind="bicycle")
                bicycles = [box[1:5] for box in bike_boxes]
                # Clean (unobstructed, close enough) frames give the person's appearance vector; the best frame of
                # every track, however small, is kept as visual proof (thumbnail).
                for index, (track_id, x1, y1, x2, y2, confidence) in enumerate(frame_boxes):
                    others = [other[1:5] for other_index, other in enumerate(frame_boxes) if other_index != index]
                    if bicycles and rides_bicycle([x1, y1, x2, y2], bicycles):
                        book.mark_bike(track_id)
                    clean = appearance_quality([x1, y1, x2, y2], confidence, others) > 0
                    ref = book.add_appearance(track_id, features.get(track_id) if clean else None, t, [x1, y1, x2, y2], shot_quality([x1, y1, x2, y2], confidence))
                    if ref:
                        save_person_crop(self.agent.settings.shots_dir, ref, frame, [x1, y1, x2, y2])
                for track_id, x1, y1, x2, y2, confidence in bike_boxes:
                    ref = book.add_appearance(track_id, None, t, [x1, y1, x2, y2], shot_quality([x1, y1, x2, y2], confidence))
                    if ref:
                        save_person_crop(self.agent.settings.shots_dir, ref, frame, [x1, y1, x2, y2])
                frame_boxes += [[*box, BICYCLE] for box in bike_boxes]
                book.expire(t)
                coverage.mark(t)
                self.fps.tick(t)
                self.status["lastFrameAt"] = int(t * 1000)
                if self.watched:
                    self.agent.control.send({"type": "frame", "cameraId": self.camera_id, "session": book.session, "t": int(t * 1000), "people": frame_boxes})
                self._manage_publisher()
                self._schedule_aux()
                if time.monotonic() >= next_flush and self.uploader.idle():
                    self.uploader.submit(self._batch(book, coverage, t))
                    next_flush = time.monotonic() + FLUSH_INTERVAL_SEC
                remaining = interval - (time.monotonic() - started)
                if remaining > 0:
                    self.stopped.wait(remaining)
        finally:
            reader.close()
            book.expire(float("inf"))
            deadline = time.monotonic() + 10
            while not self.uploader.idle() and time.monotonic() < deadline:
                time.sleep(0.2)
            final = self._batch(book, coverage, time.time())
            if final["tracks"] or final["coverage"]:
                self.uploader.submit(final)

    def _batch(self, book: LiveTrackBook, coverage: CoverageCounter, now: float) -> dict:
        return {
            "cameraId": self.camera_id,
            "coverage": coverage.report(now),
            "tracks": book.drain(),
            "now": {"at": int(now * 1000), "people": [[track_id, x, y] for track_id, x, y in book.current(now)]},
        }

    # ---- live publishing, snapshots, tables ----

    def _manage_publisher(self) -> None:
        if self.watched and self.status.get("state") == "online":
            self.publisher.start()  # restarts it if ffmpeg exited
        elif self.publisher.running():
            self.publisher.stop()

    def _schedule_aux(self) -> None:
        if self.aux_busy:
            return
        now = time.time()
        tables = self.want_tables.is_set() or now >= self.tables_due
        if now < self.snapshot_due and not tables:
            return
        self.aux_busy = True
        self.want_tables.clear()
        self.aux.submit(self._aux_task, tables)

    def _aux_task(self, tables: bool) -> None:
        settings = self.agent.settings
        try:
            jpeg = grab_jpeg(self.agent.media.rtsp_url(self.names["main"]), timeout=25, max_width=1920)
            if not jpeg:
                return
            self.agent.client.snapshot(self.camera_id, jpeg)
            self.snapshot_due = time.time() + settings.snapshot_interval_sec
            if tables:
                frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
                detections = self.agent.detect_tables(frame)
                self.clusterer.add_run(detections)
                self.agent.client.tables(self.camera_id, self.clusterer.candidates())
                self.tables_due = time.time() + settings.table_interval_sec
                log.info("camera %s: %s table candidate(s)", self.config["name"], len(self.clusterer.candidates()))
        except ApiError as error:
            log.warning("camera %s: snapshot/tables upload failed: %s", self.config["name"], error)
        except Exception:  # noqa: BLE001
            log.exception("camera %s: snapshot/tables task failed", self.config["name"])
        finally:
            # Failed tasks retry after a pause, not on every frame.
            if self.snapshot_due <= time.time():
                self.snapshot_due = time.time() + 60
            if tables and self.tables_due <= time.time():
                self.tables_due = time.time() + 120
            self.aux_busy = False
