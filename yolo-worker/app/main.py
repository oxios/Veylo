from __future__ import annotations

import asyncio
import hmac
import io
import math
import os
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Annotated, Any

import cv2
import torch
import ultralytics
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
AVI_CONTENT_TYPE = "video/x-msvideo"


def _bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number") from error
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def _boolean_setting(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean")


@dataclass(frozen=True)
class Settings:
    model_path: Path
    confidence: float
    iou: float
    image_size: int
    max_detections: int
    max_upload_bytes: int
    max_image_pixels: int
    torch_threads: int
    tiled_inference: bool
    tile_slices: int
    tile_overlap: float
    api_key: str
    max_video_upload_bytes: int
    max_video_pixels: int
    max_video_duration_seconds: int
    video_jpeg_quality: int
    video_temp_dir: Path


def load_settings() -> Settings:
    return Settings(
        model_path=Path(os.getenv("YOLO_MODEL_PATH", "/opt/models/yolo11s.pt")).resolve(),
        confidence=_bounded_float("YOLO_CONFIDENCE", 0.12, 0.01, 1.0),
        iou=_bounded_float("YOLO_IOU", 0.70, 0.01, 1.0),
        image_size=_bounded_int("YOLO_IMAGE_SIZE", 960, 160, 1280),
        max_detections=_bounded_int("YOLO_MAX_DETECTIONS", 120, 1, 500),
        max_upload_bytes=_bounded_int("YOLO_MAX_UPLOAD_BYTES", 8 * 1024 * 1024, 1024, 64 * 1024 * 1024),
        max_image_pixels=_bounded_int("YOLO_MAX_IMAGE_PIXELS", 25_000_000, 1_000_000, 100_000_000),
        torch_threads=_bounded_int("YOLO_TORCH_THREADS", 2, 1, 32),
        tiled_inference=_boolean_setting("YOLO_TILED_INFERENCE", True),
        tile_slices=_bounded_int("YOLO_TILE_SLICES", 3, 2, 5),
        tile_overlap=_bounded_float("YOLO_TILE_OVERLAP", 0.15, 0.0, 0.45),
        api_key=os.getenv("YOLO_API_KEY", "").strip(),
        max_video_upload_bytes=_bounded_int("YOLO_MAX_VIDEO_UPLOAD_BYTES", 200 * 1024 * 1024, 1024 * 1024, 500 * 1024 * 1024),
        max_video_pixels=_bounded_int("YOLO_MAX_VIDEO_PIXELS", 25_000_000, 100_000, 100_000_000),
        max_video_duration_seconds=_bounded_int("YOLO_MAX_VIDEO_DURATION_SECONDS", 1800, 1, 14_400),
        video_jpeg_quality=_bounded_int("YOLO_VIDEO_JPEG_QUALITY", 88, 50, 95),
        video_temp_dir=Path(os.getenv("YOLO_VIDEO_TEMP_DIR", tempfile.gettempdir())).resolve(),
    )


class WorkerState:
    def __init__(self) -> None:
        self.settings = load_settings()
        self.model: YOLO | None = None
        self.lock = asyncio.Lock()
        self.video_lock = asyncio.Lock()
        self.loaded_at: float | None = None


state = WorkerState()


def _load_and_warm_model(settings: Settings) -> YOLO:
    if not settings.model_path.is_file() or settings.model_path.stat().st_size == 0:
        raise RuntimeError(f"YOLO model is missing: {settings.model_path}")
    torch.set_num_threads(settings.torch_threads)
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError:
        # PyTorch permits configuring interop threads only before parallel work starts.
        pass
    model = YOLO(str(settings.model_path), task="detect")
    warmup = Image.new("RGB", (64, 64), color=(0, 0, 0))
    with torch.inference_mode():
        model.predict(
            source=warmup,
            device="cpu",
            imgsz=min(settings.image_size, 320),
            conf=settings.confidence,
            iou=settings.iou,
            max_det=1,
            verbose=False,
        )
    return model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state.model = await run_in_threadpool(_load_and_warm_model, state.settings)
    state.loaded_at = time.time()
    yield
    state.model = None


app = FastAPI(
    title="VenueFlow YOLO worker",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


def _require_api_key(authorization: str | None) -> None:
    expected = state.settings.api_key
    if not expected:
        return
    scheme, _, provided = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid detector API key")


async def _read_image(upload: UploadFile) -> tuple[Image.Image, int, int]:
    if upload.content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only JPG, PNG, and WebP images are supported")
    data = await upload.read(state.settings.max_upload_bytes + 1)
    await upload.close()
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Uploaded image is empty")
    if len(data) > state.settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image exceeds the upload limit")
    try:
        source = Image.open(io.BytesIO(data))
        width, height = source.size
        if width <= 0 or height <= 0 or width * height > state.settings.max_image_pixels:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Decoded image dimensions exceed the limit")
        source.load()
        return source.convert("RGB"), width, height
    except HTTPException:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Uploaded file is not a valid image") from error


def _has_avi_signature(path: Path) -> bool:
    try:
        with path.open("rb") as source:
            header = source.read(12)
        return len(header) == 12 and header[:4] == b"RIFF" and header[8:12] == b"AVI "
    except OSError:
        return False


async def _stream_avi_to_temp(upload: UploadFile, settings: Settings) -> tuple[Path, int]:
    file_name = Path(upload.filename or "").name
    if upload.content_type != AVI_CONTENT_TYPE or Path(file_name).suffix.lower() != ".avi":
        await upload.close()
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .avi files with video/x-msvideo content type are supported",
        )
    settings.video_temp_dir.mkdir(parents=True, exist_ok=True)
    descriptor, raw_path = tempfile.mkstemp(prefix="venueflow-avi-", suffix=".avi", dir=settings.video_temp_dir)
    os.close(descriptor)
    path = Path(raw_path)
    total = 0
    try:
        with path.open("wb") as target:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > settings.max_video_upload_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="AVI exceeds the upload limit",
                    )
                target.write(chunk)
        if total == 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Uploaded AVI is empty")
        if not _has_avi_signature(path):
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Uploaded file is not a valid AVI")
        return path, total
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def _finite_video_number(value: float, fallback: float = 0.0) -> float:
    return float(value) if value is not None and value == value and value not in (float("inf"), float("-inf")) else fallback


