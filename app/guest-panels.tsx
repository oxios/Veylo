"use client";

import { useState } from "react";
import { Bike, Footprints, ImageOff, MapPin, Route } from "lucide-react";
import { apiUrl } from "./api-client";
import { CameraFrame, centroid, polygonPoints } from "./camera-ui";
import { BarChart } from "./charts";
import { formatDuration, formatHour, formatPercent, formatTime } from "./format";
import { ArchiveClip, guestName, useNow } from "./people-ui";
import type { Camera, GuestsDay, Passer, Visit } from "./types";

// ---- passers-by with proof ----

type PasserFilter = "all" | "pedestrian" | "cyclist";

function PasserCard({ passer, camera, now }: { passer: Passer; camera: Camera | undefined; now: number }) {
  const [failed, setFailed] = useState(false);
  const recordable = now - Date.parse(passer.at) < 24 * 3_600_000 - 5 * 60_000;
  return (
    <article className="passer-card">
      <div className="passer-shot">
        {passer.hasShot && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset
          <img src={apiUrl(`/tracks/${passer.id}/thumb`)} alt={`${passer.kind === "cyclist" ? "Велосипедист" : "Перехожий"} о ${formatTime(passer.at)}`} loading="lazy" onError={() => setFailed(true)} />
        ) : <ImageOff aria-hidden="true" />}
        <span className={`passer-kind ${passer.kind}`}>{passer.kind === "cyclist" ? <Bike /> : <Footprints />}</span>
      </div>
      <div className="passer-meta">
        <strong>{formatTime(passer.at, true)}</strong>
        <small>{passer.kind === "cyclist" ? "велосипедист" : "пішохід"} · {formatDuration(Math.max(1, Math.round((Date.parse(passer.to) - Date.parse(passer.from)) / 1000)))} у проході</small>
      </div>
      {recordable && <ArchiveClip camera={camera} startMs={Date.parse(passer.from) - 3000} endMs={Date.parse(passer.to) + 3000} label="Запис" compact />}
    </article>
  );
}

export function PassersPanel({ data, cameras }: { data: GuestsDay; cameras: Camera[] }) {
  const [filter, setFilter] = useState<PasserFilter>("all");
  const [limit, setLimit] = useState(24);
  const now = useNow(60_000);
  const passers = data.passers;
  if (!passers) {
    return (
      <section className="card panel blocked-panel">
        <span className="eyebrow">ПРОЙШЛИ ПОВЗ</span>
        <h2>Потрібні поріг і проріз дверей</h2>
        <p className="muted">Щоб рахувати перехожих, на гібридній камері розмітьте поріг і проріз дверей, крізь який видно вулицю.</p>
      </section>
    );
  }
  const total = passers.pedestrians + passers.cyclists;
  const items = passers.items.filter((item) => filter === "all" || item.kind === filter);
  const hours = passers.byHour.filter((item) => item.pedestrians + item.cyclists > 0).map((item) => item.hour);
  const first = hours.length ? Math.max(0, Math.min(...hours) - 1) : 8;
  const last = hours.length ? Math.min(23, Math.max(...hours) + 1) : 20;
  const range = passers.byHour.slice(first, last + 1);
  const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
  return (
    <section className="card panel">
      <div className="panel-head wrap">
        <div>
          <span className="eyebrow">ПРОЙШЛИ ПОВЗ</span>
          <h2>{total} {total === 1 ? "перехожий" : "перехожих"} не зайшли</h2>
        </div>
        <div className="passer-totals">
          <span><Footprints />{passers.pedestrians} пішоходів</span>
          <span><Bike />{passers.cyclists} велосипедистів</span>
          {data.kpis.conversion !== null && <span>конверсія {formatPercent(data.kpis.conversion)}</span>}
        </div>
      </div>
      {total > 0 && (
        <BarChart
          eyebrow="ПО ГОДИНАХ"
          title="Коли проходили повз"
          labels={range.map((item) => formatHour(item.hour))}
          tickEvery={range.length > 12 ? 2 : 1}
          unit="перехожих"
          series={[
            { key: "pedestrians", label: "Пішоходи", tone: "s2", values: range.map((item) => item.pedestrians) },
            { key: "cyclists", label: "Велосипедисти", tone: "s1", values: range.map((item) => item.cyclists) },
          ]}
        />
      )}
      <div className="passer-toolbar">
        <div className="chips" role="group" aria-label="Тип перехожих">
          {([["all", "Усі"], ["pedestrian", "Пішоходи"], ["cyclist", "Велосипедисти"]] as [PasserFilter, string][]).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? "chip on" : "chip"} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(24); }}>{label}</button>
          ))}
        </div>
        <span className="muted small">Кожен — з кадром і записом (архів 24 год)</span>
      </div>
      {items.length === 0 ? <p className="muted">{data.live ? "Поки нікого. Перехожий з’явиться тут, щойно пройде повз двері." : "Цього дня перехожих не зафіксовано."}</p> : (
        <div className="passer-grid">
          {items.slice(0, limit).map((passer) => <PasserCard key={passer.id} passer={passer} camera={camerasById.get(passer.cameraId)} now={now} />)}
        </div>
      )}
      {items.length > limit && <button type="button" className="secondary block-center" onClick={() => setLimit(limit + 48)}>Показати ще {Math.min(48, items.length - limit)}</button>}
      <p className="footnote">Перехожий — людина в прорізі дверей, що не переступила поріг і рухалась повз. Велосипедист з велосипедом рахуються один раз.</p>
    </section>
  );
}

