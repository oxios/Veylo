"""HTTP client of the main server's node API (bearer token)."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import requests


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code


class ApiClient:
    def __init__(self, base_url: str, token: str, timeout: float = 20.0):
        self.base_url = base_url
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "User-Agent": "venueflow-camera-node"})

    def _request(self, method: str, path: str, *, timeout: float | None = None, **kwargs) -> requests.Response:
        try:
            response = self.session.request(method, f"{self.base_url}/api/node{path}", timeout=timeout or self.timeout, **kwargs)
        except requests.RequestException as error:
            raise ApiError(0, "NETWORK", str(error)) from error
        if response.status_code >= 400:
            code, message = "HTTP_ERROR", response.text[:200]
            try:
                body = response.json().get("error", {})
                code, message = body.get("code", code), body.get("message", message)
            except ValueError:
                pass
            raise ApiError(response.status_code, code, message)
        return response

    def _json(self, method: str, path: str, payload: dict, *, timeout: float | None = None) -> dict | None:
        raw = json.dumps(payload, separators=(",", ":")).encode()
        headers = {"Content-Type": "application/json"}
        if len(raw) > 64 * 1024:
            raw = gzip.compress(raw, compresslevel=5)
            headers["Content-Encoding"] = "gzip"
        response = self._request(method, path, data=raw, headers=headers, timeout=timeout)
        return response.json() if response.content and "json" in response.headers.get("content-type", "") else None

    # live
    def heartbeat(self, payload: dict) -> dict:
        return self._json("POST", "/heartbeat", payload) or {}

    def observations(self, payload: dict) -> dict | None:
        return self._json("POST", "/observations", payload)

    def snapshot(self, camera_id: str, jpeg: bytes) -> None:
        self._request("POST", f"/cameras/{camera_id}/snapshot", data=jpeg, headers={"Content-Type": "image/jpeg"})

    def tables(self, camera_id: str, candidates: list[dict]) -> None:
        self._json("POST", f"/cameras/{camera_id}/tables", {"candidates": candidates})

    def upload_clip(self, clip_id: str, path: Path) -> None:
        with path.open("rb") as handle:
            self._request("POST", f"/clips/{clip_id}", data=handle, headers={"Content-Type": "video/mp4"}, timeout=600)

    def fail_clip(self, clip_id: str, error: str) -> None:
        self._json("POST", f"/clips/{clip_id}/fail", {"error": error[:400]})

    # uploaded files
    def claim_job(self) -> dict | None:
        return (self._json("POST", "/jobs/claim", {}) or {}).get("job")

    def download_source(self, job_id: str, target: Path) -> None:
        try:
            with self.session.get(f"{self.base_url}/api/node/jobs/{job_id}/source", stream=True, timeout=60) as response:
                if response.status_code >= 400:
                    raise ApiError(response.status_code, "SOURCE_UNAVAILABLE", response.text[:200])
                with target.open("wb") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        handle.write(chunk)
        except requests.RequestException as error:
            raise ApiError(0, "NETWORK", str(error)) from error

    def job_progress(self, job_id: str, progress: float) -> None:
        self._json("POST", f"/jobs/{job_id}/progress", {"progress": round(progress, 3)})

    def job_snapshot(self, job_id: str, jpeg: bytes) -> None:
        self._request("POST", f"/jobs/{job_id}/snapshot", data=jpeg, headers={"Content-Type": "image/jpeg"})

    def job_result(self, job_id: str, payload: dict) -> None:
        self._json("POST", f"/jobs/{job_id}/result", payload, timeout=300)

    def job_fail(self, job_id: str, error: str) -> None:
        self._json("POST", f"/jobs/{job_id}/fail", {"error": error[:400]})
