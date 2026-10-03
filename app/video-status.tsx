"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import type { Video, WorkerInfo } from "./types";

export const isPending = (video: Video) => video.status === "queued" || video.status === "processing";

const statusLabels: Record<Video["status"], string> = {
  queued: "У черзі",
  processing: "Обробляється",
  done: "Готово",
  failed: "Помилка",
};

export function StatusBadge({ video }: { video: Video }) {
  const Icon = video.status === "done" ? CheckCircle2 : video.status === "failed" ? AlertTriangle : video.status === "processing" ? Loader2 : Clock3;
  return (
    <span className={`status-badge status-${video.status}`}>
      <Icon className={video.status === "processing" ? "spin" : ""} />
      {statusLabels[video.status]}
      {video.status === "processing" && ` · ${Math.round(video.progress * 100)}%`}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

// Queued videos never move while the worker is down; say so instead of showing an eternal spinner.
export function WorkerBanner({ worker, videos }: { worker: WorkerInfo | null; videos: Video[] }) {
  if (!worker || worker.online || !videos.some(isPending)) return null;
  return (
    <div className="notice notice-warning" role="status">
      <AlertTriangle />
      <span>Жоден вузол обробки не відповідає, тому черга стоїть. Перевірте контейнер <code>camera-node</code> (<code>docker compose ps</code>) або сторінку «Вузли обробки».</span>
    </div>
  );
}