def _extract_representative_frame(path: Path, size_bytes: int, settings: Settings) -> tuple[bytes, dict[str, Any]]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="OpenCV cannot decode this AVI")
    try:
        width = max(0, int(round(_finite_video_number(capture.get(cv2.CAP_PROP_FRAME_WIDTH)))))
        height = max(0, int(round(_finite_video_number(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))))
        fps = max(0.0, _finite_video_number(capture.get(cv2.CAP_PROP_FPS)))
        frame_count = max(0, int(round(_finite_video_number(capture.get(cv2.CAP_PROP_FRAME_COUNT)))))
        duration = frame_count / fps if fps > 0 and frame_count > 0 else 0.0
        if width <= 0 or height <= 0:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="AVI has invalid frame dimensions")
        if width * height > settings.max_video_pixels:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="AVI frame dimensions exceed the pixel limit")
        if duration > settings.max_video_duration_seconds:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="AVI duration exceeds the limit")

        target_frame = max(0, (frame_count - 1) // 2) if frame_count > 0 else 0
        if target_frame > 0:
            capture.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ok, frame = capture.read()
        if not ok or frame is None:
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            target_frame = 0
            ok, frame = capture.read()
        if not ok or frame is None:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="AVI contains no decodable video frame")

        frame_height, frame_width = frame.shape[:2]
        if frame_width <= 0 or frame_height <= 0 or frame_width * frame_height > settings.max_video_pixels:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Decoded AVI frame dimensions exceed the limit")
        encoded, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), settings.video_jpeg_quality])
        if not encoded:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not encode the AVI frame")
        frame_time = target_frame / fps if fps > 0 else max(0.0, _finite_video_number(capture.get(cv2.CAP_PROP_POS_MSEC)) / 1000.0)
        return jpeg.tobytes(), {
            "width": int(frame_width),
            "height": int(frame_height),
            "videoWidth": width,
            "videoHeight": height,
            "duration": round(duration, 6),
            "frameTime": round(frame_time, 6),
            "fps": round(fps, 6),
            "frameCount": frame_count,
            "sourceBytes": size_bytes,
        }
    finally:
        capture.release()


