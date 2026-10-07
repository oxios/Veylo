"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, Clock3, Coffee, Info, LogOut, Pencil, Plus, Timer, UserCheck, UserPlus, Users, X } from "lucide-react";
import { apiFetch } from "./api-client";
import { BarChart } from "./charts";
import { formatDuration, formatTime } from "./format";
import { DayPicker, DayTimeline, PersonAvatar, PersonDrawer, STAFF_COLORS, STAFF_ROLES, StaffAvatar, guestName, roleOutcome, timelineRange, useNow, type TimelineRow } from "./people-ui";
import type { PageContext, Person, RoleResult, StaffColor, StaffDay, StaffMember, StaffRole, StaffShift } from "./types";

const PLACE: Record<StaffShift["state"], string> = {
  counter: "за стійкою",
  hall: "у залі",
  frame: "у кадрі",
  away: "поза кадром",
  off: "не на зміні",
};

const isoOf = (sec: number) => new Date(sec * 1000).toISOString();

// ---- add / edit staff member ----

function StaffModal({ venueId, member, onClose, onSaved }: { venueId: string; member: StaffMember | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<StaffRole>(member?.role ?? "barista");
  const [color, setColor] = useState<StaffColor>(member?.color ?? "violet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ name: name.trim(), role, color });
      if (member) await apiFetch(`/staff/${member.id}`, { method: "PATCH", body });
      else await apiFetch(`/venues/${venueId}/staff`, { method: "POST", body });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося зберегти");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!member) return;
    setBusy(true);
    try {
      await apiFetch(`/staff/${member.id}`, { method: "PATCH", body: JSON.stringify({ active: !member.active }) });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося зберегти");
      setBusy(false);
    }
  };

  return (
    <div className="modalback" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        <span className="eyebrow">{member ? "ПРАЦІВНИК" : "НОВИЙ ПРАЦІВНИК"}</span>
        <h2 id="staff-modal-title">{member ? member.name : "Додати працівника"}</h2>
        <label className="field">Ім’я<input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Оля" /></label>
        <label className="field">Роль
          <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>
            {(Object.keys(STAFF_ROLES) as StaffRole[]).map((key) => <option key={key} value={key}>{STAFF_ROLES[key]}</option>)}
          </select>
        </label>
        <fieldset className="color-field">
          <legend>Колір на рамках і стрічці</legend>
          {(Object.keys(STAFF_COLORS) as StaffColor[]).map((key) => (
            <button key={key} type="button" className={color === key ? "swatch-button on" : "swatch-button"} style={{ background: STAFF_COLORS[key] }} aria-label={key} aria-pressed={color === key} onClick={() => setColor(key)} />
          ))}
        </fieldset>
        <p className="footnote">Без фото: працівника система впізнає за одягом протягом зміни. Уранці достатньо один раз підтвердити його на плашці «Оберіть працівника».</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          {member && <button type="button" className="secondary" disabled={busy} onClick={() => void archive()}><Archive />{member.active ? "В архів" : "Повернути"}</button>}
          <button type="button" className="secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? "Зберігаємо…" : "Зберегти"}</button>
        </div>
      </form>
    </div>
  );
}

// ---- confirmation queue ----

function ReviewCard({ person, staff, onDone, onOpen }: { person: Person; staff: StaffMember[]; onDone: (note: string) => void; onOpen: () => void }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const suggested = person.review?.suggestedStaffId;
  const assign = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      onDone(roleOutcome(await apiFetch<RoleResult>(`/persons/${person.id}/role`, { method: "POST", body: JSON.stringify(body) })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося зберегти");
      setBusy(false);
    }
  };
  const active = staff.filter((member) => member.active).sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : 0));
  return (
    <article className="review-card">
      <button type="button" className="avatar-button" onClick={onOpen} aria-label={`Відкрити картку: ${guestName(person.no)}`} title="Візити й запис"><PersonAvatar person={person} size="lg" /></button>
      <div className="review-body">
        <strong>{guestName(person.no)} · з {formatTime(person.firstSeenAt)}</strong>
        <p className="muted small">
          {person.review?.kind === "staff_candidate" ? `за стійкою ${formatDuration(person.staffSec)}` : "схожий на працівника"}
          {person.cameraName ? ` · ${person.cameraName}` : ""}
        </p>
        <div className="role-buttons">
          {active.map((member, index) => (
            <button key={member.id} type="button" className={`staff-chip${member.id === suggested ? " suggested" : ""}`} disabled={busy} onClick={() => void assign({ staffId: member.id })} title={index < 9 ? `Клавіша ${index + 1}` : undefined}>
              <StaffAvatar member={member} size="sm" />{member.name}
            </button>
          ))}
          <button type="button" className="secondary" disabled={busy} onClick={() => void assign({ role: "guest" })}>Це гість</button>
        </div>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void assign({ newStaff: { name: name.trim() } }); }}>
          <input aria-label={`Ім’я нового працівника для ${guestName(person.no)}`} placeholder="Новий працівник: ім’я" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit" className="secondary" disabled={busy || !name.trim()}><UserPlus />Додати</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

