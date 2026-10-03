"""YOLO model loading and device selection (CUDA when available)."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import yaml

import torch
from ultralytics import YOLO

log = logging.getLogger("camera-node.detector")

PERSON = 0
BICYCLE = 1
LOW_CONFIDENCE = 0.1
DINING_TABLE = 60
# Seating places: COCO rarely recognises coffee tables, but armchairs, sofas and benches mark where guests sit.
SEATS = {56: "seat", 57: "seat", 13: "seat"}
FURNITURE = {DINING_TABLE: "table", **SEATS}


def write_tracker_config(path: Path, *, confidence: float, fps: float, reid_model: str | None) -> Path:
    """BoT-SORT tuned for a fixed camera: no camera-motion compensation (saves CPU), ~6 s memory for people hidden
    behind someone, appearance (ReID) matching when the ReID model is available."""
    config = {
        "tracker_type": "botsort",
        "track_high_thresh": confidence,
        "track_low_thresh": LOW_CONFIDENCE,
        "new_track_thresh": max(confidence, 0.4),
        "track_buffer": int(round(fps * 6)),
        "match_thresh": 0.8,
        "fuse_score": True,
        "gmc_method": "none",
        "proximity_thresh": 0.5,
        "appearance_thresh": 0.8,
        "with_reid": bool(reid_model),
        "model": reid_model or "auto",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(config), encoding="utf-8")
    return path


class Detector:
    def __init__(self, model_path: str, preference: str):
        self.model_path = model_path
        self.model_name = Path(model_path).name
        cuda = torch.cuda.is_available()
        if preference == "cuda" and not cuda:
            raise RuntimeError("NODE_DEVICE=cuda but no CUDA device is visible in the container")
        self.device = "cuda:0" if cuda and preference != "cpu" else "cpu"
        # FP16 on GPU (`quantize` replaces the deprecated `half` flag in Ultralytics 8.4).
        self.quantize = 16 if self.device.startswith("cuda") else None
        self.gpu_name = torch.cuda.get_device_name(0) if self.device.startswith("cuda") else ""
        # Inference slots: a GPU handles several camera streams concurrently, a CPU is saturated by one.
        self.slots = threading.BoundedSemaphore(3 if self.quantize else 1)
        log.info("detector device=%s %s model=%s", self.device, self.gpu_name, self.model_name)

    def new_model(self) -> YOLO:
        """A separate instance per camera stream: ByteTrack state lives inside the model's predictor."""
        return YOLO(self.model_path, task="detect")

    def track_people(self, model: YOLO, frame, image_size: int, tracker: str, detect_conf: float = LOW_CONFIDENCE, classes=(PERSON,)):
        """Detections are passed to the tracker down to `detect_conf`: BoT-SORT keeps occluded people alive with
        low-score boxes (second association) and only starts new tracks above its own threshold."""
        with self.slots:
            results = model.track(
                frame,
                persist=True,
                classes=list(classes),
                conf=detect_conf,
                imgsz=image_size,
                tracker=tracker,
                device=self.device,
                quantize=self.quantize,
                verbose=False,
            )
        return results[0].boxes

    @staticmethod
    def track_features(model: YOLO) -> dict[int, list[float]]:
        """Appearance embeddings (ReID) of the tracks updated on the last frame: {track_id: vector}."""
        trackers = getattr(getattr(model, "predictor", None), "trackers", None)
        if not trackers:
            return {}
        tracker = trackers[0]
        features = {}
        for track in getattr(tracker, "tracked_stracks", []):
            feat = getattr(track, "curr_feat", None)
            if feat is not None and track.is_activated and track.frame_id == tracker.frame_id:
                features[int(track.track_id)] = feat.tolist()
        return features

    def detect_tables(self, model: YOLO, frame, confidence: float) -> list[tuple[list[float], float, str]]:
        """Tables and seating places as (box 0..1, score, "table" | "seat")."""
        height, width = frame.shape[:2]
        with self.slots:
            results = model.predict(frame, classes=list(FURNITURE), conf=confidence, imgsz=640, device=self.device, quantize=self.quantize, verbose=False)
        boxes = results[0].boxes
        if boxes is None:
            return []
        detections = []
        for (x1, y1, x2, y2), score, cls in zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()):
            detections.append(([x1 / width, y1 / height, x2 / width, y2 / height], float(score), FURNITURE[int(cls)]))
        return detections
