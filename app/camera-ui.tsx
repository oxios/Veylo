"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CircleDot, CloudOff, DoorOpen, Loader2, PauseCircle, Server, Trees, Upload } from "lucide-react";
import { apiUrl } from "./api-client";
import type { Camera, CameraKind, CameraStatus, EntryLine, Point, Table, Zone } from "./types";

export const kindMeta: Record<CameraKind, { label: string; short: string; icon: typeof Building2; summary: string; counts: string[] }> = {
  indoor: {
    label: "Indoor · зал",
    short: "Indoor",
    icon: Building2,
    summary: "Камера дивиться в зал.",
    counts: ["Хітмап руху гостей", "Скільки людей у залі зараз і в пік", "Зайнятість столиків і час за столиком"],
  },
  outdoor: {
    label: "Outdoor · вулиця",
    short: "Outdoor",
    icon: Trees,
    summary: "Камера дивиться на вхід з вулиці.",
    counts: ["Скільки людей пройшло повз", "Скільки зайшло і вийшло", "Конверсія входу по годинах"],
  },
  hybrid: {
    label: "Hybrid · двері",
    short: "Hybrid",
    icon: DoorOpen,
    summary: "Камера всередині, у кадрі двері, крізь які видно вулицю.",
    counts: ["Зайшло через поріг", "Пройшло повз відчинені двері", "Конверсія + зал: хітмап, люди, столики"],
  },
};

const stateMeta: Record<CameraStatus["state"], { label: string; tone: "good" | "warning" | "critical" | "neutral"; icon: typeof CircleDot }> = {
  online: { label: "Наживо", tone: "good", icon: CircleDot },
  connecting: { label: "Підключення…", tone: "neutral", icon: Loader2 },
  pending: { label: "Очікує вузол", tone: "warning", icon: Server },
  node_offline: { label: "Вузол офлайн", tone: "critical", icon: CloudOff },
  error: { label: "Помилка", tone: "critical", icon: AlertTriangle },
  disabled: { label: "Вимкнена", tone: "neutral", icon: PauseCircle },
  upload: { label: "Файли", tone: "neutral", icon: Upload },
};

export function StatusPill({ status, compact = false }: { status: CameraStatus; compact?: boolean }) {
  const meta = stateMeta[status.state];
  const Icon = meta.icon;
  return (
    <span className={`state-pill tone-${meta.tone}${compact ? " compact" : ""}`} title={status.error || meta.label}>
      <Icon className={status.state === "connecting" ? "spin" : ""} />
      {meta.label}
    </span>
  );
}

export function KindChip({ kind }: { kind: CameraKind }) {
  const meta = kindMeta[kind];
  const Icon = meta.icon;
  return <span className={`kind-chip kind-${kind}`}><Icon />{meta.short}</span>;
}

export function statusExplanation(status: CameraStatus): string {
  switch (status.state) {
    case "pending": return "Немає вільного вузла обробки. Камера запуститься, щойно адміністратор підключить вузол.";
    case "node_offline": return `Вузол обробки${status.nodeName ? ` «${status.nodeName}»` : ""} не відповідає. Запис і аналітика на паузі.`;
    case "error": return status.error || "Не вдалося підключитися до камери.";
    case "connecting": return "Вузол підключається до камери. Зазвичай це займає до 30 секунд.";
    case "disabled": return "Камеру вимкнено в налаштуваннях: запис і аналітика не ведуться.";
    default: return "";
  }
}

// Latest frame of a camera; live cameras refresh it periodically (the node uploads a new one every few minutes).
export function useSnapshotUrl(camera: Camera, refreshMs = 0) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!refreshMs) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);
  const version = camera.snapshotAt ?? "none";
  return apiUrl(`/cameras/${camera.id}/snapshot?v=${encodeURIComponent(version)}&t=${tick}`);
}

export function CameraFrame({ camera, refreshMs = 0, className = "", children, onLoad }: {
  camera: Camera;
  refreshMs?: number;
  className?: string;
  children?: React.ReactNode;
  onLoad?: (size: { width: number; height: number }) => void;
}) {
  const url = useSnapshotUrl(camera, refreshMs);
  const [failedUrl, setFailedUrl] = useState("");
  // Live cameras without a frame yet (and failed loads) show a placeholder instead of a broken image.
  const failed = failedUrl === url || (camera.source === "rtsp" && !camera.snapshotAt);
  return (
    <div className={`frame-view ${className}`}>
      {failed ? (
        <div className="frame-placeholder"><CircleDot /><span>Кадру ще немає</span></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset
        <img
          src={url}
          alt={`Кадр камери ${camera.name}`}
          draggable={false}
          onError={() => setFailedUrl(url)}
          onLoad={(event) => onLoad?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        />
      )}
      {children}
    </div>
  );
}

// ---- markup geometry shared by the editor, live view and heatmap ----

export function insideArrow(line: EntryLine, length = 0.07) {
  const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const norm = Math.hypot(dx, dy) || 1;
  const sign = line.inside === "positive" ? 1 : -1;
  return { mid, tip: { x: mid.x + (-dy / norm) * length * sign, y: mid.y + (dx / norm) * length * sign } };
}

export const polygonPoints = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(" ");

export function centroid(points: Point[]): Point {
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
}

export type MarkupLayers = {
  entryLine: EntryLine | null;
  hallZone: Zone | null;
  streetZone: Zone | null;
  doorZone: Zone | null;
  staffZone?: Zone | null;
  queueZone?: Zone | null;
  tables: Table[];
};

// Read-only markup drawn over a frame (viewBox 0..1). Table fill reflects live occupancy when given.
export function MarkupOverlay({ markup, occupied }: { markup: MarkupLayers; occupied?: Set<string> }) {
  const arrow = markup.entryLine ? insideArrow(markup.entryLine) : null;
  return (
    <svg className="markup-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {markup.hallZone && <polygon className="zone-shape zone-hall" points={polygonPoints(markup.hallZone.points)} />}
      {markup.streetZone && <polygon className="zone-shape zone-street" points={polygonPoints(markup.streetZone.points)} />}
      {markup.doorZone && <polygon className="zone-shape zone-door" points={polygonPoints(markup.doorZone.points)} />}
      {markup.staffZone && <polygon className="zone-shape zone-staff" points={polygonPoints(markup.staffZone.points)} />}
      {markup.queueZone && <polygon className="zone-shape zone-queue" points={polygonPoints(markup.queueZone.points)} />}
      {markup.tables.map((table) => (
        <polygon key={table.id} className={`table-shape${occupied?.has(table.id) ? " occupied" : ""}`} points={polygonPoints(table.points)} />
      ))}
      {markup.entryLine && <line className="entry-line" x1={markup.entryLine.a.x} y1={markup.entryLine.a.y} x2={markup.entryLine.b.x} y2={markup.entryLine.b.y} />}
      {arrow && <line className="entry-arrow" x1={arrow.mid.x} y1={arrow.mid.y} x2={arrow.tip.x} y2={arrow.tip.y} />}
    </svg>
  );
}

export function TableLabels({ tables, occupied }: { tables: Table[]; occupied?: Map<string, number | null> }) {
  return (
    <>
      {tables.map((table) => {
        const c = centroid(table.points);
        const since = occupied?.get(table.id);
        const busy = occupied?.has(table.id);
        return (
          <em key={table.id} className={`table-label${busy ? " occupied" : ""}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
            {table.label}{busy && since !== null && since !== undefined ? ` · ${Math.max(1, Math.round(since / 60))} хв` : ""}
          </em>
        );
      })}
    </>
  );
}
