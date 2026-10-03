"""MediaMTX of the node (camera ingest, 24 h recording, playback) and ffmpeg helpers."""

from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from .pipeline import RTSP_MESSAGES, classify_rtsp_error, mask_url

log = logging.getLogger("camera-node.media")
MANAGED_PATH = re.compile(r"^c[a-f0-9]{24}_(main|rec|sub)$")


class MediaMtx:
    def __init__(self, api: str, rtsp: str, playback: str):
        self.api = api
        self.rtsp = rtsp
        self.playback = playback
        self.http = requests.Session()
        self.applied: dict[str, dict] = {}
        self.lock = threading.Lock()

    def rtsp_url(self, name: str) -> str:
        return f"{self.rtsp}/{name}"

    def wait_ready(self, timeout: float = 60) -> bool:
        deadline = datetime.now().timestamp() + timeout
        while datetime.now().timestamp() < deadline:
            try:
                if self.http.get(f"{self.api}/v3/config/global/get", timeout=3).ok:
                    return True
            except requests.RequestException:
                pass
            threading.Event().wait(1)
        return False

    def _configured(self) -> list[str]:
        response = self.http.get(f"{self.api}/v3/config/paths/list", params={"itemsPerPage": 1000}, timeout=5)
        response.raise_for_status()
        return [item["name"] for item in response.json().get("items", [])]

    def sync(self, desired: dict[str, dict]) -> None:
        """Makes the node's MediaMTX paths match `desired` (only paths managed by the node are touched)."""
        with self.lock:
            if not self.applied:
                # First sync after a restart: start from a clean state.
                for name in self._configured():
                    if MANAGED_PATH.match(name):
                        self._delete(name)
            for name in list(self.applied):
                if name not in desired or self.applied[name] != desired[name]:
                    self._delete(name)
                    self.applied.pop(name, None)
            for name, conf in desired.items():
                if name in self.applied:
                    continue
                response = self.http.post(f"{self.api}/v3/config/paths/add/{name}", json=conf, timeout=5)
                if not response.ok:
                    log.warning("mediamtx rejected path %s: %s", name, mask_url(response.text[:200]))
                    continue
                self.applied[name] = conf

    def _delete(self, name: str) -> None:
        try:
            self.http.delete(f"{self.api}/v3/config/paths/delete/{name}", timeout=5)
        except requests.RequestException:
            pass

    def path_state(self, name: str) -> dict:
        try:
            response = self.http.get(f"{self.api}/v3/paths/get/{name}", timeout=3)
            return response.json() if response.ok else {}
        except (requests.RequestException, ValueError):
            return {}

    def list_recordings(self, name: str, start: datetime, end: datetime) -> list[dict]:
        params = {"path": name, "start": start.isoformat(), "end": end.isoformat()}
        try:
            response = self.http.get(f"{self.playback}/list", params=params, timeout=10)
        except requests.RequestException as error:
            raise RuntimeError("Архів вузла недоступний") from error
        if response.status_code == 404:
            return []
        response.raise_for_status()
        return [{"start": item["start"], "duration": float(item["duration"])} for item in response.json()]

    def fetch_recording(self, name: str, start: datetime, duration: float, target: Path) -> None:
        params = {"path": name, "start": start.isoformat(), "duration": f"{duration:.3f}", "format": "fmp4"}
        with self.http.get(f"{self.playback}/get", params=params, stream=True, timeout=120) as response:
            if response.status_code == 404:
                raise RuntimeError("За цей час запису немає")
            response.raise_for_status()
            with target.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    handle.write(chunk)


# ---- ffmpeg / ffprobe --------------------------------------------------------------------------


def _run(args: list[str], timeout: float, binary_output: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, timeout=timeout, check=False, text=not binary_output)


def probe_stream(url: str, timeout: float = 15) -> dict:
    """Codec, size and fps of the first video stream, or a classified error."""
    args = [
        "ffprobe", "-v", "error", "-rtsp_transport", "tcp", "-timeout", str(int(min(timeout, 12) * 1_000_000)),
        "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,r_frame_rate",
        "-of", "json", url,
    ]
    try:
        result = _run(args, timeout=timeout + 5)
    except subprocess.TimeoutExpired:
        return {"ok": False, "errorCode": "timeout", "error": RTSP_MESSAGES["timeout"]}
    streams = []
    if result.returncode == 0:
        try:
            streams = json.loads(result.stdout or "{}").get("streams", [])
        except ValueError:
            streams = []
    if not streams:
        code = classify_rtsp_error(result.stderr)
        log.info("probe failed (%s): %s", code, mask_url((result.stderr or "").strip()[-300:]))
        return {"ok": False, "errorCode": code, "error": RTSP_MESSAGES[code]}
    stream = streams[0]
    return {
        "ok": True,
        "codec": stream.get("codec_name", ""),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "fps": _rate(stream.get("avg_frame_rate")) or _rate(stream.get("r_frame_rate")),
    }


