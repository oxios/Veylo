"""Pure helpers of the processing node (no network, no model) so they can be unit tested."""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

STORAGE_KEY_PATTERN = re.compile(r"^[a-f0-9-]{36}\.(?:mp4|mov|avi|mkv|jpg)$")
CAMERA_ID_PATTERN = re.compile(r"^[a-f0-9]{24}$")
FALLBACK_FPS = 25.0


class JobCancelled(Exception):
    """The video was deleted (or requeued) while it was being processed."""


class JobFailed(Exception):
    """A user-facing processing failure (message is shown in the UI, Ukrainian)."""


def env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name, "").strip()
    value = float(raw) if raw else default
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    value = int(raw) if raw else default
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean")


def storage_path(storage_dir: Path, key: str) -> Path:
    """Resolve a server-generated storage key; anything that could escape the directory is rejected."""
    if not isinstance(key, str) or not STORAGE_KEY_PATTERN.match(key):
        raise ValueError("Invalid storage key")
    base = storage_dir.resolve()
    resolved = (base / key).resolve()
    if resolved.parent != base:
        raise ValueError("Storage key escapes storage dir")
    return resolved


def normalized_fps(raw_fps: float) -> float:
    if not raw_fps or math.isnan(raw_fps) or raw_fps <= 0 or raw_fps > 240:
        return FALLBACK_FPS
    return float(raw_fps)


def frame_step(source_fps: float, sample_fps: float) -> int:
    """Process every Nth frame so that roughly `sample_fps` frames per second reach the model."""
    return max(1, round(source_fps / sample_fps))


def inference_size(frame_width: int, configured: int, gpu: bool, gpu_limit: int = 1280) -> int:
    """YOLO input size: on a GPU the frame is analysed at its own width (up to `gpu_limit`), so distant
    people (a street seen through the door glass) stay a few dozen pixels tall instead of vanishing."""
    if not gpu:
        return configured
    native = -(-frame_width // 32) * 32
    return max(configured, min(gpu_limit, native))


def foot_point(xyxy: list[float], width: int, height: int) -> tuple[float, float]:
    """Bottom-centre of a person box as a 0..1 frame fraction; that is where the person stands."""
    x1, _y1, x2, y2 = xyxy
    x = min(1.0, max(0.0, (x1 + x2) / 2 / width))
    y = min(1.0, max(0.0, y2 / height))
    return round(x, 4), round(y, 4)


def normalized_box(xyxy: list[float], width: int, height: int) -> list[float]:
    x1, y1, x2, y2 = xyxy
    clamp = lambda value: round(min(1.0, max(0.0, value)), 4)  # noqa: E731
    return [clamp(x1 / width), clamp(y1 / height), clamp(x2 / width), clamp(y2 / height)]


@dataclass
class TrackCollector:
    """Tracks of an uploaded video file (points relative to the start of the file)."""

    min_points: int = 3
    tracks: dict[int, list[list[float]]] = field(default_factory=dict)

    def add(self, track_id: int, t: float, x: float, y: float) -> None:
        self.tracks.setdefault(int(track_id), []).append([round(t, 2), x, y])

    def finalize(self) -> list[dict]:
        """Tracks shorter than `min_points` samples are detector flicker, not people."""
        return [
            {"trackId": track_id, "points": points}
            for track_id, points in sorted(self.tracks.items())
            if len(points) >= self.min_points
        ]


# ---- live tracks -------------------------------------------------------------------------------


# ---- holding people the detector stopped seeing ----------------------------------------------------------------
# A guest sits down behind the showcase: only legs and a bit of clothing stay visible and YOLO no longer calls it a
# person. The node then "holds" the track: it keeps matching the last view of that spot (template matching) and keeps
# the person present while it still matches. The hold ends when the person stands up (the detector sees someone there
# again → handoff) or the spot stops matching (they left).

HOLD_MIN_AGE = 3.0  # flicker tracks are not held
STATIONARY_WINDOW = 4.0
HOLD_KEEP_SCORE = 0.55
HOLD_DROP_SCORE = 0.45
HOLD_DROP_AFTER = 4.0  # seconds below HOLD_DROP_SCORE
HOLD_MAX_SEC = 90 * 60
HOLD_MAX = 6


def _point_in_polygon(x: float, y: float, polygon: list[list[float]]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def _segment_distance(x: float, y: float, a: list[float], b: list[float]) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    k = 0.0 if length == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length))
    return math.hypot(x - (ax + k * dx), y - (ay + k * dy))


