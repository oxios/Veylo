"""SAM 2: outlines the object under one click on the camera frame (furniture → table zones in the markup)."""

from __future__ import annotations

import logging
import threading

import cv2
import numpy as np

log = logging.getLogger("camera-node.segment")
MAX_POINTS = 24
MAX_AREA = 0.2  # of the frame


def mask_outline(mask: np.ndarray, max_points: int = MAX_POINTS) -> list[dict]:
    """Largest contour of a binary mask simplified to ≤ max_points vertices, as frame fractions."""
    height, width = mask.shape[:2]
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 0.0005 * width * height:
        return []
    perimeter = cv2.arcLength(contour, True)
    epsilon = 0.004 * perimeter
    approx = cv2.approxPolyDP(contour, epsilon, True)
    while len(approx) > max_points:
        epsilon *= 1.3
        approx = cv2.approxPolyDP(contour, epsilon, True)
    return [{"x": round(float(x) / width, 4), "y": round(float(y) / height, 4)} for [[x, y]] in approx]


class Segmenter:
    """Loads SAM 2 on first use (≈ 160 MB on the GPU) and serialises requests."""

    def __init__(self, model_path: str, device: str):
        self.model_path = model_path
        self.device = device
        self.model = None
        self.lock = threading.Lock()

    def outline(self, frame: np.ndarray, x: float, y: float) -> dict:
        with self.lock:
            if self.model is None:
                from ultralytics import SAM

                self.model = SAM(self.model_path)
                log.info("SAM 2 loaded: %s on %s", self.model_path, self.device)
            height, width = frame.shape[:2]
            point = [[int(x * width), int(y * height)]]
            results = self.model.predict(frame, points=point, labels=[1], device=self.device, verbose=False)
        masks = results[0].masks
        if masks is None or not len(masks.data):
            return {"points": [], "score": None}
        data = masks.data.cpu().numpy()
        # Take the largest candidate mask that contains the click and is furniture-sized: a click on the floor
        # makes SAM return the whole floor, which is not a table zone.
        best, best_area = None, -1
        for mask in data:
            mask = mask > 0.5
            area = int(mask.sum())
            if not mask[min(height - 1, point[0][1]), min(width - 1, point[0][0])] or area > MAX_AREA * width * height:
                continue
            if area > best_area:
                best, best_area = mask, area
        if best is None:
            return {"points": [], "score": None}
        return {"points": mask_outline(best), "score": round(best_area / (width * height), 4)}
