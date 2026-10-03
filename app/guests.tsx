"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, DoorOpen, Info, Repeat2, Search, Footprints, UserCheck, Users } from "lucide-react";
import { apiFetch } from "./api-client";
import { formatDuration, formatPercent, formatTime } from "./format";
import { DayPicker, DayTimeline, PersonAvatar, PersonDrawer, guestName, timelineRange, useNow, type TimelineRow } from "./people-ui";
import type { GuestsDay, PageContext, StaffMember, Visit } from "./types";

type Filter = "all" | "now" | "returning" | "table" | "short";

const FILTERS: [Filter, string][] = [
  ["all", "Усі"],
  ["now", "Зараз у залі"],
  ["returning", "Повернулись"],
  ["table", "За столиком"],
  ["short", "Зазирнули"],
];

const SHORT_SEC = 60;

function GuestKpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Users; label: string; value: string; sub?: string; tone?: "accent" }) {
  return (
    <section className={`card kpi${tone === "accent" ? " accent" : ""}`}>
      <span><Icon />{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </section>
  );
}

function visitTone(visit: Visit) {
  if (visit.durationSec < SHORT_SEC && !visit.active) return "short";
  return visit.tables.length ? "table" : "hall";
}

export function GuestsPage({ venue, cameras, go }: PageContext) {
  const [day, setDay] = useState("");
  const [data, setData] = useState<GuestsDay | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [whole, setWhole] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow(15_000);

  const load = useCallback(() => {
    if (!venue) return;
    const query = day ? `?day=${day}` : "";
    Promise.all([
      apiFetch<{ guests: GuestsDay }>(`/venues/${venue.id}/guests${query}`),
      apiFetch<{ staff: StaffMember[] }>(`/venues/${venue.id}/staff`),
    ])
      .then(([guests, directory]) => {
        setData(guests.guests);
        setStaff(directory.staff);
        setError("");
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити гостей"));
  }, [venue, day]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.live) return;
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [data?.live, load]);

  const visitsByPerson = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const visit of data?.visits ?? []) {
      if (!map.has(visit.personId)) map.set(visit.personId, []);
      map.get(visit.personId)!.push(visit);
    }
    return map;
  }, [data]);

  if (!venue) return <section className="card panel empty"><h2>Спочатку створіть заклад</h2></section>;
  if (!data) return error ? <div className="notice notice-error" role="alert">{error}</div> : <section className="card panel"><p className="muted">Завантажуємо гостей…</p></section>;

  const k = data.kpis;
  const dayFrom = Date.parse(data.from);
  const dayTo = Date.parse(data.to);
  const nowMs = data.live ? now : null;

  if (data.cameras.length === 0) {
    return (
      <section className="card panel empty">
        <span className="eyebrow">ГОСТІ</span>
        <h2>Потрібна жива камера в залі або на вході</h2>
        <p className="muted">Гостей нумеруємо за треками з камери «всередині» або «гібрид». Підключіть RTSP-камеру і розмітьте поріг і залу.</p>
        <button type="button" className="primary" onClick={() => go("cameras")}>До камер<ArrowRight /></button>
      </section>
    );
  }
  const unmarked = data.cameras.filter((camera) => !camera.entryLine && !camera.hallZone);

  // Journal rows: one per visit, newest first.
  const query = search.trim().replace(/^№/, "");
  const visits = data.visits
    .filter((visit) => {
      const count = visitsByPerson.get(visit.personId)?.length ?? 0;
      if (filter === "now" && !visit.active) return false;
      if (filter === "returning" && count < 2) return false;
      if (filter === "table" && !visit.tables.length) return false;
      if (filter === "short" && (visit.active || visit.durationSec >= SHORT_SEC)) return false;
      return !query || String(visit.no) === query;
    })
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

  // Timeline: one row per guest, ordered by first appearance.
  const persons = [...data.persons].sort((a, b) => a.no - b.no);
  const range = timelineRange(dayFrom, dayTo, data.visits.flatMap((visit) => [Date.parse(visit.startAt), Date.parse(visit.endAt ?? visit.lastSeenAt)]), whole, nowMs);
  const rows: TimelineRow[] = persons.map((person) => {
    const own = visitsByPerson.get(person.id) ?? [];
    return {
      key: person.id,
      label: <><PersonAvatar person={person} size="sm" />{guestName(person.no)}</>,
      sub: own.length > 1 ? `${own.length} візити` : undefined,
      dim: !!person.review,
      onOpen: () => setOpen(person.id),
      bars: own.map((visit) => ({
        from: Date.parse(visit.startAt),
        to: visit.active ? (nowMs ?? Date.parse(visit.lastSeenAt)) : Date.parse(visit.endAt ?? visit.lastSeenAt),
        tone: visitTone(visit),
        open: visit.active,
        title: `${guestName(person.no)} · ${formatTime(visit.startAt)}–${visit.active ? "зараз" : formatTime(visit.endAt)} · ${formatDuration(visit.durationSec)}${visit.tables.length ? ` · ${visit.tables[0].label}` : ""}`,
      })),
    };
  });

  const lastWeek = k.lastWeekGuests !== null ? k.guests - k.lastWeekGuests : null;
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));

  return (
    <div className="people-page">
      <div className="page-toolbar">
        <DayPicker day={data.day} today={data.today} onChange={(next) => { setDay(next); setOpen(null); }} live={data.live} />
        {k.reviews > 0 && (
          <button type="button" className="review-badge" onClick={() => go("staff")}><UserCheck />{k.reviews} {k.reviews === 1 ? "людина чекає" : "людей чекають"} підтвердження</button>
        )}
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {unmarked.length > 0 && (
        <div className="notice notice-warning"><Info /><span>Камера «{unmarked[0].name}» без порогу і зони залу: гостей рахуємо лише після 30 с у кадрі.</span><button type="button" className="secondary" onClick={() => go("cameras")}>Розмітити</button></div>
      )}

      <div className="kpis five">
        <GuestKpi icon={Users} label="Гостей" value={String(k.guests)} sub={lastWeek === null ? "унікальних за день" : `${lastWeek >= 0 ? "+" : ""}${lastWeek} до того ж дня тижня тому`} tone="accent" />
        <GuestKpi icon={DoorOpen} label="Візитів" value={String(k.visits)} sub={k.activeVisits ? `${k.activeVisits} зараз триває` : "разом із поверненнями"} />
        <GuestKpi icon={Repeat2} label="Повернулись" value={String(k.returning)} sub="2 і більше візитів за день" />
        <GuestKpi icon={Clock3} label="Середній візит" value={formatDuration(k.avgVisitSec)} sub={k.medianVisitSec !== null ? `медіана ${formatDuration(k.medianVisitSec)}` : "ще немає завершених"} />
        <GuestKpi icon={Users} label={data.live ? "Зараз у залі" : "Пройшло повз"} value={data.live ? String(k.inHallNow ?? "—") : String(k.passersby ?? "—")} sub={data.live ? (k.passersby !== null ? `повз пройшло ${k.passersby} · конверсія ${formatPercent(k.conversion)}` : undefined) : k.conversion !== null ? `конверсія ${formatPercent(k.conversion)}` : undefined} />
      </div>

      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">СТРІЧКА ДНЯ</span>
            <h2>Хто і коли був у закладі</h2>
          </div>
          <div className="segmented" role="group" aria-label="Масштаб стрічки">
            <button type="button" className={!whole ? "on" : ""} aria-pressed={!whole} onClick={() => setWhole(false)}>Години роботи</button>
            <button type="button" className={whole ? "on" : ""} aria-pressed={whole} onClick={() => setWhole(true)}>Уся доба</button>
          </div>
        </div>
        <DayTimeline
          from={range.from}
          to={range.to}
          now={nowMs}
          rows={rows}
          gaps={data.gaps}
          spark={data.occupancy}
          emptyText={data.live ? "Сьогодні гостей ще не було. Щойно хтось зайде, тут з’явиться рядок." : "Цього дня гостей не зафіксовано."}
          legend={<><i className="lg hall" />у залі<i className="lg table" />за столиком<i className="lg short" />зазирнув (&lt; 1 хв)<i className="lg gap" />камера не аналізувала</>}
        />
      </section>

      <section className="card panel">
        <div className="panel-head wrap">
          <div>
            <span className="eyebrow">ЖУРНАЛ ВІЗИТІВ</span>
            <h2>{visits.length} {visits.length === 1 ? "візит" : visits.length < 5 && visits.length > 0 ? "візити" : "візитів"}</h2>
          </div>
          <div className="journal-tools">
            <div className="chips" role="group" aria-label="Фільтр візитів">
              {FILTERS.map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? "chip on" : "chip"} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
              ))}
            </div>
            <label className="search-field"><Search /><input aria-label="Пошук за номером гостя" placeholder="№" inputMode="numeric" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
        </div>
        {visits.length === 0 ? <p className="muted">Немає візитів за цим фільтром.</p> : (
          <div className="journal">
            <table>
              <thead>
                <tr>
                  <th scope="col">Гість</th>
                  <th scope="col">Вхід</th>
                  <th scope="col">Вихід</th>
                  <th scope="col">Тривалість</th>
                  <th scope="col">Де сидів</th>
                  <th scope="col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => {
                  const person = data.persons.find((item) => item.id === visit.personId);
                  const count = visitsByPerson.get(visit.personId)?.length ?? 1;
                  const index = (visitsByPerson.get(visit.personId) ?? []).findIndex((item) => item.id === visit.id);
                  const maxSec = Math.max(1, ...data.visits.map((item) => item.durationSec));
                  return (
                    <tr key={visit.id} onClick={() => setOpen(visit.personId)} className={visit.active ? "active" : ""}>
                      <td>
                        <button type="button" className="person-link" onClick={(event) => { event.stopPropagation(); setOpen(visit.personId); }}>
                          {person && <PersonAvatar person={person} size="sm" />}
                          <span>{guestName(visit.no)}</span>
                        </button>
                      </td>
                      <td className="num">{formatTime(visit.startAt)}{visit.enteredBy === "door" && <DoorOpen className="inline-icon" aria-label="через двері" />}</td>
                      <td className="num">{visit.active ? "—" : formatTime(visit.endAt)}</td>
                      <td className="num"><span className="dur">{formatDuration(visit.durationSec)}<i style={{ width: `${Math.max(4, (visit.durationSec / maxSec) * 100)}%` }} /></span></td>
                      <td>{visit.tables.length ? visit.tables.slice(0, 2).map((table) => <span key={table.id} className="table-chip">{table.label} · {formatDuration(table.sec)}</span>) : <span className="muted small">—</span>}</td>
                      <td>
                        {visit.active ? <span className="state-pill compact tone-good"><Footprints />у залі</span>
                          : count > 1 ? <span className="state-pill compact">{index + 1}-й візит</span>
                            : visit.durationSec < SHORT_SEC ? <span className="state-pill compact">зазирнув</span>
                              : <span className="state-pill compact">пішов</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote with-icon"><Info />Номер гостя діє в межах дня: повторний візит того ж дня впізнаємо за одягом і силуетом, без облич. Завтра той самий гість отримає новий номер. Якщо система помилилась, відкрийте картку гостя і об’єднайте або розділіть візити.</p>
      </section>

      {open && (
        <PersonDrawer
          personId={open}
          cameras={data.cameras.map((item) => camerasById.get(item.id)).filter((camera): camera is NonNullable<typeof camera> => Boolean(camera))}
          staff={staff}
          dayPersons={data.persons}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
