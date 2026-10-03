"use client";

import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { Flame, Footprints, Layers, Radio, RefreshCw, ScanLine, Square, UserCheck, Users, VideoOff, X } from "lucide-react";
import { ApiError, apiFetch, apiUrl } from "./api-client";
import { CameraFrame, kindMeta, MarkupOverlay, StatusPill, statusExplanation, TableLabels } from "./camera-ui";
import { paintHeat } from "./charts";
import { formatDuration, formatPercent } from "./format";
import { PersonDrawer, STAFF_COLORS, StaffAvatar, guestName, useNow } from "./people-ui";
import type { BoxLabel, Camera, LiveFrame, LiveStats, NowState, Point, StaffMember } from "./types";

type Layer = "boxes" | "trails" | "zones" | "heat";

function pointInPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---- WebRTC (WHEP through the API) ----

async function gatherIce(pc: RTCPeerConnection, timeoutMs: number) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function openWhep(cameraId: string, onTrack: (stream: MediaStream) => void) {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (event) => onTrack(event.streams[0] ?? new MediaStream([event.track]));
  await pc.setLocalDescription(await pc.createOffer());
  await gatherIce(pc, 1500);
  const response = await fetch(apiUrl(`/cameras/${cameraId}/live/whep`), {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? "",
    credentials: "include",
  });
  if (!response.ok) {
    pc.close();
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? "Не вдалося відкрити відео", response.status);
  }
  const session = response.headers.get("Location");
  await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
  return { pc, session };
}

// ---- overlay drawing ----

type Tracked = { box: number[]; target: number[]; seen: number; trail: { x: number; y: number; t: number }[]; label?: BoxLabel };

function boxText(label: BoxLabel | undefined) {
  if (!label) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - label.since) / 60_000));
  const stay = minutes >= 1 ? ` · ${minutes} хв` : "";
  if (label.role === "staff" && label.name) return `${label.name}${stay}`;
  return `${guestName(label.no)}${label.review ? " ?" : ""}${stay}`;
}

