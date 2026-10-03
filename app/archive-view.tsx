"use client";

import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Film, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { apiFetch, apiUrl } from "./api-client";
import { formatBytes, formatTime } from "./format";
import type { ArchiveInfo, Camera, Clip } from "./types";

const CLIP_SEC = 300;
const LEAD_SEC = 15;

export function browserPlaysHevc() {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("video");
  const types = ['video/mp4; codecs="hvc1.1.6.L93.B0"', 'video/mp4; codecs="hev1.1.6.L93.B0"'];
  return types.some((type) => probe.canPlayType(type) !== "" || (typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type)));
}

export function ArchiveView({ camera }: { camera: Camera }) {
  const [archive, setArchive] = useState<ArchiveInfo | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [playFrom, setPlayFrom] = useState<number | null>(null);
  const [clipError, setClipError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(() => {
    apiFetch<{ archive: ArchiveInfo }>(`/cameras/${camera.id}/archive`)
      .then((result) => {
        setArchive(result.archive);
        setError(result.archive.error);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити архів"));
  }, [camera.id]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Poll the clip until the node has delivered it.
  useEffect(() => {
    if (!clip || clip.status !== "pending") return;
    const timer = window.setInterval(() => {
      apiFetch<{ clip: Clip }>(`/cameras/${camera.id}/archive/clips/${clip.id}`)
        .then((result) => {
          setClip(result.clip);
          if (result.clip.status === "failed") setClipError(result.clip.error || "Не вдалося підготувати фрагмент");
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [clip, camera.id]);

  const from = archive ? Date.parse(archive.from) : 0;
  const to = archive ? Date.parse(archive.to) : 1;
  const span = Math.max(1, to - from);
  const x = (ms: number) => ((ms - from) / span) * 100;
  const segments = useMemo(() => (archive?.segments ?? []).map((segment) => {
    const start = Date.parse(segment.start);
    return { start, end: start + segment.duration * 1000 };
  }), [archive]);
  const maxPeople = Math.max(1, ...(archive?.activity ?? []).map((item) => item[1]));
  const recordedSec = segments.reduce((sum, segment) => sum + (segment.end - segment.start) / 1000, 0);

  const recordedAt = (ms: number) => segments.some((segment) => ms >= segment.start && ms < segment.end);

  const requestClip = async (requestedMs: number) => {
    let startMs = requestedMs;
    setClipError("");
    let segment = segments.find((item) => startMs >= item.start - LEAD_SEC * 1000 && startMs < item.end);
    if (!segment && segments.length) {
      // A click next to the recording snaps to its nearest edge instead of failing.
      const distance = (item: { start: number; end: number }) => Math.min(Math.abs(item.start - startMs), Math.abs(item.end - startMs));
      segment = [...segments].sort((a, b) => distance(a) - distance(b))[0];
      startMs = Math.abs(segment.start - startMs) < Math.abs(segment.end - startMs) ? segment.start : Math.max(segment.start, segment.end - CLIP_SEC * 1000);
    }
    if (!segment) {
      setClipError("Запису ще немає: вузол починає писати архів одразу після підключення камери.");
      return;
    }
    const start = Math.max(segment.start, startMs - LEAD_SEC * 1000);
    const codec = camera.status.mainCodec === "hevc" && !browserPlaysHevc() ? "h264" : "copy";
    try {
      const result = await apiFetch<{ clip: Clip }>(`/cameras/${camera.id}/archive/clips`, {
        method: "POST",
        body: JSON.stringify({ start: new Date(start).toISOString(), durationSec: CLIP_SEC, codec }),
      });
      setClip(result.clip);
      setPlayFrom(Math.max(0, (startMs - start) / 1000));
    } catch (requestError) {
      setClipError(requestError instanceof Error ? requestError.message : "Не вдалося запросити фрагмент");
    }
  };

  const pick = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    void requestClip(from + ((event.clientX - box.left) / box.width) * span);
  };

  const hoverAt = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(from + ((event.clientX - box.left) / box.width) * span);
  };

  const clipStart = clip ? Date.parse(clip.start) : null;
  const shift = (sec: number) => clipStart !== null && void requestClip(clipStart + LEAD_SEC * 1000 + sec * 1000);
  const ticks = archive ? Array.from({ length: 9 }, (_, i) => from + (span * i) / 8) : [];

  return (
    <div className="archive">
      <div className="archive-head">
        <div>
          <span className="eyebrow">ОСТАННІ 24 ГОДИНИ</span>
          <h3>Запис основного потоку</h3>
        </div>
        <div className="archive-meta">
          <span><HardDrive />{camera.status.archiveFrom ? `з ${formatTime(camera.status.archiveFrom)}` : "запис ще не почався"}</span>
          <span><Film />{recordedSec ? `${(recordedSec / 3600).toFixed(1)} год` : "—"}</span>
          <button type="button" className="icon-button soft" aria-label="Оновити шкалу" onClick={load}><RefreshCw /></button>
        </div>
      </div>
      {error && <div className="notice notice-warning" role="status">{error}</div>}

      <div className="timeline">
        <div
          className="timeline-track"
          onClick={pick}
          onMouseMove={hoverAt}
          onMouseLeave={() => setHover(null)}
          role="presentation"
        >
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            {segments.map((segment) => <rect key={segment.start} className="tl-recorded" x={x(segment.start)} y={30} width={Math.max(0.05, x(segment.end) - x(segment.start))} height={10} />)}
            {(archive?.activity ?? []).map(([t, people]) => people > 0 && <rect key={t} className="tl-activity" x={x(t)} y={28 - (people / maxPeople) * 26} width={Math.max(0.07, 6000000 / span)} height={(people / maxPeople) * 26} />)}
            {(archive?.activity ?? []).filter((item) => item[2] > 0).map(([t]) => <rect key={`e${t}`} className="tl-entry" x={x(t)} y={0} width={0.12} height={4} />)}
            {clipStart !== null && <rect className="tl-clip" x={x(clipStart)} y={0} width={(CLIP_SEC * 1000 / span) * 100} height={40} />}
          </svg>
          {hover !== null && (
            <div className="tl-hover" style={{ left: `${x(hover)}%` }}>
              <span>{formatTime(new Date(hover).toISOString())} · {recordedAt(hover) ? "є запис" : "немає запису"}</span>
            </div>
          )}
        </div>
        <div className="timeline-ticks" aria-hidden="true">
          {ticks.map((tick) => <span key={tick} style={{ left: `${x(tick)}%` }}>{formatTime(new Date(tick).toISOString())}</span>)}
        </div>
        <div className="timeline-legend">
          <span><i className="lg-recorded" />є запис</span>
          <span><i className="lg-activity" />люди в кадрі (середнє за хвилину)</span>
          {camera.kind !== "indoor" && <span><i className="lg-entry" />входи</span>}
        </div>
      </div>

      <div className="archive-player">
        {!clip && !clipError && (
          <div className="archive-empty">
            <Film />
            <strong>Клікніть по шкалі, щоб переглянути запис</strong>
            <p>Покажемо {CLIP_SEC / 60} хвилин, починаючи за {LEAD_SEC} секунд до обраного моменту. Відео без звуку.</p>
          </div>
        )}
        {clipError && <div className="notice notice-error" role="alert">{clipError}</div>}
        {clip?.status === "pending" && (
          <div className="archive-empty">
            <Loader2 className="spin" />
            <strong>Готуємо фрагмент з {formatTime(clip.start, true)}</strong>
            <p>{clip.codec === "h264" ? "Ваш браузер не відтворює HEVC, тому вузол перекодовує запис у H.264 — це може зайняти до хвилини." : "Вузол вирізає запис з архіву…"}</p>
          </div>
        )}
        {clip?.status === "ready" && (
          <>
            <video
              ref={videoRef}
              key={clip.id}
              src={apiUrl(`/cameras/${camera.id}/archive/clips/${clip.id}/file`)}
              controls
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                if (playFrom) event.currentTarget.currentTime = playFrom;
              }}
              onError={() => setClipError("Браузер не зміг відтворити фрагмент. Спробуйте Chrome або Edge.")}
            />
            <div className="archive-controls">
              <button type="button" className="secondary" onClick={() => shift(-CLIP_SEC)}><ChevronLeft />{CLIP_SEC / 60} хв раніше</button>
              <span>{formatTime(clip.start, true)} — {formatTime(new Date(Date.parse(clip.start) + clip.durationSec * 1000).toISOString(), true)}{clip.sizeBytes ? ` · ${formatBytes(clip.sizeBytes)}` : ""}</span>
              <button type="button" className="secondary" onClick={() => shift(CLIP_SEC)}>{CLIP_SEC / 60} хв пізніше<ChevronRight /></button>
              <a className="secondary" href={apiUrl(`/cameras/${camera.id}/archive/clips/${clip.id}/file`)} download={`${camera.name}-${clip.start}.mp4`}><Download />MP4</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
