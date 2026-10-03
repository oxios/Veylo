"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Film, Loader2, LogOut, Merge, Split, UserCheck, UserRound, X } from "lucide-react";
import { apiFetch, apiUrl } from "./api-client";
import { browserPlaysHevc } from "./archive-view";
import { CameraFrame, polygonPoints } from "./camera-ui";
import { formatDuration, formatTime } from "./format";
import type { Camera, Clip, Person, StaffColor, StaffMember, StaffRole, Visit } from "./types";

// ---- vocabulary ----

export const STAFF_COLORS: Record<StaffColor, string> = {
  violet: "#7b5cf0",
  teal: "#0f9aa5",
  amber: "#c47f00",
  rose: "#d9467c",
  sky: "#2f8fd8",
  lime: "#5b9b14",
  indigo: "#4553c9",
  brown: "#9a6236",
};

export const STAFF_ROLES: Record<StaffRole, string> = {
  barista: "бариста",
  waiter: "офіціант",
  cook: "кухар",
  admin: "адміністратор",
  other: "інше",
};

export const guestName = (no: number | null | undefined) => (no ? `Гість №${no}` : "Гість");

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

// ---- day picker ----

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + delta));
  return next.toISOString().slice(0, 10);
}

export function dayLabel(day: string, today: string) {
  if (day === today) return "Сьогодні";
  if (day === shiftDay(today, -1)) return "Учора";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12)).toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long" });
}

export function DayPicker({ day, today, onChange, live }: { day: string; today: string; onChange: (day: string) => void; live: boolean }) {
  return (
    <div className="day-picker">
      <button type="button" className="icon-button soft" aria-label="Попередній день" onClick={() => onChange(shiftDay(day, -1))} disabled={day <= shiftDay(today, -60)}><ChevronLeft /></button>
      <label className="day-current">
        <CalendarDays />
        <span>{dayLabel(day, today)}</span>
        <input type="date" aria-label="Обрати день" value={day} max={today} onChange={(event) => event.target.value && onChange(event.target.value)} />
      </label>
      <button type="button" className="icon-button soft" aria-label="Наступний день" onClick={() => onChange(shiftDay(day, 1))} disabled={day >= today}><ChevronRight /></button>
      {day !== today && <button type="button" className="secondary" onClick={() => onChange(today)}>Сьогодні</button>}
      {live && <span className="live-dot" title="Дані оновлюються кожні 10 секунд"><i />наживо</span>}
    </div>
  );
}

// ---- avatar: the person's frame from the node (≤ 24 h) or their number ----

export function PersonAvatar({ person, size = "md", staff }: { person: Pick<Person, "id" | "no" | "role" | "hasShot">; size?: "sm" | "md" | "lg"; staff?: StaffMember | null }) {
  const [failed, setFailed] = useState(false);
  const color = staff ? STAFF_COLORS[staff.color] : undefined;
  if (person.hasShot && !failed) {
    return (
      <span className={`person-avatar photo ${size}`} style={color ? { borderColor: color } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset */}
        <img src={apiUrl(`/persons/${person.id}/thumb`)} alt="" loading="lazy" onError={() => setFailed(true)} />
        <b style={color ? { background: color } : undefined}>{staff ? initials(staff.name) : person.no}</b>
      </span>
    );
  }
  return (
    <span className={`person-avatar ${size}${staff ? " staff" : ""}`} style={color ? { background: color } : undefined} aria-hidden="true">
      {staff ? initials(staff.name) : person.no}
    </span>
  );
}

export function StaffAvatar({ member, size = "md" }: { member: StaffMember; size?: "sm" | "md" | "lg" }) {
  return <span className={`person-avatar staff ${size}`} style={{ background: STAFF_COLORS[member.color] }} aria-hidden="true">{initials(member.name)}</span>;
}

// ---- day timeline (one row per person, bars = time ranges) ----

export type TimelineBar = { from: number; to: number; tone: string; title: string; open?: boolean };
export type TimelineRow = { key: string; label: ReactNode; sub?: string; bars: TimelineBar[]; onOpen?: () => void; dim?: boolean };