const MINT = "#3fe0a8";
const ORANGE = "#ff8a4c";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function useOverlay(canvasRef: React.RefObject<HTMLCanvasElement | null>, camera: Camera, layers: Set<Layer>) {
  const tracked = useRef(new Map<number, Tracked>());
  const outsideZone = camera.kind === "outdoor" ? camera.streetZone?.points : camera.kind === "hybrid" ? camera.doorZone?.points : undefined;
  const layersRef = useRef(layers);
  const zoneRef = useRef(outsideZone);
  useEffect(() => {
    layersRef.current = layers;
    zoneRef.current = outsideZone;
  });

  const push = (frame: LiveFrame) => {
    const now = performance.now();
    for (const [id, x1, y1, x2, y2] of frame.people) {
      const item = tracked.current.get(id);
      const foot = { x: (x1 + x2) / 2, y: y2, t: now };
      const label = frame.labels?.[String(id)];
      if (item) {
        item.target = [x1, y1, x2, y2];
        item.seen = now;
        item.trail.push(foot);
        if (label) item.label = label;
      } else {
        tracked.current.set(id, { box: [x1, y1, x2, y2], target: [x1, y1, x2, y2], seen: now, trail: [foot], label });
      }
    }
  };

  // The labelled person under a click (frame fractions), the smallest box wins.
  const hit = (x: number, y: number) => {
    let best: { label: BoxLabel; box: number[] } | null = null;
    for (const item of tracked.current.values()) {
      const [x1, y1, x2, y2] = item.box;
      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
      if (item.label && inside && (!best || (x2 - x1) * (y2 - y1) < (best.box[2] - best.box[0]) * (best.box[3] - best.box[1]))) {
        best = { label: item.label, box: item.box };
      }
    }
    return best;
  };

  useEffect(() => {
    let frameId = 0;
    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const now = performance.now();
      const showBoxes = layersRef.current.has("boxes");
      const showTrails = layersRef.current.has("trails");
      for (const [id, item] of tracked.current) {
        const age = now - item.seen;
        if (age > 900) {
          tracked.current.delete(id);
          continue;
        }
        item.box = item.box.map((value, index) => value + (item.target[index] - value) * 0.35);
        item.trail = item.trail.filter((point) => now - point.t < 3000);
        const fade = age > 300 ? 1 - (age - 300) / 600 : 1;
        const [x1, y1, x2, y2] = item.box;
        const foot = { x: (x1 + x2) / 2, y: y2 };
        const outside = zoneRef.current && zoneRef.current.length >= 3 && pointInPolygon(foot, zoneRef.current);
        const staffColor = item.label?.role === "staff" && item.label.color ? STAFF_COLORS[item.label.color] : null;
        const color = staffColor ?? (outside ? ORANGE : MINT);
        ctx.globalAlpha = Math.max(0, fade);
        if (showTrails && item.trail.length > 1) {
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          for (let index = 1; index < item.trail.length; index += 1) {
            const a = item.trail[index - 1];
            const b = item.trail[index];
            ctx.strokeStyle = color;
            ctx.globalAlpha = Math.max(0, fade) * (index / item.trail.length) * 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x * width, a.y * height);
            ctx.lineTo(b.x * width, b.y * height);
            ctx.stroke();
          }
          ctx.globalAlpha = Math.max(0, fade);
        }
        if (showBoxes) {
          const bx = x1 * width;
          const by = y1 * height;
          const bw = (x2 - x1) * width;
          const bh = (y2 - y1) * height;
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          ctx.fillStyle = staffColor ? "rgba(123,92,240,.10)" : outside ? "rgba(255,138,76,.10)" : "rgba(63,224,168,.10)";
          if (item.label?.review) ctx.setLineDash([6, 4]);
          roundRect(ctx, bx, by, bw, bh, 6);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          const label = boxText(item.label);
          if (label) {
            ctx.font = "700 12px Manrope, Arial, sans-serif";
            const labelWidth = ctx.measureText(label).width + 12;
            const ly = Math.max(0, by - 20);
            ctx.fillStyle = "rgba(10,16,13,.86)";
            roundRect(ctx, bx, ly, labelWidth, 18, 5);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.fillText(label, bx + 6, ly + 13);
          }
        }
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(foot.x * width, foot.y * height, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(10,16,13,.8)";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [canvasRef]);

  return { push, hit };
}

// Today's heatmap over the live picture (refreshed every minute while the layer is on).
function HeatLayer({ camera }: { camera: Camera }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () => apiFetch<{ stats: LiveStats }>(`/cameras/${camera.id}/stats?period=today`)
      .then((result) => {
        if (cancelled || !canvasRef.current) return;
        setEmpty(!result.stats.heatmap.cells.some((value) => value > 0));
        paintHeat(canvasRef.current, result.stats.heatmap, 0.85);
      }, () => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [camera.id]);
  return (
    <>
      <canvas ref={canvasRef} className="heat-live" aria-hidden="true" />
      {empty && <span className="heat-live-empty">Сьогодні в кадрі ще нікого не було</span>}
    </>
  );
}

// Who is under a click on the live picture: open their card or say "this is a staff member".
function BoxPopover({ label, at, staff, onClose, onOpen }: {
  label: BoxLabel;
  at: { x: number; y: number };
  staff: StaffMember[];
  onClose: () => void;
  onOpen: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const assign = async (body: unknown) => {
    setBusy(true);
    try {
      await apiFetch(`/persons/${label.p}/role`, { method: "POST", body: JSON.stringify(body) });
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося зберегти");
      setBusy(false);
    }
  };
  const now = useNow(30_000);
  const minutes = Math.max(0, Math.floor((now - label.since) / 60_000));
  return (
    <div className="box-popover" style={{ left: `${Math.min(74, at.x * 100)}%`, top: `${Math.min(64, at.y * 100)}%` }} onClick={(event) => event.stopPropagation()} role="group" aria-label="Дії з людиною в кадрі">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
      <strong>{label.role === "staff" && label.name ? label.name : guestName(label.no)}</strong>
      <small>{minutes ? `тут ${formatDuration(minutes * 60)}` : "щойно з’явився"}{label.review ? " · чекає підтвердження" : ""}</small>
      <button type="button" className="secondary" onClick={onOpen}>Відкрити картку</button>
      <span className="popover-title"><UserCheck />Це працівник?</span>
      <div className="role-buttons">
        {staff.filter((member) => member.active).map((member) => (
          <button key={member.id} type="button" className="staff-chip" disabled={busy} onClick={() => void assign({ staffId: member.id })}><StaffAvatar member={member} size="sm" />{member.name}</button>
        ))}
        {(label.role === "staff" || label.review) && <button type="button" className="secondary" disabled={busy} onClick={() => void assign({ role: "guest" })}>Це гість</button>}
      </div>
      {staff.length === 0 && <small>Додайте працівників у розділі «Персонал».</small>}
      {error && <small className="form-error" role="alert">{error}</small>}
    </div>
  );
}

// ---- component ----

export function LiveView({ camera }: { camera: Camera }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set<Layer>(["boxes", "trails", "zones"]));
  const [videoState, setVideoState] = useState<"connecting" | "playing" | "failed">("connecting");
  const [videoError, setVideoError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<NowState | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [fps, setFps] = useState<number | null>(null);
  const { push, hit } = useOverlay(canvasRef, camera, layers);
  const pushRef = useRef(push);
  const [popover, setPopover] = useState<{ label: BoxLabel; at: { x: number; y: number } } | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Detections reach the browser later than the WebRTC picture (decode + YOLO + upload), so the video is held back
  // by the measured detection lag (jitterBufferTarget) to keep boxes on the people.
  const lagRef = useRef<number | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  useEffect(() => {
    pushRef.current = push;
  });

  const online = camera.status.state === "online";

  // Detections + counters (server-sent events). Opening this stream is what keeps the camera "watched".
  useEffect(() => {
    if (!online) return;
    const source = new EventSource(apiUrl(`/cameras/${camera.id}/live/stream`), { withCredentials: true });
    const times: number[] = [];
    source.addEventListener("frame", (event) => {
      const frame = JSON.parse((event as MessageEvent).data) as LiveFrame;
      pushRef.current(frame);
      const lag = Date.now() - frame.t;
      if (lag > -2000 && lag < 5000) lagRef.current = lagRef.current === null ? lag : lagRef.current * 0.9 + lag * 0.1;
      const now = performance.now();
      times.push(now);
      while (times.length && now - times[0] > 3000) times.shift();
      setFps(times.length > 1 ? Math.round(((times.length - 1) / ((now - times[0]) / 1000)) * 10) / 10 : null);
    });
    source.addEventListener("state", (event) => setState(JSON.parse((event as MessageEvent).data) as NowState));
    return () => source.close();
  }, [camera.id, online]);

  // Video (WebRTC). Retries on failure.
  useEffect(() => {
    if (!online) return;
    let closed = false;
    let pc: RTCPeerConnection | null = null;
    let session: string | null = null;
    let retry = 0;
    const start = async () => {
      setVideoState("connecting");
      try {
        const result = await openWhep(camera.id, (stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
          }
        });
        if (closed) {
          result.pc.close();
          return;
        }
        pc = result.pc;
        pcRef.current = pc;
        session = result.session;
        pc.onconnectionstatechange = () => {
          if (!pc) return;
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            setVideoState("failed");
            setVideoError("З’єднання з відео перервалося, перепідключаємо…");
            retry = window.setTimeout(() => setAttempt((value) => value + 1), 3000);
          }
        };
      } catch (error) {
        if (closed) return;
        setVideoState("failed");
        setVideoError(error instanceof Error ? error.message : "Не вдалося відкрити відео");
        retry = window.setTimeout(() => setAttempt((value) => value + 1), 6000);
      }
    };
    void start();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      pc?.close();
      if (session) void fetch(session, { method: "DELETE", credentials: "include" }).catch(() => undefined);
    };
  }, [camera.id, online, attempt]);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      const pc = pcRef.current;
      const lag = lagRef.current;
      if (!pc || lag === null) return;
      const target = Math.round(Math.min(1500, Math.max(0, lag)));
      for (const receiver of pc.getReceivers()) {
        const tunable = receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null };
        if ("jitterBufferTarget" in tunable && Math.abs((tunable.jitterBufferTarget ?? 0) - target) > 60) tunable.jitterBufferTarget = target;
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [online]);

  const onPlayerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const found = layers.has("boxes") ? hit((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height) : null;
    if (found) apiFetch<{ staff: StaffMember[] }>(`/venues/${camera.venueId}/staff`).then((result) => setStaff(result.staff), () => undefined);
    setPopover(found ? { label: found.label, at: { x: found.box[0], y: found.box[3] } } : null);
  };

  const toggle = (layer: Layer) => setLayers((current) => {
    const next = new Set(current);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    return next;
  });

  const now = state?.now ?? null;
  const occupied = new Map<string, number | null>((now?.tables ?? []).filter((table) => table.occupied).map((table) => [table.id, table.sinceSec]));
  const markup = { entryLine: camera.entryLine, hallZone: camera.hallZone, streetZone: camera.streetZone, doorZone: camera.doorZone, staffZone: camera.staffZone, queueZone: camera.queueZone, tables: camera.tables };
  const today = state?.today;
  const conversion = today && camera.kind !== "indoor" && today.entries + today.passersby > 0 ? today.entries / (today.entries + today.passersby) : null;

  if (!online) {
    return (
      <div className="live-offline">
        <CameraFrame camera={camera} className="dimmed" onLoad={({ width, height }) => height && setAspect(width / height)} />
        <div className="live-offline-card">
          <StatusPill status={camera.status} />
          <p>{statusExplanation(camera.status)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-layout">
      <div className="live-stage">
        <div className="live-player" style={{ aspectRatio: String(aspect) }} onClick={onPlayerClick} role="presentation">
          <CameraFrame camera={camera} className="live-poster" onLoad={({ width, height }) => height && setAspect(width / height)} />
          <video ref={videoRef} muted playsInline autoPlay onPlaying={() => setVideoState("playing")} className={videoState === "playing" ? "visible" : ""} />
          {layers.has("zones") && <MarkupOverlay markup={markup} occupied={new Set(occupied.keys())} />}
          {layers.has("zones") && <TableLabels tables={camera.tables} occupied={occupied} />}
          {layers.has("heat") && <HeatLayer camera={camera} />}
          <canvas ref={canvasRef} aria-hidden="true" />
          {popover && (
            <BoxPopover
              label={popover.label}
              at={popover.at}
              staff={staff}
              onClose={() => setPopover(null)}
              onOpen={() => { setOpenPerson(popover.label.p); setPopover(null); }}
            />
          )}
          <div className="live-hud">
            <span className={`live-badge${videoState === "playing" ? " on" : ""}`}><i />{videoState === "playing" ? "НАЖИВО" : videoState === "connecting" ? "ПІДКЛЮЧЕННЯ" : "БЕЗ ВІДЕО"}</span>
            {fps !== null && <span className="hud-chip">{fps} кадр/с аналізу</span>}
          </div>
          {videoState !== "playing" && (
            <div className="live-notice">
              {videoState === "connecting" ? <RefreshCw className="spin" /> : <VideoOff />}
              <span>{videoState === "connecting" ? "Відкриваємо відео…" : videoError}</span>
            </div>
          )}
        </div>
        <div className="layer-toggles" role="group" aria-label="Шари поверх відео">
          <button type="button" className={layers.has("boxes") ? "chip on" : "chip"} aria-pressed={layers.has("boxes")} onClick={() => toggle("boxes")}><Square />Рамки</button>
          <button type="button" className={layers.has("trails") ? "chip on" : "chip"} aria-pressed={layers.has("trails")} onClick={() => toggle("trails")}><Footprints />Сліди</button>
          <button type="button" className={layers.has("zones") ? "chip on" : "chip"} aria-pressed={layers.has("zones")} onClick={() => toggle("zones")}><Layers />Розмітка</button>
          <button type="button" className={layers.has("heat") ? "chip on" : "chip"} aria-pressed={layers.has("heat")} onClick={() => toggle("heat")}><Flame />Хітмап</button>
          <span className="legend-inline"><i className="dot mint" />{camera.kind === "outdoor" ? "інші в кадрі" : "у залі"}{camera.kind !== "indoor" && <><i className="dot orange" />{camera.kind === "outdoor" ? "на тротуарі" : "у дверях / на вулиці"}</>}</span>
        </div>
      </div>

      <aside className="live-side">
        <section className="live-counter hero">
          <span><Users />{camera.kind === "outdoor" ? "Зараз у кадрі" : "Зараз у залі"}</span>
          <strong>{now ? (camera.kind === "outdoor" ? now.people : (now.inHall ?? now.people) + (now.hidden ?? 0)) : "—"}</strong>
          <small>{now ? (camera.kind === "outdoor" ? `з них на тротуарі: ${now.outside}` : camera.kind === "hybrid" ? `${now.hidden ? `з них ${now.hidden} не видно (за меблями) · ` : ""}ще ${now.outside} у дверях / на вулиці${now.elsewhere ? ` · ${now.elsewhere} поза зоною залу` : ""}` : `усього в кадрі: ${now.people}`) : "чекаємо перші дані"}</small>
        </section>
        {camera.kind !== "indoor" && (
          <section className="live-counter">
            <span><ScanLine />Сьогодні</span>
            {camera.entryLine ? (
              <div className="today-grid">
                <div><strong>{today?.entries ?? "—"}</strong><small>зайшло</small></div>
                <div><strong>{today?.passersby ?? "—"}</strong><small>пройшло повз</small></div>
                <div><strong>{conversion === null ? "—" : formatPercent(conversion)}</strong><small>конверсія</small></div>
              </div>
            ) : <p className="muted">Намалюйте лінію дверей, щоб рахувати входи.</p>}
          </section>
        )}
        {camera.kind !== "outdoor" && (
          <section className="live-counter">
            <span><Radio />Столики</span>
            {camera.tables.length === 0 ? <p className="muted">Столики ще не розмічені.</p> : (
              <ul className="table-status">
                {camera.tables.map((table) => {
                  const since = occupied.get(table.id);
                  const busy = occupied.has(table.id);
                  return (
                    <li key={table.id} className={busy ? "busy" : ""}>
                      <i />
                      <span>{table.label}</span>
                      <small>{busy ? `зайнятий${since ? ` · ${formatDuration(since)}` : ""}` : "вільний"}</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        <p className="footnote">{kindMeta[camera.kind].summary} Відео без звуку. Рамки й лічильники — з того самого потоку, що аналізує вузол «{camera.status.nodeName}». Клік по рамці гостя — його картка і «це працівник».</p>
      </aside>
      {openPerson && <PersonDrawer personId={openPerson} cameras={[camera]} staff={staff} onClose={() => setOpenPerson(null)} onChanged={() => undefined} />}
    </div>
  );
}