def hold_eligible(box: list[float], no_hold: dict | None, stationary: bool = False) -> bool:
    """A lost person may be held only where people do not simply walk out of view: not at the frame edge (unless they
    were sitting still there), not in the doorway / on the sidewalk, not at the threshold. box: normalised [x1, y1, x2, y2]."""
    x1, y1, x2, y2 = box
    if y2 - y1 < 0.08:
        return False
    if not stationary and (x1 < 0.015 or x2 > 0.985 or y2 > 0.985):
        return False
    fx, fy = (x1 + x2) / 2, y2
    zones = (no_hold or {}).get("zones") or []
    if any(_point_in_polygon(fx, fy, zone) for zone in zones):
        return False
    line = (no_hold or {}).get("line")
    if line and _segment_distance(fx, fy, line[0], line[1]) < 0.06:
        return False
    return True


@dataclass
class _Hold:
    box: list[float]
    since: float
    low_since: float | None = None


class HoldBook:
    """State of held tracks; the image matching itself happens in the live loop."""

    def __init__(self):
        self.holds: dict[int, _Hold] = {}

    def start(self, track_id: int, box: list[float], t: float) -> bool:
        if track_id in self.holds or len(self.holds) >= HOLD_MAX:
            return False
        # The spot is already held (the same seated person flickered into a new track): one box per person.
        x1, y1, x2, y2 = box
        for hold in self.holds.values():
            hx1, hy1, hx2, hy2 = hold.box
            ix = max(0.0, min(x2, hx2) - max(x1, hx1))
            iy = max(0.0, min(y2, hy2) - max(y1, hy1))
            union = (x2 - x1) * (y2 - y1) + (hx2 - hx1) * (hy2 - hy1) - ix * iy
            if union > 0 and ix * iy / union >= 0.4:
                return False
        self.holds[track_id] = _Hold(box=list(box), since=t)
        return True

    def handoff(self, detected: list[list[float]]) -> list[int]:
        """Holds whose spot the detector covers again (the person stood up): they end, the new track takes over.
        detected: [[trackId, x1, y1, x2, y2, conf], ...]"""
        ended = []
        for track_id, hold in list(self.holds.items()):
            hx1, hy1, hx2, hy2 = hold.box
            hfx, hfy = (hx1 + hx2) / 2, hy2
            for _, x1, y1, x2, y2, _conf in detected:
                ix = max(0.0, min(hx2, x2) - max(hx1, x1))
                iy = max(0.0, min(hy2, y2) - max(hy1, y1))
                area = max(1e-9, (hx2 - hx1) * (hy2 - hy1))
                if ix * iy / area >= 0.3 and math.hypot((x1 + x2) / 2 - hfx, y2 - hfy) <= 0.12:
                    ended.append(track_id)
                    del self.holds[track_id]
                    break
        return ended

    def update(self, track_id: int, score: float, box: list[float], t: float) -> bool:
        """Applies one match result; returns whether the person is still held (present)."""
        hold = self.holds.get(track_id)
        if hold is None:
            return False
        if t - hold.since > HOLD_MAX_SEC:
            del self.holds[track_id]
            return False
        if score >= HOLD_KEEP_SCORE:
            hold.box = list(box)
            hold.low_since = None
            return True
        if score < HOLD_DROP_SCORE:
            if hold.low_since is None:
                hold.low_since = t
            if t - hold.low_since >= HOLD_DROP_AFTER:
                del self.holds[track_id]
                return False
        return True  # uncertain for a moment: still there