async def _process_avi_upload(upload: UploadFile, settings: Settings) -> tuple[bytes, dict[str, Any]]:
    path: Path | None = None
    try:
        path, size_bytes = await _stream_avi_to_temp(upload, settings)
        return await run_in_threadpool(_extract_representative_frame, path, size_bytes, settings)
    finally:
        if path is not None:
            path.unlink(missing_ok=True)


def _class_name(names: Any, class_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(class_id, class_id))
    if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
        return str(names[class_id])
    return str(class_id)


def _percent(value: float, extent: int) -> float:
    return min(100.0, max(0.0, value / max(1, extent) * 100.0))


def _axis_slices(extent: int, count: int, overlap: float) -> list[tuple[int, int]]:
    slice_extent = min(extent, max(1, math.ceil(extent / (count - (count - 1) * overlap))))
    if slice_extent >= extent:
        return [(0, extent)]
    stride = max(1, round(slice_extent * (1 - overlap)))
    starts = [min(index * stride, extent - slice_extent) for index in range(count)]
    return list(dict.fromkeys((start, min(extent, start + slice_extent)) for start in starts))


def _raw_predictions(model: YOLO, image: Image.Image, settings: Settings, offset_x: int = 0, offset_y: int = 0) -> list[dict[str, Any]]:
    with torch.inference_mode():
        results = model.predict(
            source=image,
            device="cpu",
            imgsz=settings.image_size,
            conf=settings.confidence,
            iou=settings.iou,
            max_det=settings.max_detections,
            verbose=False,
        )
    result = results[0]
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []
    xyxy = boxes.xyxy.detach().cpu().tolist()
    confidences = boxes.conf.detach().cpu().tolist()
    class_ids = boxes.cls.detach().cpu().tolist()
    predictions: list[dict[str, Any]] = []
    for coordinates, confidence, raw_class_id in zip(xyxy, confidences, class_ids):
        x1, y1, x2, y2 = (float(value) for value in coordinates)
        predictions.append({
            "label": _class_name(result.names, int(raw_class_id)),
            "confidence": min(1.0, max(0.0, float(confidence))),
            "x1": x1 + offset_x,
            "y1": y1 + offset_y,
            "x2": x2 + offset_x,
            "y2": y2 + offset_y,
        })
    return predictions


def _box_iou(first: dict[str, Any], second: dict[str, Any]) -> float:
    intersection_width = max(0.0, min(first["x2"], second["x2"]) - max(first["x1"], second["x1"]))
    intersection_height = max(0.0, min(first["y2"], second["y2"]) - max(first["y1"], second["y1"]))
    intersection = intersection_width * intersection_height
    first_area = max(0.0, first["x2"] - first["x1"]) * max(0.0, first["y2"] - first["y1"])
    second_area = max(0.0, second["x2"] - second["x1"]) * max(0.0, second["y2"] - second["y1"])
    union = first_area + second_area - intersection
    return intersection / union if union > 0 else 0.0


def _merge_predictions(predictions: list[dict[str, Any]], max_detections: int) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for candidate in sorted(predictions, key=lambda item: item["confidence"], reverse=True):
        if any(candidate["label"] == current["label"] and _box_iou(candidate, current) >= 0.50 for current in selected):
            continue
        selected.append(candidate)
        if len(selected) >= max_detections:
            break
    return selected


def _predict(model: YOLO, image: Image.Image, width: int, height: int, settings: Settings) -> tuple[list[dict[str, Any]], float, int]:
    started = time.perf_counter()
    predictions = _raw_predictions(model, image, settings)
    passes = 1
    if settings.tiled_inference and max(width, height) >= settings.image_size * 1.35:
        if width >= height:
            for start, end in _axis_slices(width, settings.tile_slices, settings.tile_overlap):
                predictions.extend(_raw_predictions(model, image.crop((start, 0, end, height)), settings, offset_x=start))
                passes += 1
        else:
            for start, end in _axis_slices(height, settings.tile_slices, settings.tile_overlap):
                predictions.extend(_raw_predictions(model, image.crop((0, start, width, end)), settings, offset_y=start))
                passes += 1
    elapsed_ms = (time.perf_counter() - started) * 1000
    merged = _merge_predictions(predictions, settings.max_detections)
    detections: list[dict[str, Any]] = []
    for index, prediction in enumerate(merged, start=1):
        left = _percent(prediction["x1"], width)
        top = _percent(prediction["y1"], height)
        right = _percent(prediction["x2"], width)
        bottom = _percent(prediction["y2"], height)
        detections.append({
            "id": f"yolo11-{index:03d}",
            "label": prediction["label"],
            "confidence": round(prediction["confidence"], 6),
            "x": round(left, 4),
            "y": round(top, 4),
            "width": round(max(0.0, right - left), 4),
            "height": round(max(0.0, bottom - top), 4),
        })
    detections.sort(key=lambda item: item["confidence"], reverse=True)
    return detections, elapsed_ms, passes