// ---- staff card (drawer) ----

function StaffDrawer({ entry, onClose, onEdit }: { entry: StaffDay["shifts"][number]; onClose: () => void; onEdit: () => void }) {
  const [history, setHistory] = useState<{ day: string; onSiteSec: number | null; visits: number }[] | null>(null);
  const { staff: member, shift } = entry;
  useEffect(() => {
    apiFetch<{ history: { day: string; onSiteSec: number | null; visits: number }[] }>(`/staff/${member.id}/history`)
      .then((result) => setHistory(result.history))
      .catch(() => setHistory([]));
  }, [member.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="drawerback" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="staff-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        <header className="person-head">
          <StaffAvatar member={member} size="lg" />
          <div>
            <span className="eyebrow">ПЕРСОНАЛ · {STAFF_ROLES[member.role].toUpperCase()}</span>
            <h2 id="staff-title">{member.name}</h2>
            <p className="muted">{shift ? `на зміні з ${formatTime(isoOf(shift.firstSeenAt))} · ${PLACE[shift.state]}` : "цього дня не бачили"}</p>
          </div>
          <button type="button" className="icon-button soft" aria-label="Редагувати працівника" onClick={onEdit}><Pencil /></button>
        </header>
        {shift && (
          <>
            <div className="mini-stats">
              <div><strong>{formatDuration(shift.onSiteSec)}</strong><small>у кадрі</small></div>
              <div><strong>{formatDuration(shift.counterSec)}</strong><small>за стійкою</small></div>
              <div><strong>{formatDuration(shift.hallSec)}</strong><small>у залі</small></div>
              <div><strong>{shift.exits}</strong><small>виходив</small></div>
            </div>
            <section className="drawer-section">
              <h3>Журнал виходів</h3>
              {shift.absences.length === 0 ? <p className="muted small">Не зникав з кадру довше ніж на хвилину.</p> : (
                <ol className="absence-log">
                  {shift.absences.map((absence) => (
                    <li key={absence.from}><LogOut /><span>вийшов {formatTime(isoOf(absence.from))} → повернувся {formatTime(isoOf(absence.to))}</span><b>{formatDuration(absence.sec)}</b></li>
                  ))}
                  {shift.state === "away" && <li className="open"><LogOut /><span>поза кадром з {formatTime(isoOf(shift.stateSince))}</span><b>зараз</b></li>}
                </ol>
              )}
            </section>
          </>
        )}
        {history && history.length > 0 && (
          <BarChart
            eyebrow="7 ДНІВ"
            title="Час на зміні"
            labels={history.map((item) => item.day.slice(5).split("-").reverse().join("."))}
            unit="год"
            series={[{ key: "hours", label: "Годин", tone: "s3", values: history.map((item) => (item.onSiteSec === null ? null : Math.round((item.onSiteSec / 3600) * 10) / 10)) }]}
            note="Від першої до останньої появи в кадрі за день."
          />
        )}
        <p className="footnote">«Поза кадром» — працівника не видно камерою (кухня, склад, вулиця). Це не обов’язково відсутність на роботі.</p>
      </aside>
    </div>
  );
}

// ---- page ----

export function StaffPage({ venue, cameras, go }: PageContext) {
  const [day, setDay] = useState("");
  const [data, setData] = useState<StaffDay | null>(null);
  const [directory, setDirectory] = useState<StaffMember[]>([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<StaffMember | "new" | null>(null);
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [whole, setWhole] = useState(false);
  const [roleNote, setRoleNote] = useState("");
  const now = useNow(15_000);

  const load = useCallback(() => {
    if (!venue) return;
    const query = day ? `?day=${day}` : "";
    Promise.all([
      apiFetch<{ staffDay: StaffDay }>(`/venues/${venue.id}/staff-day${query}`),
      apiFetch<{ staff: StaffMember[] }>(`/venues/${venue.id}/staff`),
    ])
      .then(([result, list]) => {
        setData(result.staffDay);
        setDirectory(list.staff);
        setError("");
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити персонал"));
  }, [venue, day]);

  useEffect(() => {
    load();
  }, [load]);

  const roleDone = useCallback((note: string) => {
    setRoleNote(note);
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.live) return;
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [data?.live, load]);

  // Keys 1–9 confirm the first waiting person as that staff member, G — as a guest.
  const firstReview = data?.reviews[0];
  const activeStaff = useMemo(() => directory.filter((member) => member.active), [directory]);
  useEffect(() => {
    if (!firstReview || modal || openStaff || openPerson) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const index = Number(event.key) - 1;
      const body = event.key.toLowerCase() === "g" ? { role: "guest" } : index >= 0 && index < Math.min(9, activeStaff.length) ? { staffId: activeStaff[index].id } : null;
      if (!body) return;
      void apiFetch<RoleResult>(`/persons/${firstReview.id}/role`, { method: "POST", body: JSON.stringify(body) }).then((result) => roleDone(roleOutcome(result)), () => undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [firstReview, activeStaff, modal, openStaff, openPerson, roleDone]);

  if (!venue) return <section className="card panel empty"><h2>Спочатку створіть заклад</h2></section>;
  if (!data) return error ? <div className="notice notice-error" role="alert">{error}</div> : <section className="card panel"><p className="muted">Завантажуємо персонал…</p></section>;

  const dayFrom = Date.parse(data.from);
  const dayTo = Date.parse(data.to);
  const nowMs = data.live ? now : null;
  const onShift = data.shifts.filter((entry) => entry.shift);
  const times = onShift.flatMap((entry) => [entry.shift!.firstSeenAt * 1000, entry.shift!.lastSeenAt * 1000]);
  const range = timelineRange(dayFrom, dayTo, times, whole, nowMs);
  const rows: TimelineRow[] = data.shifts.filter((entry) => entry.staff.active || entry.shift).map((entry) => ({
    key: entry.staff.id,
    label: <><StaffAvatar member={entry.staff} size="sm" />{entry.staff.name}</>,
    sub: entry.shift ? `${formatDuration(entry.shift.onSiteSec)}` : "не було",
    dim: !entry.shift,
    onOpen: () => setOpenStaff(entry.staff.id),
    bars: [
      ...(entry.shift?.segments ?? []).map((segment) => ({
        from: segment.from * 1000,
        to: segment.to * 1000,
        tone: segment.where,
        title: `${entry.staff.name} · ${PLACE[segment.where]} · ${formatTime(isoOf(segment.from))}–${formatTime(isoOf(segment.to))}`,
      })),
      ...(entry.shift?.absences ?? []).map((absence) => ({
        from: absence.from * 1000,
        to: absence.to * 1000,
        tone: "away",
        title: `${entry.staff.name} · поза кадром ${formatDuration(absence.sec)}`,
      })),
    ],
  }));
  const opened = data.shifts.find((entry) => entry.staff.id === openStaff);
  const waiting = data.waiting;
  const guestCameras = cameras.filter((camera) => camera.source === "rtsp" && camera.kind !== "outdoor");

  return (
    <div className="people-page">
      <div className="page-toolbar">
        <DayPicker day={data.day} today={data.today} onChange={(next) => { setDay(next); setOpenStaff(null); }} live={data.live} />
        <button type="button" className="primary" onClick={() => setModal("new")}><Plus />Додати працівника</button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {roleNote && (
        <div className="notice notice-warning" role="status"><Info /><span>{roleNote}</span><button type="button" className="secondary" onClick={() => setRoleNote("")}>Зрозуміло</button></div>
      )}
      {!data.zones.staff && guestCameras.length > 0 && (
        <div className="notice notice-warning"><Info /><span>Позначте зону персоналу (за стійкою): так система сама помітить, хто працює, і порахує час за стійкою.</span><button type="button" className="secondary" onClick={() => go("cameras")}>Розмітити</button></div>
      )}

      {data.reviews.length > 0 && (
        <section className="card panel review-queue">
          <div className="panel-head">
            <div>
              <span className="eyebrow">ОБЕРІТЬ ПРАЦІВНИКА</span>
              <h2>{data.reviews.length} {data.reviews.length === 1 ? "людина чекає" : "людей чекають"} підтвердження</h2>
            </div>
            <span className="muted small">Клавіші 1–9 — працівник, G — гість</span>
          </div>
          {activeStaff.length === 0 && <p className="muted">Додайте працівників або впишіть ім’я нового прямо в картці.</p>}
          <div className="review-list">
            {data.reviews.map((person) => <ReviewCard key={person.id} person={person} staff={directory} onDone={roleDone} onOpen={() => setOpenPerson(person.id)} />)}
          </div>
        </section>
      )}

      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">{data.live ? "ЗАРАЗ НА ЗМІНІ" : "ЗМІНА"}</span>
            <h2>{directory.length === 0 ? "Персоналу ще немає" : onShift.length ? `${onShift.length} з ${data.shifts.filter((entry) => entry.staff.active).length} працівників` : "Нікого з персоналу не бачили"}</h2>
          </div>
        </div>
        {directory.length === 0 ? (
          <div className="empty-inline">
            <Users />
            <p>Персоналу ще немає. Додайте працівників — далі система сама впізнаватиме їх за зміну.</p>
            <button type="button" className="primary" onClick={() => setModal("new")}><Plus />Додати першого працівника</button>
          </div>
        ) : (
          <div className="staff-grid">
            {data.shifts.filter((entry) => entry.staff.active || entry.shift).map((entry) => {
              const shift = entry.shift;
              const state = shift?.state ?? "off";
              return (
                <button key={entry.staff.id} type="button" className={`staff-card state-${state}`} onClick={() => setOpenStaff(entry.staff.id)}>
                  <StaffAvatar member={entry.staff} />
                  <span className="staff-name"><strong>{entry.staff.name}</strong><small>{STAFF_ROLES[entry.staff.role]}</small></span>
                  <span className={`staff-state s-${state}`}><i />{PLACE[state]}{shift && state !== "off" ? ` · з ${formatTime(isoOf(shift.stateSince))}` : ""}</span>
                  {shift ? (
                    <span className="staff-facts">
                      <span><Clock3 />з {formatTime(isoOf(shift.firstSeenAt))} · {formatDuration(shift.onSiteSec)}</span>
                      <span><Coffee />за стійкою {formatDuration(shift.counterSec)}</span>
                      <span><LogOut />виходив {shift.exits}×{shift.longestAbsenceSec ? ` · найдовше ${formatDuration(shift.longestAbsenceSec)}` : ""}</span>
                    </span>
                  ) : <span className="staff-facts muted">цього дня не бачили</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className="card panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">СТРІЧКА ЗМІНИ</span>
              <h2>Де був персонал</h2>
            </div>
            <div className="segmented" role="group" aria-label="Масштаб стрічки">
              <button type="button" className={!whole ? "on" : ""} aria-pressed={!whole} onClick={() => setWhole(false)}>Зміна</button>
              <button type="button" className={whole ? "on" : ""} aria-pressed={whole} onClick={() => setWhole(true)}>Уся доба</button>
            </div>
          </div>
          <DayTimeline
            from={range.from}
            to={range.to}
            now={nowMs}
            rows={rows}
            gaps={[]}
            emptyText="Немає працівників."
            legend={<><i className="lg counter" />за стійкою<i className="lg hall" />у залі<i className="lg frame" />інше місце в кадрі<i className="lg away" />поза кадром</>}
          />
        </section>
      )}

      <section className={`card panel${waiting ? "" : " blocked-panel"}`}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">СТІЙКА БЕЗ ПЕРСОНАЛУ</span>
            <h2>{waiting ? (waiting.episodes.length ? `Гості чекали ${waiting.episodes.length} ${waiting.episodes.length === 1 ? "раз" : "рази"}, разом ${formatDuration(waiting.totalSec)}` : "Гості не чекали біля порожньої стійки") : "Потрібні зони «персонал» і «черга»"}</h2>
          </div>
          <Timer className="panel-icon" />
        </div>
        {!waiting ? (
          <>
            <p className="muted">Позначте на кадрі зону за стійкою (персонал) і місце перед нею, де гості чекають замовлення (черга). Тоді порахуємо хвилини, коли гість стояв, а за стійкою нікого не було.</p>
            <button type="button" className="secondary" onClick={() => go("cameras")}>Розмітити<ArrowRight /></button>
          </>
        ) : waiting.episodes.length > 0 && (
          <ol className="wait-list">
            {waiting.episodes.slice(-12).reverse().map((episode) => (
              <li key={episode.from}><span>{formatTime(isoOf(episode.from))} – {formatTime(isoOf(episode.to))}</span><b>{formatDuration(episode.sec)}</b></li>
            ))}
          </ol>
        )}
      </section>

      {directory.some((member) => !member.active) && (
        <section className="card panel">
          <span className="eyebrow">АРХІВ</span>
          <div className="role-buttons">
            {directory.filter((member) => !member.active).map((member) => (
              <button key={member.id} type="button" className="staff-chip" onClick={() => setModal(member)}><StaffAvatar member={member} size="sm" />{member.name}</button>
            ))}
          </div>
        </section>
      )}

      {modal && <StaffModal venueId={venue.id} member={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={load} />}
      {opened && !modal && (
        <StaffDrawer entry={opened} onClose={() => setOpenStaff(null)} onEdit={() => setModal(opened.staff)} />
      )}
      {openPerson && (
        <PersonDrawer personId={openPerson} cameras={guestCameras} staff={directory} onClose={() => setOpenPerson(null)} onChanged={load} />
      )}
      <p className="footnote with-icon"><UserCheck />Персонал впізнаємо за одягом протягом зміни, без облич і фото. Наступного дня підтвердіть працівника один раз — плашка з’явиться, щойно хтось простоїть за стійкою хвилину.</p>
    </div>
  );
}