def drop_duplicates(boxes: list[list[float]], min_iou: float = 0.45, min_contain: float = 0.85) -> list[list[float]]:
    """One person, two boxes: YOLO sometimes returns a tight box and a wider "person + chair" box around a seated
    person (IoU ~0.55, below NMS's 0.7), and the tracker gives each its own id. A box lying almost entirely inside
    another with a large overlap is the same person; the older track (lower id) is kept so its number survives.
    People standing one behind another overlap less (a distant person is a small part of the near one's box).
    boxes: [[trackId, x1, y1, x2, y2, conf], ...]"""
    kept: list[list[float]] = []
    for box in sorted(boxes, key=lambda item: item[0]):
        duplicate = False
        for other in kept:
            ix = max(0.0, min(box[3], other[3]) - max(box[1], other[1]))
            iy = max(0.0, min(box[4], other[4]) - max(box[2], other[2]))
            inter = ix * iy
            area_a = (box[3] - box[1]) * (box[4] - box[2])
            area_b = (other[3] - other[1]) * (other[4] - other[2])
            if inter <= 0:
                continue
            iou = inter / max(1e-9, area_a + area_b - inter)
            if iou >= min_iou and inter / max(1e-9, min(area_a, area_b)) >= min_contain:
                duplicate = True
                break
        if not duplicate:
            kept.append(box)
    return kept


def shot_quality(box: list[float], conf: float) -> float:
    """How good a frame is as visual proof of the track (journal thumbnail): any size, the larger and surer the
    better. Distant passers-by get a small but real crop."""
    x1, y1, x2, y2 = box
    if conf < 0.25:
        return 0.0
    edge = 0.5 if x1 < 0.005 or x2 > 0.995 or y1 < 0.005 or y2 > 0.995 else 1.0
    return round(conf * (y2 - y1) * edge, 4)


def rides_bicycle(person: list[float], bicycles: list[list[float]]) -> bool:
    """A person box whose lower half overlaps a bicycle box (≥ 30 % of the bicycle) is riding or pushing it."""
    x1, y1, x2, y2 = person
    mid = (y1 + y2) / 2
    for bx1, by1, bx2, by2 in bicycles:
        area = max(1e-9, (bx2 - bx1) * (by2 - by1))
        ix = max(0.0, min(x2, bx2) - max(x1, bx1))
        iy = max(0.0, min(y2, by2) - max(mid, by1))
        if ix * iy / area >= 0.3:
            return True
    return False


def appearance_quality(box: list[float], conf: float, others: list[list[float]]) -> float:
    """How good a detection is for the person's appearance vector and thumbnail (0 = do not use).

    Boxes are normalised [x1, y1, x2, y2]. Small (distant) people, people overlapping someone else and people
    cut by the frame edge give unreliable embeddings: an overlap mixes two people's clothes into one vector.
    """
    x1, y1, x2, y2 = box
    height = y2 - y1
    area = max(1e-9, (x2 - x1) * height)
    if height < 0.12 or conf < 0.45:
        return 0.0
    for other in others:
        ix = max(0.0, min(x2, other[2]) - max(x1, other[0]))
        iy = max(0.0, min(y2, other[3]) - max(y1, other[1]))
        if ix * iy / area > 0.08:
            return 0.0
    edge = 0.5 if x1 < 0.005 or x2 > 0.995 or y1 < 0.005 or y2 > 0.995 else 1.0
    return round(conf * height * edge, 4)


@dataclass
class _LiveTrack:
    key: str
    start: float
    last_seen: float
    last_point: float = -1e9
    x: float = 0.0
    y: float = 0.0
    points: list[list[float]] = field(default_factory=list)  # not yet uploaded
    total: int = 0  # points recorded (uploaded + pending)
    sent: int = 0  # points the API has stored
    final: bool = False
    feat_sum: list[float] | None = None  # sum of L2-normalised appearance embeddings of good frames
    feat_n: int = 0
    feat_sent_n: int = 0
    shot: dict | None = None  # best frame: {"at": ms, "box": [x1, y1, x2, y2], "score": q, "ref": file key}
    shot_sent: dict | None = None
    kind: str = "person"  # "person" | "bicycle"
    max_conf: float = 0.0  # best detection confidence (night reflections stay low)
    max_conf_sent: float = 0.0
    bike_frames: int = 0  # frames where this person was on a bicycle
    recent: list = field(default_factory=list)  # (t, x, y) of the last few seconds
    bike_sent: bool = False