const HOUR = 3_600_000;

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Visible time range: activity of the day ± 30 min, rounded to hours; the whole day on request. */
export function timelineRange(dayFrom: number, dayTo: number, times: number[], whole: boolean, now: number | null) {
  if (whole || !times.length) return { from: dayFrom, to: dayTo };
  const first = Math.min(...times);
  const last = Math.max(...times, now ?? 0);
  const from = Math.max(dayFrom, Math.floor((first - HOUR / 2 - dayFrom) / HOUR) * HOUR + dayFrom);
  const to = Math.min(dayTo, Math.ceil((Math.min(last, dayTo) + HOUR / 2 - dayFrom) / HOUR) * HOUR + dayFrom);
  return to - from < 3 * HOUR ? { from: Math.max(dayFrom, to - 3 * HOUR), to } : { from, to };
}

export function DayTimeline({ from, to, now, rows, gaps, spark, emptyText, legend }: {
  from: number;
  to: number;
  now: number | null;
  rows: TimelineRow[];
  gaps: { from: string; to: string }[];
  spark?: { t: number; avg: number | null }[];
  emptyText: string;
  legend?: ReactNode;
}) {
  const span = Math.max(1, to - from);
  const x = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / span) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0.25, ((Math.min(b, to) - Math.max(a, from)) / span) * 100)}%`;
  const hours: number[] = [];
  const step = span > 14 * HOUR ? 2 * HOUR : HOUR;
  for (let t = Math.ceil(from / HOUR) * HOUR; t <= to; t += step) hours.push(t);
  const sparkMax = Math.max(1, ...(spark ?? []).map((point) => point.avg ?? 0));
  const visibleGaps = gaps.map((gap) => ({ from: Date.parse(gap.from), to: Date.parse(gap.to) })).filter((gap) => gap.to > from && gap.from < to);
  const nowVisible = now !== null && now > from && now < to;
  return (
    <div className="day-timeline">
      <div className="dt-head">
        <span />
        <div className="dt-axis">
          {hours.map((t) => <span key={t} style={{ left: x(t) }}>{formatTime(new Date(t).toISOString())}</span>)}
        </div>
      </div>
      {spark && (
        <div className="dt-row dt-spark" aria-label="Людей у залі протягом дня" role="img">
          <span className="dt-label"><small>у залі</small></span>
          <div className="dt-track">
            {spark.filter((point) => point.t + 600_000 > from && point.t < to).map((point) => (
              <i key={point.t} style={{ left: x(point.t), width: width(point.t, point.t + 600_000), height: point.avg === null ? 0 : `${Math.max(4, (point.avg / sparkMax) * 100)}%` }} title={point.avg === null ? "" : `${formatTime(new Date(point.t).toISOString())} · ${point.avg} у середньому`} />
            ))}
            {visibleGaps.map((gap) => <b key={gap.from} className="dt-gap" style={{ left: x(gap.from), width: width(gap.from, gap.to) }} />)}
            {nowVisible && <em className="dt-now" style={{ left: x(now!) }} />}
          </div>
        </div>
      )}
      <div className="dt-rows">
        {rows.length === 0 && <p className="dt-empty">{emptyText}</p>}
        {rows.map((row) => (
          <div key={row.key} className={`dt-row${row.dim ? " dim" : ""}`}>
            {row.onOpen ? (
              <button type="button" className="dt-label" onClick={row.onOpen}>{row.label}{row.sub && <small>{row.sub}</small>}</button>
            ) : <span className="dt-label">{row.label}{row.sub && <small>{row.sub}</small>}</span>}
            <div className="dt-track">
              {hours.map((t) => <s key={t} style={{ left: x(t) }} />)}
              {visibleGaps.map((gap) => <b key={gap.from} className="dt-gap" style={{ left: x(gap.from), width: width(gap.from, gap.to) }} />)}
              {row.bars.filter((bar) => bar.to > from && bar.from < to).map((bar, index) => (
                <button
                  type="button"
                  key={`${bar.from}-${index}`}
                  className={`dt-bar tone-${bar.tone}${bar.open ? " open" : ""}`}
                  style={{ left: x(bar.from), width: width(bar.from, bar.to) }}
                  title={bar.title}
                  aria-label={bar.title}
                  onClick={row.onOpen}
                />
              ))}
              {nowVisible && <em className="dt-now" style={{ left: x(now!) }} />}
            </div>
          </div>
        ))}
      </div>
      {legend && <div className="dt-legend">{legend}</div>}
    </div>
  );
}

// ---- visit recording (clip cut from the node's 24 h archive) ----

export function VisitClip({ visit, camera }: { visit: Visit; camera: Camera | undefined }) {
  if (!visit.recordable) return <p className="muted small">Запис уже видалено: архів зберігається 24 години.</p>;
  const start = Date.parse(visit.startAt) - 5000;
  const end = Date.parse(visit.endAt ?? visit.lastSeenAt) + 5000;
  return <ArchiveClip camera={camera} startMs={start} endMs={end} label={end - start > 600_000 ? "Запис (перші 10 хв)" : "Запис візиту"} />;
}

/** A piece of the node's 24 h archive cut on request and played inline (≤ 10 min). */
export function ArchiveClip({ camera, startMs, endMs, label, compact = false }: { camera: Camera | undefined; startMs: number; endMs: number; label: string; compact?: boolean }) {
  const [clip, setClip] = useState<Clip | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clip || clip.status !== "pending" || !camera) return;
    const timer = window.setTimeout(() => {
      apiFetch<{ clip: Clip }>(`/cameras/${camera.id}/archive/clips/${clip.id}`)
        .then((result) => {
          setClip(result.clip);
          if (result.clip.status === "failed") setError(result.clip.error || "Не вдалося підготувати запис");
        })
        .catch(() => setError("Не вдалося перевірити запис"));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [clip, camera]);

  if (!camera) return null;

  const request = async () => {
    setBusy(true);
    setError("");
    try {
      const durationSec = Math.max(5, Math.min(600, Math.ceil((endMs - startMs) / 1000)));
      const codec = camera.status.mainCodec === "hevc" && !browserPlaysHevc() ? "h264" : "copy";
      const result = await apiFetch<{ clip: Clip }>(`/cameras/${camera.id}/archive/clips`, {
        method: "POST",
        body: JSON.stringify({ start: new Date(startMs).toISOString(), durationSec, codec }),
      });
      setClip(result.clip);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося запросити запис");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`visit-clip${compact ? " compact" : ""}`}>
      {!clip && <button type="button" className="secondary" disabled={busy} onClick={() => void request()}><Film />{busy ? "Запитуємо…" : label}</button>}
      {clip?.status === "pending" && <span className="muted small"><Loader2 className="spin" />Вузол вирізає запис…</span>}
      {clip?.status === "ready" && (
        <video key={clip.id} src={apiUrl(`/cameras/${camera.id}/archive/clips/${clip.id}/file`)} controls autoPlay muted playsInline />
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

// ---- path of a visit drawn over the camera frame ----

function VisitPath({ visit, camera }: { visit: Visit; camera: Camera | undefined }) {
  const path = visit.path ?? [];
  if (!camera || path.length < 2) return null;
  const points = path.map(([, x, y]) => ({ x, y }));
  return (
    <div className="visit-path">
      <CameraFrame camera={camera} />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Шлях гостя по залу" role="img">
        <polyline points={polygonPoints(points)} />
        <circle className="start" cx={points[0].x} cy={points[0].y} r="0.012" />
        <circle className="end" cx={points.at(-1)!.x} cy={points.at(-1)!.y} r="0.012" />
      </svg>
    </div>
  );
}

// ---- person card (drawer) ----

type PersonDetail = Person & { visits: Visit[] };

export function PersonDrawer({ personId, cameras, staff, dayPersons, onClose, onChanged }: {
  personId: string;
  cameras: Camera[];
  staff: StaffMember[];
  dayPersons?: Person[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [newStaff, setNewStaff] = useState("");

  const load = useCallback(() => {
    apiFetch<{ person: PersonDetail }>(`/persons/${personId}`)
      .then((result) => setPerson(result.person))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити картку"));
  }, [personId]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ person: Person }>(path, { method: "POST", body: JSON.stringify(body) });
      onChanged();
      if (result.person.id !== personId) onClose();
      else load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося зберегти");
    } finally {
      setBusy(false);
    }
  };

  const member = person?.staffId ? staff.find((item) => item.id === person.staffId) ?? null : null;
  const cameraOf = (visit: Visit) => cameras.find((camera) => camera.id === visit.cameraId);
  const title = member ? member.name : guestName(person?.no);
  const others = useMemo(() => (dayPersons ?? []).filter((item) => item.id !== personId).sort((a, b) => a.no - b.no), [dayPersons, personId]);

  return (
    <div className="drawerback" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="person-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        {!person ? (
          error ? <div className="notice notice-error" role="alert">{error}</div> : <p className="muted"><Loader2 className="spin" />Завантажуємо…</p>
        ) : (
          <>
            <header className="person-head">
              <PersonAvatar person={person} size="lg" staff={member} />
              <div>
                <span className="eyebrow">{member ? `ПЕРСОНАЛ · ${STAFF_ROLES[member.role].toUpperCase()}` : "ГІСТЬ ДНЯ"}</span>
                <h2 id="person-title">{title}</h2>
                <p className="muted">
                  перший раз о {formatTime(person.firstSeenAt)} · {person.visitCount} {person.visitCount === 1 ? "візит" : person.visitCount < 5 ? "візити" : "візитів"} · у залі {formatDuration(person.hallSec)}
                </p>
              </div>
            </header>
            {person.review && (
              <div className="notice notice-warning">
                <UserCheck />
                <span>{person.review.kind === "staff_candidate" ? `Довго був за стійкою (${formatDuration(person.staffSec)}). Це працівник?` : "Схожий на працівника. Хто це?"}</span>
              </div>
            )}

            <section className="drawer-section">
              <h3>Візити за день</h3>
              <ol className="visit-list">
                {person.visits.map((visit, index) => (
                  <li key={visit.id} className={visit.active ? "active" : ""}>
                    <div className="visit-line">
                      <strong>{formatTime(visit.startAt)} – {visit.active ? "зараз" : formatTime(visit.endAt)}</strong>
                      <span>{formatDuration(visit.durationSec)}</span>
                      {index > 0 && <em>{index + 1}-й візит</em>}
                    </div>
                    <p className="muted small">
                      {visit.enteredBy === "door" ? <><DoorOpen />зайшов через двері</> : <><UserRound />з’явився в залі</>}
                      {visit.tables.length > 0 && <> · сидів: {visit.tables.map((table) => `${table.label} ${formatDuration(table.sec)}`).join(", ")}</>}
                      {visit.exitedBy === "door" && <> · <LogOut />вийшов через двері</>}
                      {visit.exitedBy === "lost" && <> · зник з кадру</>}
                    </p>
                    <VisitPath visit={visit} camera={cameraOf(visit)} />
                    <div className="visit-actions">
                      <VisitClip visit={visit} camera={cameraOf(visit)} />
                      {person.visits.length > 1 && (
                        <button type="button" className="secondary" disabled={busy} onClick={() => void act(`/visits/${visit.id}/detach`, {})} title="Трекер помилково вважав двох людей однією"><Split />Це інша людина</button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="drawer-section">
              <h3>{member ? "Це не працівник?" : "Хто це?"}</h3>
              <div className="role-buttons">
                {staff.filter((item) => item.active).map((item) => (
                  <button key={item.id} type="button" className={`staff-chip${person.staffId === item.id ? " on" : ""}`} disabled={busy} onClick={() => void act(`/persons/${person.id}/role`, { staffId: item.id })}>
                    <StaffAvatar member={item} size="sm" />{item.name}
                  </button>
                ))}
                {person.role === "staff" && <button type="button" className="secondary" disabled={busy} onClick={() => void act(`/persons/${person.id}/role`, { role: "guest" })}>Це гість</button>}
                {person.role === "guest" && person.review && <button type="button" className="secondary" disabled={busy} onClick={() => void act(`/persons/${person.id}/role`, { role: "guest" })}>Це гість</button>}
              </div>
              <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (newStaff.trim()) void act(`/persons/${person.id}/role`, { newStaff: { name: newStaff.trim() } }); }}>
                <input aria-label="Ім’я нового працівника" placeholder="Новий працівник: ім’я" maxLength={60} value={newStaff} onChange={(event) => setNewStaff(event.target.value)} />
                <button type="submit" className="secondary" disabled={busy || !newStaff.trim()}><UserCheck />Додати</button>
              </form>
            </section>

            {others.length > 0 && person.role === "guest" && (
              <section className="drawer-section">
                <h3>Це та сама людина, що й…</h3>
                <div className="inline-form">
                  <select aria-label="Об’єднати з гостем" value={mergeInto} onChange={(event) => setMergeInto(event.target.value)}>
                    <option value="">оберіть номер</option>
                    {others.map((item) => <option key={item.id} value={item.id}>{guestName(item.no)} · {formatTime(item.firstSeenAt)}</option>)}
                  </select>
                  <button type="button" className="secondary" disabled={busy || !mergeInto} onClick={() => void act(`/persons/${person.id}/merge`, { intoPersonId: mergeInto })}><Merge />Об’єднати</button>
                </div>
              </section>
            )}
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <p className="footnote">Номер діє в межах дня. Обличчя не зберігаються: гостя впізнаємо за одягом і силуетом, вектор видаляється після закриття дня. Кадр людини живе на вузлі не довше за архів (24 год).</p>
          </>
        )}
      </aside>
    </div>
  );
}