def _rate(value: str | None) -> float | None:
    try:
        numerator, denominator = (value or "0/0").split("/")
        return round(float(numerator) / float(denominator), 2) if float(denominator) else None
    except ValueError:
        return None


def grab_jpeg(url: str, timeout: float = 20, max_width: int | None = None) -> bytes | None:
    # Decode keyframes only: a stream joined mid-GOP (typical for HEVC cameras) otherwise yields a grey smear.
    args = [
        "ffmpeg", "-nostdin", "-loglevel", "error", "-rtsp_transport", "tcp", "-timeout", "10000000",
        "-skip_frame", "nokey", "-i", url, "-frames:v", "1", "-fps_mode", "passthrough",
    ]
    if max_width:
        args += ["-vf", f"scale='min({max_width},iw)':-2"]
    args += ["-q:v", "3", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]
    try:
        result = _run(args, timeout=timeout, binary_output=True)
    except subprocess.TimeoutExpired:
        return None
    data = result.stdout or b""
    return data if result.returncode == 0 and data[:3] == b"\xff\xd8\xff" else None


def save_person_crop(directory: Path, ref: str, frame, box: list[float], height: int = 288) -> None:
    """Best frame of a person for the guest journal: a padded crop, kept on the node no longer than the archive."""
    import cv2  # the node image always has OpenCV; imported lazily so pure helpers stay importable without it

    frame_height, frame_width = frame.shape[:2]
    x1, y1, x2, y2 = box
    pad_x, pad_y = (x2 - x1) * 0.18, (y2 - y1) * 0.08
    left, right = max(0, int((x1 - pad_x) * frame_width)), min(frame_width, int((x2 + pad_x) * frame_width))
    top, bottom = max(0, int((y1 - pad_y) * frame_height)), min(frame_height, int((y2 + pad_y) * frame_height))
    if right - left < 8 or bottom - top < 8:
        return
    crop = frame[top:bottom, left:right]
    scale = height / crop.shape[0]
    crop = cv2.resize(crop, (max(1, int(crop.shape[1] * scale)), height), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    ok, buffer = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if ok:
        directory.mkdir(parents=True, exist_ok=True)
        temp = directory / f"{ref}.tmp"
        temp.write_bytes(buffer.tobytes())
        temp.replace(directory / f"{ref}.jpg")


def nvenc_available() -> bool:
    try:
        result = _run(["ffmpeg", "-hide_banner", "-encoders"], timeout=10)
        return "h264_nvenc" in (result.stdout or "")
    except (OSError, subprocess.TimeoutExpired):
        return False


def finalize_clip(source: Path, target: Path, transcode: bool, use_nvenc: bool) -> None:
    """Remuxes a fragmented MP4 from the playback server into a seekable MP4 (optionally H.264)."""
    args = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(source), "-map", "0:v:0", "-an"]
    if transcode:
        if use_nvenc:
            args += ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "26", "-pix_fmt", "yuv420p"]
        else:
            args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p"]
    else:
        args += ["-c:v", "copy"]
        codec = probe_file_codec(source)
        if codec == "hevc":
            args += ["-tag:v", "hvc1"]  # Safari/Chrome need the hvc1 tag for HEVC in MP4
    args += ["-movflags", "+faststart", str(target)]
    result = _run(args, timeout=900)
    if result.returncode != 0 or not target.exists():
        if transcode and use_nvenc:
            return finalize_clip(source, target, transcode, use_nvenc=False)
        raise RuntimeError("Не вдалося підготувати фрагмент запису")
    return None


def probe_file_codec(path: Path) -> str:
    result = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)], timeout=30)
    return (result.stdout or "").strip()


class Publisher:
    """Pushes a camera's live stream (video only, no re-encode) to the MediaMTX hub of the main server."""

    def __init__(self, source_url: str, target_url: str, label: str):
        self.source_url = source_url
        self.target_url = target_url
        self.label = label
        self.process: subprocess.Popen | None = None

    def running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start(self) -> None:
        if self.running():
            return
        args = [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", self.source_url,
            "-map", "0:v:0", "-c", "copy", "-f", "rtsp", "-rtsp_transport", "tcp", self.target_url,
        ]
        self.process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log.info("live publishing started for %s", self.label)

    def stop(self) -> None:
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None
        log.info("live publishing stopped for %s", self.label)


def hub_publish_url(hub_rtsp: str, hub_path: str, token: str) -> str:
    scheme, rest = hub_rtsp.split("://", 1)
    return f"{scheme}://node:{quote(token, safe='')}@{rest}/{hub_path}"


def utc_from_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def disk_usage(path: Path) -> dict:
    try:
        usage = shutil.disk_usage(path)
        return {"total": usage.total, "free": usage.free}
    except OSError:
        return {}