class LiveTrackBook:
    """Live person tracks of one camera session, uploaded incrementally.

    Points are sampled at most every `point_interval` seconds as [secondsFromStart, x, y]. A track is final when
    it has not been seen for `lost_after` seconds. Tracks are uploaded only once they have `min_points` points
    (shorter ones are detector flicker). `drain()` returns the upload batch; each item carries `from`, the number
    of points the API already has, which makes retried uploads idempotent.
    """

    def __init__(self, session: str, point_interval: float = 0.5, lost_after: float = 3.0, min_points: int = 2,
                 min_feat_samples: int = 3, max_feat_samples: int = 400, dense_start: float = 2.0):
        self.session = session
        # A passer-by crosses the door glass in under a second (3-4 analysed frames): the first seconds of a track are
        # kept frame by frame, later points every `point_interval`.
        self.dense_start = dense_start
        self.min_feat_samples = min_feat_samples
        self.max_feat_samples = max_feat_samples
        self.point_interval = point_interval
        self.lost_after = lost_after
        self.min_points = min_points
        self.tracks: dict[int, _LiveTrack] = {}
        self.generations: dict[int, int] = {}  # the tracker may revive an id after we closed its track

    def observe(self, t: float, people: list[tuple[int, float, float]], kind: str = "person") -> None:
        for track_id, x, y in people:
            track = self.tracks.get(track_id)
            if track is None or track.final:
                generation = self.generations.get(track_id, 0)
                self.generations[track_id] = generation + 1
                key = f"{self.session}:{track_id}" if generation == 0 else f"{self.session}:{track_id}r{generation}"
                track = _LiveTrack(key=key, start=t, last_seen=t, kind=kind)
                self.tracks[track_id] = track
            track.last_seen = t
            track.x, track.y = x, y
            track.recent.append((t, x, y))
            while track.recent and t - track.recent[0][0] > STATIONARY_WINDOW:
                track.recent.pop(0)
            if t - track.start < self.dense_start or t - track.last_point >= self.point_interval:
                track.points.append([round(t - track.start, 2), x, y])
                track.total += 1
                track.last_point = t

    def note_conf(self, track_id: int, conf: float) -> None:
        track = self.tracks.get(track_id)
        if track is not None and conf > track.max_conf:
            track.max_conf = conf

    def stationary(self, track_id: int) -> bool:
        """Sat or stood still for the last seconds (a seated guest), as opposed to walking out of view."""
        track = self.tracks.get(track_id)
        if track is None or len(track.recent) < 3 or track.recent[-1][0] - track.recent[0][0] < STATIONARY_WINDOW * 0.6:
            return False
        xs = [point[1] for point in track.recent]
        ys = [point[2] for point in track.recent]
        return max(xs) - min(xs) < 0.03 and max(ys) - min(ys) < 0.03

    def end(self, track_id: int, t: float) -> None:
        """The track is over now (a hold ended or handed over to a new detector track)."""
        track = self.tracks.get(track_id)
        if track is not None and not track.final:
            track.final = True

    def mark_bike(self, track_id: int) -> None:
        track = self.tracks.get(track_id)
        if track is not None and not track.final:
            track.bike_frames += 1

    def add_appearance(self, track_id: int, feat: list[float] | None, t: float, box: list[float], quality: float) -> str | None:
        """Adds one good frame of a track: its embedding joins the mean, the best frame becomes the thumbnail.
        Returns the thumbnail reference when this frame is the new best one (the caller saves the crop under it)."""
        track = self.tracks.get(track_id)
        if track is None or track.final or quality <= 0:
            return None
        if feat is not None:
            self._add_feature(track, feat)
        if track.shot is None or quality > track.shot["score"] * 1.15:
            ref = f"{self.session}_{track_id}"
            track.shot = {"at": int(t * 1000), "box": [round(value, 4) for value in box], "score": quality, "ref": ref}
            return ref
        return None

    def _add_feature(self, track: _LiveTrack, feat: list[float]) -> None:
        norm = math.sqrt(sum(value * value for value in feat)) or 1.0
        unit = [value / norm for value in feat]
        if track.feat_sum is None or len(track.feat_sum) != len(unit):
            track.feat_sum = unit
            track.feat_n = 1
        elif track.feat_n < self.max_feat_samples:
            track.feat_sum = [a + b for a, b in zip(track.feat_sum, unit)]
            track.feat_n += 1

    def expire(self, now: float) -> None:
        for track in self.tracks.values():
            if not track.final and now - track.last_seen >= self.lost_after:
                track.final = True

    def current(self, now: float, max_age: float = 1.5) -> list[tuple[int, float, float]]:
        return [
            (track_id, track.x, track.y)
            for track_id, track in self.tracks.items()
            if not track.final and track.kind == "person" and now - track.last_seen <= max_age and track.total >= self.min_points
        ]

    def drain(self) -> list[dict]:
        batch = []
        for track_id in list(self.tracks):
            track = self.tracks[track_id]
            ready = track.total >= self.min_points
            if ready and (track.points or (track.final and track.sent > 0)):
                item = {
                    "key": track.key,
                    "startAt": int(track.start * 1000),
                    "endAt": int(track.last_seen * 1000),
                    "from": track.sent,
                    "points": track.points,
                    "final": track.final,
                }
                if track.feat_sum is not None and track.feat_n >= self.min_feat_samples and track.feat_n != track.feat_sent_n:
                    norm = math.sqrt(sum(value * value for value in track.feat_sum)) or 1.0
                    item["feat"] = [round(value / norm, 4) for value in track.feat_sum]
                    item["featN"] = track.feat_n
                    track.feat_sent_n = track.feat_n
                if track.shot is not None and track.shot is not track.shot_sent:
                    item["shot"] = track.shot
                    track.shot_sent = track.shot
                if track.kind != "person":
                    item["cls"] = track.kind
                if track.max_conf > track.max_conf_sent:
                    item["conf"] = round(track.max_conf, 2)
                    track.max_conf_sent = track.max_conf
                if track.bike_frames >= 2 and not track.bike_sent:
                    item["bike"] = True
                    track.bike_sent = True
                batch.append(item)
                track.sent += len(track.points)
                track.points = []
            if track.final:
                del self.tracks[track_id]
        return batch