// ---- guest routes over the camera frame ----

type RouteFilter = "all" | "seated" | "now";

const hue = (no: number | null) => ((no ?? 0) * 137.5) % 360;

// Foot points jitter by a few pixels even when someone stands still; a short moving average draws the walk, not the noise.
function smoothPath(path: [number, number, number][]) {
  return path.map((_, index) => {
    const window = path.slice(Math.max(0, index - 2), index + 3);
    return { x: window.reduce((sum, p) => sum + p[1], 0) / window.length, y: window.reduce((sum, p) => sum + p[2], 0) / window.length };
  });
}

export function RoutesPanel({ data, cameras, onOpen }: { data: GuestsDay; cameras: Camera[]; onOpen: (personId: string) => void }) {
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const liveCameras = data.cameras.map((item) => cameras.find((camera) => camera.id === item.id)).filter((camera): camera is Camera => Boolean(camera));
  const [cameraId, setCameraId] = useState<string>(liveCameras[0]?.id ?? "");
  const camera = liveCameras.find((item) => item.id === cameraId) ?? liveCameras[0];

  const visits = data.visits
    .filter((visit) => visit.cameraId === camera?.id && (visit.path?.length ?? 0) >= 2)
    .filter((visit) => filter === "all" || (filter === "seated" ? visit.tables.length > 0 : visit.active));

  // Where guests sat: visits per table with the average time.
  const seatMap = new Map<string, { label: string; visits: number; sec: number }>();
  for (const visit of data.visits.filter((item) => item.cameraId === camera?.id)) {
    for (const table of visit.tables) {
      const entry = seatMap.get(table.id) ?? { label: table.label, visits: 0, sec: 0 };
      entry.visits += 1;
      entry.sec += table.sec;
      seatMap.set(table.id, entry);
    }
  }
  const seats = [...seatMap.entries()].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.visits - a.visits);

  if (!camera) return null;
  const maxSeat = Math.max(1, ...seats.map((seat) => seat.visits));
  const color = (visit: Visit) => `hsl(${hue(visit.no)} 85% 60%)`;
  return (
    <section className="card panel">
      <div className="panel-head wrap">
        <div>
          <span className="eyebrow">МАРШРУТИ ГОСТЕЙ</span>
          <h2>Як заходили і куди сідали</h2>
        </div>
        <div className="journal-tools">
          {liveCameras.length > 1 && (
            <label className="field inline">Камера
              <select value={camera.id} onChange={(event) => setCameraId(event.target.value)}>
                {liveCameras.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <div className="chips" role="group" aria-label="Які маршрути показати">
            {([["all", "Усі"], ["seated", "Хто сідав"], ["now", "Зараз у залі"]] as [RouteFilter, string][]).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? "chip on" : "chip"} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="routes-layout">
        <div className="routes-frame">
          <CameraFrame camera={camera} />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label={`Маршрути ${visits.length} візитів на кадрі камери`}>
            {camera.tables.map((table) => <polygon key={table.id} className="route-table" points={polygonPoints(table.points)} />)}
            {visits.map((visit) => {
              const points = smoothPath(visit.path ?? []);
              const dim = focus !== null && focus !== visit.personId;
              return (
                <g key={visit.id} className={dim ? "route dim" : focus === visit.personId ? "route focus" : "route"} style={{ color: color(visit) }}>
                  <polyline points={polygonPoints(points)} />
                  <circle className="route-start" cx={points[0].x} cy={points[0].y} r="0.008" />
                  <circle className="route-end" cx={points.at(-1)!.x} cy={points.at(-1)!.y} r="0.011" />
                </g>
              );
            })}
          </svg>
          {camera.tables.map((table) => {
            const c = centroid(table.points);
            const seat = seats.find((item) => item.id === table.id);
            return seat ? <em key={table.id} className="route-seat" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>{seat.visits}</em> : null;
          })}
          {visits.length === 0 && <div className="routes-empty"><Route />Маршрутів за цим фільтром немає</div>}
        </div>
        <aside className="routes-side">
          <h3><MapPin />Куди сідали</h3>
          {seats.length === 0 ? <p className="muted small">Ще ніхто не сідав за розмічені столики.</p> : (
            <ul className="seat-bars">
              {seats.map((seat) => (
                <li key={seat.id}>
                  <span>{seat.label}</span>
                  <i style={{ width: `${(seat.visits / maxSeat) * 100}%` }} />
                  <b>{seat.visits} · сер. {formatDuration(Math.round(seat.sec / seat.visits))}</b>
                </li>
              ))}
            </ul>
          )}
          <h3><Route />Гості</h3>
          <ul className="route-list">
            {visits.slice().reverse().slice(0, 40).map((visit) => (
              <li key={visit.id}>
                <button type="button" onMouseEnter={() => setFocus(visit.personId)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(visit.personId)} onBlur={() => setFocus(null)} onClick={() => onOpen(visit.personId)}>
                  <i style={{ background: color(visit) }} />
                  <span>{guestName(visit.no)}</span>
                  <small>{formatTime(visit.startAt)} · {visit.tables[0]?.label ?? (visit.active ? "у залі" : formatDuration(visit.durationSec))}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <p className="footnote">Лінія — шлях ніг гостя по підлозі від входу (мала точка) до місця, де його бачили востаннє (велика точка). Наведіть на гостя в списку, щоб виділити його маршрут; клік — картка з записом.</p>
    </section>
  );
}
