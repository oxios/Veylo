"""Host statistics reported in the node heartbeat (admin panel)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import psutil

psutil.cpu_percent(None)  # prime the counter so the first heartbeat reports a real value


def gpu_stats() -> list[dict]:
    if not shutil.which("nvidia-smi"):
        return []
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    gpus = []
    for line in (result.stdout or "").strip().splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 5:
            continue
        name, util, used, total, temp = parts
        try:
            gpus.append({"name": name, "util": float(util), "memUsedMb": float(used), "memTotalMb": float(total), "tempC": float(temp)})
        except ValueError:
            continue
    return gpus


def host_stats(recordings_dir: Path) -> dict:
    memory = psutil.virtual_memory()
    try:
        disk = shutil.disk_usage(recordings_dir)
        disk_info = {"totalBytes": disk.total, "freeBytes": disk.free}
    except OSError:
        disk_info = {}
    return {
        "cpu": psutil.cpu_percent(None),
        "ramPercent": memory.percent,
        "ramTotalBytes": memory.total,
        "disk": disk_info,
        "gpus": gpu_stats(),
    }