class CoverageCounter:
    """Seconds actually analysed, per minute (epoch ms of the minute start) -> distinct seconds."""

    def __init__(self, keep_minutes: int = 10):
        self.keep_minutes = keep_minutes
        self.minutes: dict[int, set[int]] = {}

    def mark(self, t: float) -> None:
        second = int(t)
        minute = second // 60 * 60_000
        self.minutes.setdefault(minute, set()).add(second % 60)

    def report(self, now: float, recent_minutes: int = 3) -> list[dict]:
        newest = int(now) // 60 * 60_000
        for minute in [m for m in self.minutes if m < newest - self.keep_minutes * 60_000]:
            del self.minutes[minute]
        return [
            {"minute": minute, "seconds": len(seconds)}
            for minute, seconds in sorted(self.minutes.items())
            if minute >= newest - recent_minutes * 60_000
        ]


# ---- tables ------------------------------------------------------------------------------------


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


@dataclass
class TableCluster:
    box: list[float]
    score: float
    hits: int
    kind: str = "table"


class TableClusterer:
    """Accumulates table / seating-place detections over several frames; stable boxes become suggestions."""

    def __init__(self, merge_iou: float = 0.45, max_clusters: int = 60):
        self.merge_iou = merge_iou
        self.max_clusters = max_clusters
        self.clusters: list[TableCluster] = []
        self.runs = 0

    def add_run(self, detections: list[tuple]) -> None:
        self.runs += 1
        for detection in detections:
            box, score = detection[0], detection[1]
            kind = detection[2] if len(detection) > 2 else "table"
            same_kind = [cluster for cluster in self.clusters if cluster.kind == kind]
            best = max(same_kind, key=lambda cluster: iou(tuple(cluster.box), tuple(box)), default=None)
            if best is not None and iou(tuple(best.box), tuple(box)) >= self.merge_iou:
                weight = best.hits
                best.box = [round((value * weight + new) / (weight + 1), 4) for value, new in zip(best.box, box)]
                best.score = max(best.score, score)
                best.hits += 1
            elif len(self.clusters) < self.max_clusters:
                self.clusters.append(TableCluster(box=[round(v, 4) for v in box], score=score, hits=1, kind=kind))

    def candidates(self) -> list[dict]:
        # After several runs a box seen only once was a person or a bag on the floor.
        min_hits = 1 if self.runs < 3 else 2
        return [
            {"x1": c.box[0], "y1": c.box[1], "x2": c.box[2], "y2": c.box[3], "score": round(min(1.0, c.score), 3), "hits": c.hits, "kind": c.kind}
            for c in sorted(self.clusters, key=lambda cluster: (cluster.box[1], cluster.box[0]))
            if c.hits >= min_hits
        ]