@app.get("/health")
async def health() -> dict[str, Any]:
    if state.model is None or state.loaded_at is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is not loaded")
    return {
        "status": "ok",
        "actual": True,
        "engine": "ultralytics-yolo11-cpu",
        "model": state.settings.model_path.name,
        "imageSize": state.settings.image_size,
        "confidence": state.settings.confidence,
        "tiledInference": state.settings.tiled_inference,
        "ultralytics": ultralytics.__version__,
        "device": "cpu",
        "uptimeSeconds": round(time.time() - state.loaded_at, 1),
    }


@app.post("/detect")
async def detect(
    request: Request,
    image: Annotated[UploadFile | None, File()] = None,
    frame: Annotated[UploadFile | None, File()] = None,
    coordinate_space: Annotated[str, Form(alias="coordinateSpace")] = "percent",
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    _require_api_key(authorization)
    if coordinate_space.lower() != "percent":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only percent coordinateSpace is supported")
    upload = image or frame
    if upload is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Attach an image in the image or frame field")
    decoded, width, height = await _read_image(upload)
    model = state.model
    if model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is not loaded")
    async with state.lock:
        detections, inference_ms, passes = await run_in_threadpool(_predict, model, decoded, width, height, state.settings)
    return {
        "status": "completed",
        "actual": True,
        "requestId": request.headers.get("x-request-id", ""),
        "engine": "ultralytics-yolo11-cpu",
        "model": state.settings.model_path.name,
        "coordinateSpace": "percent",
        "image": {"width": width, "height": height},
        "passes": passes,
        "inferenceMs": round(inference_ms, 2),
        "detections": detections,
    }


@app.post("/video/frame")
async def extract_video_frame(
    request: Request,
    video: Annotated[UploadFile | None, File()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    _require_api_key(authorization)
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attach an AVI in the video field",
        )

    # Content-Length includes multipart framing, so this is only an inexpensive
    # early rejection. The streaming copy below enforces the exact file limit.
    raw_content_length = request.headers.get("content-length", "")
    if raw_content_length.isdigit() and int(raw_content_length) > state.settings.max_video_upload_bytes + 2 * 1024 * 1024:
        await video.close()
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="AVI exceeds the upload limit",
        )

    async with state.video_lock:
        jpeg, metadata = await _process_avi_upload(video, state.settings)

    def header_number(value: Any) -> str:
        if isinstance(value, float):
            return format(value, ".6f").rstrip("0").rstrip(".") or "0"
        return str(value)

    headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Video-Engine": "opencv",
        "X-Frame-Width": header_number(metadata["width"]),
        "X-Frame-Height": header_number(metadata["height"]),
        "X-Video-Width": header_number(metadata["videoWidth"]),
        "X-Video-Height": header_number(metadata["videoHeight"]),
        "X-Video-Duration": header_number(metadata["duration"]),
        "X-Video-Frame-Time": header_number(metadata["frameTime"]),
        "X-Video-FPS": header_number(metadata["fps"]),
        "X-Video-Frame-Count": header_number(metadata["frameCount"]),
        "X-Video-Source-Bytes": header_number(metadata["sourceBytes"]),
    }
    request_id = request.headers.get("x-request-id", "").strip()
    if request_id and request_id.isascii() and len(request_id) <= 128:
        headers["X-Request-Id"] = request_id
    return Response(content=jpeg, media_type="image/jpeg", headers=headers)