# ---- RTSP / MediaMTX ---------------------------------------------------------------------------

RTSP_ERRORS = [
    ("auth", ("401", "unauthorized", "authorization failed", "authentication")),
    ("not_found", ("404", "not found", "stream not found")),
    ("refused", ("connection refused",)),
    ("timeout", ("timed out", "timeout", "no route to host", "network is unreachable")),
    ("dns", ("name or service not known", "temporary failure in name resolution", "failed to resolve")),
    ("codec", ("invalid data found", "could not find codec", "unsupported codec")),
]

RTSP_MESSAGES = {
    "auth": "Камера відхилила логін або пароль",
    "not_found": "Камера не знає такого шляху потоку",
    "refused": "Камера відхилила з'єднання (порт закритий)",
    "timeout": "Камера не відповідає (немає мережі або порт закритий)",
    "dns": "Не вдалося знайти адресу камери",
    "codec": "Потік не схожий на відео, яке ми вміємо читати",
    "unknown": "Не вдалося відкрити потік камери",
}


def classify_rtsp_error(stderr: str) -> str:
    text = (stderr or "").lower()
    for code, needles in RTSP_ERRORS:
        if any(needle in text for needle in needles):
            return code
    return "unknown"


def mask_url(text: str) -> str:
    """Hides credentials of rtsp://user:pass@host URLs in logs and error messages."""
    return re.sub(r"(rtsps?://)[^/@\s]+@", r"\1***@", text or "")


def path_names(camera_id: str) -> dict[str, str]:
    if not CAMERA_ID_PATTERN.match(camera_id or ""):
        raise ValueError("Invalid camera id")
    prefix = f"c{camera_id}"
    return {"main": f"{prefix}_main", "rec": f"{prefix}_rec", "sub": f"{prefix}_sub"}


def mediamtx_paths(camera: dict, record: bool = True) -> dict[str, dict]:
    """MediaMTX path configuration of one camera on the node.

    `_main` pulls the main stream; when it is available MediaMTX runs ffmpeg that republishes video only (no audio)
    to `_rec`, which is recorded (24 h retention comes from pathDefaults). `_sub` pulls the substream for analysis
    and live view.
    """
    names = path_names(camera["id"])
    paths = {
        names["main"]: {"source": camera["main"], "rtspTransport": "tcp", "sourceOnDemand": False},
        names["rec"]: {"source": "publisher", "record": True},
    }
    if record:
        paths[names["main"]]["runOnAvailable"] = (
            "ffmpeg -nostdin -loglevel error -rtsp_transport tcp -i rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH "
            f"-map 0:v:0 -c copy -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:$RTSP_PORT/{names['rec']}"
        )
        paths[names["main"]]["runOnAvailableRestart"] = True
    if camera.get("sub"):
        paths[names["sub"]] = {"source": camera["sub"], "rtspTransport": "tcp", "sourceOnDemand": False}
    return paths


def path_available(state: dict) -> bool:
    """MediaMTX runtime path state: `available` (v1.15+) or `ready` (older releases)."""
    return bool(state.get("available", state.get("ready", False)))


RECORDING_NAME = re.compile(r"^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d+)\.mp4$")


def recording_start(name: str) -> datetime | None:
    """Start time of a MediaMTX recording segment named %Y-%m-%d_%H-%M-%S-%f.mp4 (UTC)."""
    match = RECORDING_NAME.match(name)
    if not match:
        return None
    year, month, day, hour, minute, second, fraction = match.groups()
    micro = int(fraction[:6].ljust(6, "0"))
    return datetime(int(year), int(month), int(day), int(hour), int(minute), int(second), micro, tzinfo=timezone.utc)
