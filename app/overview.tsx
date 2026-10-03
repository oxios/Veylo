"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Clock3, DoorOpen, Film, Footprints, Info, LayoutGrid, Percent, Radio, TrendingUp, Users } from "lucide-react";
import { apiFetch } from "./api-client";
import { KindChip, StatusPill } from "./camera-ui";
import { useNow } from "./cameras";
import { BarChart, HeatmapPanel, TableGrid } from "./charts";
import { formatBucket, formatDateTime, formatDay, formatDuration, formatHour, formatPercent, formatTime } from "./format";
import type { Camera, CameraMetrics, LiveStats, PageContext, PageKey, PeriodKey, Video } from "./types";
import { isPending, ProgressBar, StatusBadge, WorkerBanner } from "./video-status";

type Step = { title: string; hint: string; done: boolean; active?: boolean; action: string; onAction: () => void };

// Markup that every metric of the camera's kind needs.
export function markupComplete(camera: Camera) {
  if (camera.source === "upload") return Boolean(camera.entryLine && camera.hallZone);
  if (camera.kind === "outdoor") return Boolean(camera.entryLine && camera.streetZone);
  if (camera.kind === "hybrid") return Boolean(camera.entryLine && camera.doorZone);
  return camera.tables.length > 0;
}

function Checklist({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">ЗАПУСК</span>
          <h2>Налаштуйте заклад, щоб побачити показники</h2>
        </div>
        <span className="step-count">{doneCount} з {steps.length}</span>
      </div>
      <ol className="checklist">
        {steps.map((step, index) => (
          <li key={step.title} className={step.done ? "done" : step.active ? "active" : ""}>
            <i>{step.done ? <Check /> : index + 1}</i>
            <div>
              <strong>{step.title}</strong>
              <p>{step.hint}</p>
            </div>
            {!step.done && <button className={step.active ? "primary" : "secondary"} onClick={step.onAction}>{step.action}<ArrowRight /></button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProcessingCard({ videos, cameras }: { videos: Video[]; cameras: Camera[] }) {
  const pending = videos.filter(isPending);
  if (!pending.length) return null;
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">ОБРОБКА</span>
          <h2>Відео в роботі</h2>
        </div>
      </div>
      <ul className="processing-list">
        {pending.map((video) => (
          <li key={video.id}>
            <div>
              <strong>{video.originalName}</strong>
              <span>{cameras.find((camera) => camera.id === video.cameraId)?.name ?? "Камера"} · запис від {formatDateTime(video.recordedAt)}</span>
            </div>
            <StatusBadge video={video} />
            <ProgressBar value={video.status === "processing" ? video.progress : 0} label={`Прогрес обробки ${video.originalName}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, sub, blocked, onFix, accent }: {
  icon: typeof Users;
  label: string;
  value?: string;
  sub?: string;
  blocked?: string;
  onFix?: () => void;
  accent?: "s1" | "s2";
}) {
  return (
    <section className={`card kpi${blocked ? " blocked" : ""}`}>
      <span>{accent ? <i className={`swatch ${accent}`} /> : <Icon />}{label}</span>
      {blocked ? (
        <>
          <p>{blocked}</p>
          {onFix && <button className="secondary" onClick={onFix}>Розмітити<ArrowRight /></button>}
        </>
      ) : (
        <>
          <strong>{value}</strong>
          {sub && <small>{sub}</small>}
        </>
      )}
    </section>
  );
}

// ---- "right now" strip ----

function NowCard({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const now = useNow(camera, 5000);
  const tablesBusy = now?.now?.tables.filter((table) => table.occupied).length ?? 0;
  const conversion = now && now.today.entries + now.today.passersby > 0 ? now.today.entries / (now.today.entries + now.today.passersby) : null;
  const headline = now?.now ? (camera.kind === "outdoor" ? now.now.people : now.now.inHall ?? now.now.people) : null;
  return (
    <li>
      <button type="button" className="now-card" onClick={onOpen}>
        <span className="now-head"><strong>{camera.name}</strong><StatusPill status={camera.status} compact /></span>
        <span className="now-main">
          <b>{headline ?? "—"}</b>
          <small>{camera.kind === "outdoor" ? "людей у кадрі" : "гостей у залі"}</small>
        </span>
        <span className="now-foot">
          {camera.kind !== "indoor" && <span><DoorOpen />{now ? now.today.entries : "—"} зайшло</span>}
          {camera.kind !== "indoor" && <span><Percent />{conversion === null ? "—" : formatPercent(conversion)}</span>}
          {camera.kind !== "outdoor" && camera.tables.length > 0 && <span><LayoutGrid />{tablesBusy}/{camera.tables.length} столів</span>}
        </span>
      </button>
    </li>
  );
}

function NowStrip({ cameras, go }: { cameras: Camera[]; go: (page: PageKey) => void }) {
  if (!cameras.length) return null;
  return (
    <section className="now-strip">
      <div className="section-bar compact">
        <div>
          <span className="eyebrow live-eyebrow"><i />ЗАРАЗ</span>
        </div>
      </div>
      <ul>{cameras.map((camera) => <NowCard key={camera.id} camera={camera} onOpen={() => go("cameras")} />)}</ul>
    </section>
  );
}

// ---- live dashboard ----

const periods: [PeriodKey, string][] = [["today", "Сьогодні"], ["yesterday", "Вчора"], ["7d", "7 днів"], ["30d", "30 днів"]];

function bucketLabels(stats: LiveStats) {
  if (stats.series.bucket === "hour") {
    return {
      labels: stats.series.buckets.map((bucket) => formatTime(bucket.start)),
      tooltip: stats.series.buckets.map((bucket) => {
        const start = new Date(bucket.start);
        return `${formatTime(bucket.start)}–${formatTime(new Date(start.getTime() + 3_600_000).toISOString())}`;
      }),
      tickEvery: 3,
    };
  }
  return {
    labels: stats.series.buckets.map((bucket) => formatDay(bucket.start)),
    tooltip: stats.series.buckets.map((bucket) => new Date(bucket.start).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })),
    tickEvery: stats.series.buckets.length > 10 ? 5 : 1,
  };
}

function LiveDashboard({ cameras, go }: { cameras: Camera[]; go: (page: PageKey) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("today");
  const camera = cameras.find((item) => item.id === selectedId) ?? cameras[0];
  const [loaded, setLoaded] = useState<{ key: string; stats: LiveStats } | null>(null);
  const [error, setError] = useState("");
  const requestKey = `${camera?.id}|${period}|${camera?.markupVersion}|${camera?.kind}`;

  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    const load = () => apiFetch<{ stats: LiveStats }>(`/cameras/${camera.id}/stats?period=${period}`)
      .then((result) => {
        if (cancelled) return;
        setLoaded({ key: requestKey, stats: result.stats });
        setError("");
      })
      .catch((requestError) => !cancelled && setError(requestError instanceof Error ? requestError.message : "Не вдалося порахувати показники"));
    void load();
    const timer = window.setInterval(load, period === "today" ? 30_000 : 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey captures every input of the request
  }, [requestKey]);

  if (!camera) return null;
  const stats = loaded?.key === requestKey ? loaded.stats : null;
  const fix = () => go("cameras");
  const axis = stats ? bucketLabels(stats) : null;
  const future = stats?.series.buckets.map((bucket) => bucket.future) ?? [];
  const coverage = stats && stats.coverage.spanSec > 0 ? Math.min(1, stats.coverage.coveredSec / stats.coverage.spanSec) : null;

  const entriesKpi = stats && (
    <Kpi key="entries" icon={DoorOpen} accent="s1" label="Зайшло"
      value={stats.entries ? String(stats.entries.total) : undefined}
      sub={stats.entries ? `вийшло ${stats.entries.exits}` : undefined}
      blocked={stats.entries ? undefined : camera.kind === "hybrid" ? "Намалюйте поріг на кадрі камери" : "Намалюйте лінію дверей на кадрі камери"}
      onFix={fix} />
  );
  const passersKpi = stats && (
    <Kpi key="passersby" icon={Footprints} accent="s2" label="Пройшло повз"
      value={stats.passersby ? String(stats.passersby.total) : undefined}
      sub={stats.passersby ? (camera.kind === "hybrid" ? "помічені у відчинених дверях" : "пройшли тротуаром і не зайшли") : undefined}
      blocked={stats.passersby ? undefined : camera.kind === "hybrid" ? "Позначте проріз дверей і поріг на кадрі камери" : "Позначте тротуар і лінію дверей на кадрі камери"}
      onFix={fix} />
  );
  const conversionKpi = stats && (
    <Kpi key="conversion" icon={Percent} label="Конверсія входу"
      value={stats.passersby ? formatPercent(stats.passersby.conversion) : undefined}
      sub={stats.passersby ? "зайшло / (зайшло + пройшло повз)" : undefined}
      blocked={stats.passersby ? undefined : "Потрібні лінія дверей і зона, де видно перехожих"}
      onFix={fix} />
  );
  const peakKpi = stats && (
    <Kpi key="peak" icon={Users} label="Пік у залі"
      value={stats.occupancy ? `${stats.occupancy.peak} ${stats.occupancy.peak === 1 ? "людина" : "людей"}` : undefined}
      sub={stats.occupancy ? `${stats.occupancy.peakAt ? `о ${formatTime(stats.occupancy.peakAt)}` : "людей не було"} · у середньому ${stats.occupancy.average}` : undefined} />
  );
  const tablesKpi = stats && (
    <Kpi key="tables" icon={LayoutGrid} label="Зайнятість столиків"
      value={stats.tables ? formatPercent(stats.tables.averageRate) : undefined}
      sub={stats.tables ? `${stats.tables.items.reduce((sum, item) => sum + item.sessions, 0)} посадок · ${stats.tables.items.length} столиків` : undefined}
      blocked={stats.tables ? undefined : "Розмітьте столики на кадрі камери"}
      onFix={fix} />
  );
  const seatKpi = stats && (
    <Kpi key="seat" icon={Clock3} label="Середній час за столиком"
      value={stats.tables ? (stats.tables.avgSessionSec === null ? "—" : formatDuration(stats.tables.avgSessionSec)) : undefined}
      sub={stats.tables ? "посадка — від 1 хвилини" : undefined}
      blocked={stats.tables ? undefined : "Розмітьте столики на кадрі камери"}
      onFix={fix} />
  );
  const kpis = camera.kind === "outdoor" ? [passersKpi, entriesKpi, conversionKpi]
    : camera.kind === "hybrid" ? [entriesKpi, passersKpi, conversionKpi, peakKpi]
      : [peakKpi, tablesKpi, seatKpi];

  return (
    <div className="stack">
      <div className="section-bar">
        <div>
          <span className="eyebrow">АНАЛІТИКА НАЖИВО</span>
          <h2 className="with-chip">{camera.name}<KindChip kind={camera.kind} /></h2>
        </div>
        <div className="toolbar">
          {cameras.length > 1 && (
            <label className="field inline">Камера<select value={camera.id} onChange={(event) => setSelectedId(event.target.value)}>
              {cameras.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          )}
          <div className="segmented small" role="group" aria-label="Період">
            {periods.map(([key, label]) => <button key={key} type="button" className={period === key ? "on" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}
          </div>
        </div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {!stats ? <section className="card panel"><p className="muted">Рахуємо показники…</p></section> : (
        <>
          <div className="coverage-line">
            <span>Камера аналізувалась <b>{formatDuration(stats.coverage.coveredSec)}</b> з {formatDuration(stats.coverage.spanSec)}{coverage !== null ? ` (${formatPercent(coverage)})` : ""}</span>
            <span className="coverage-bar"><i style={{ width: `${(coverage ?? 0) * 100}%` }} /></span>
            <span className="muted small">Сірі заштриховані проміжки на графіках — камера не працювала, а не «нуль людей».</span>
          </div>
          <div className={`kpis kpis-${kpis.length}`}>{kpis}</div>
          <div className="charts">
            {stats.entries && axis && (
              <BarChart
                eyebrow={stats.series.bucket === "hour" ? "ПО ГОДИНАХ" : "ПО ДНЯХ"}
                title={stats.passersby ? "Трафік біля входу" : "Входи"}
                labels={axis.labels}
                tooltipLabels={axis.tooltip}
                tickEvery={axis.tickEvery}
                future={future}
                unit="людей"
                series={[
                  { key: "entries", label: "Зайшло", tone: "s1", values: stats.series.buckets.map((bucket) => bucket.entries) },
                  ...(stats.passersby ? [{ key: "passersby", label: "Пройшло повз", tone: "s2" as const, values: stats.series.buckets.map((bucket) => bucket.passersby) }] : []),
                ]}
              />
            )}
            {stats.occupancy && axis && (
              <BarChart
                eyebrow={stats.series.bucket === "hour" ? "ПО ГОДИНАХ" : "ПО ДНЯХ"}
                title="Людей у залі (у середньому)"
                labels={axis.labels}
                tooltipLabels={axis.tooltip}
                tickEvery={axis.tickEvery}
                future={future}
                unit="людей"
                series={[{ key: "occupancy", label: "У середньому", tone: "s3", values: stats.series.buckets.map((bucket) => bucket.occupancyAvg) }]}
              />
            )}
            {stats.profile && (stats.entries || stats.occupancy) && (
              <BarChart
                eyebrow="ТИПОВИЙ ДЕНЬ"
                title={stats.entries ? "Входи за годину доби" : "Людей у залі за годину доби"}
                labels={stats.profile.map((item) => formatHour(item.hour))}
                tickEvery={3}
                unit={stats.entries ? "за годину" : "людей"}
                series={stats.entries ? [
                  { key: "entries", label: "Зайшло", tone: "s1", values: stats.profile.map((item) => item.entriesPerHour) },
                  ...(stats.passersby ? [{ key: "passersby", label: "Пройшло повз", tone: "s2" as const, values: stats.profile.map((item) => item.passersbyPerHour) }] : []),
                ] : [{ key: "occupancy", label: "У середньому", tone: "s3", values: stats.profile.map((item) => item.occupancyAvg) }]}
                note="Середнє по всіх днях періоду, нормоване на час, коли камера справді працювала."
              />
            )}
            <HeatmapPanel
              camera={camera}
              heatmap={stats.heatmap}
              title={camera.kind === "outdoor" ? "Де люди проходять" : "Де гості проводили час"}
              note={camera.kind === "hybrid" ? "Проріз дверей (вулиця) у хітмап залу не входить." : undefined}
            />
          </div>
          {stats.tables && stats.tableGrid && axis && (
            <section className="card panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">СТОЛИКИ</span>
                  <h2>Зайнятість по {stats.series.bucket === "hour" ? "годинах" : "днях"}</h2>
                </div>
              </div>
              <div className="tables-layout">
                <TableGrid rows={stats.tableGrid} labels={axis.labels} tooltipLabels={axis.tooltip} tickEvery={axis.tickEvery} />
                <table className="video-table compact">
                  <thead><tr><th>Столик</th><th>Зайнятий</th><th>Посадок</th><th>Сер. посадка</th></tr></thead>
                  <tbody>
                    {stats.tables.items.map((item) => (
                      <tr key={item.id}><td>{item.label}</td><td>{formatPercent(item.rate)}</td><td>{item.sessions}</td><td>{formatDuration(item.avgSessionSec)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {stats.markupStaleBefore && <p className="footnote with-icon"><Info />Показники до {formatDateTime(stats.markupStaleBefore)} пораховано за попередньою розміткою: сирі треки зберігаються 7 днів, старіші години не перераховуються.</p>}
          <p className="footnote with-icon"><Info />Рахуємо за треками YOLO + ByteTrack на субпотоці камери. Якщо трекер «губить» людину (перекриття, вихід із кадру), вона може порахуватися двічі.</p>
        </>
      )}
    </div>
  );
}

// ---- uploaded-video dashboard ----

function Dashboard({ cameras, videos, go }: { cameras: Camera[]; videos: Video[]; go: (page: PageKey) => void }) {
  const camerasWithData = cameras.filter((camera) => camera.source === "upload" && videos.some((video) => video.cameraId === camera.id && video.status === "done"));
  const [selectedId, setSelectedId] = useState("");
  const camera = camerasWithData.find((item) => item.id === selectedId) ?? camerasWithData[0];
  const [metrics, setMetrics] = useState<CameraMetrics | null>(null);
  const [error, setError] = useState("");

  const doneVideos = videos.filter((video) => video.cameraId === camera?.id && video.status === "done");
  // Refetch when a video finishes or the markup changes.
  const metricsKey = `${camera?.id}|${doneVideos.map((video) => video.id).join(",")}|${JSON.stringify([camera?.entryLine, camera?.hallZone])}`;

  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    apiFetch<{ metrics: CameraMetrics | null }>(`/cameras/${camera.id}/metrics`)
      .then((result) => {
        if (cancelled) return;
        setMetrics(result.metrics);
        setError("");
      })
      .catch((requestError) => !cancelled && setError(requestError instanceof Error ? requestError.message : "Не вдалося порахувати показники"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metricsKey captures every input of the request
  }, [metricsKey]);

  if (!camera) return null;
  const span = metrics ? (Date.parse(metrics.period.to) - Date.parse(metrics.period.from)) / 1000 : 0;
  const period = metrics ? `з ${formatDateTime(metrics.period.from)} · ${formatDuration(span)}` : "";
  const source = metrics ? `${metrics.videos.length} відео · ${period}` : "";
  const buckets = metrics?.series.buckets ?? [];
  const seconds = (metrics?.series.bucketSeconds ?? 60) < 60;
  const labels = buckets.map((bucket) => formatTime(bucket.start, seconds));
  const tooltip = buckets.map((bucket) => `${formatTime(bucket.start, seconds)}–${formatTime(new Date(Date.parse(bucket.start) + (metrics?.series.bucketSeconds ?? 60) * 1000).toISOString(), seconds)}`);
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 6));

  return (
    <div className="stack">
      <div className="section-bar">
        <div>
          <span className="eyebrow">ЗАВАНТАЖЕНІ ВІДЕО</span>
          <h2>{camera.name}</h2>
        </div>
        <div className="toolbar">
          {camerasWithData.length > 1 && (
            <label className="field inline">Камера<select value={camera.id} onChange={(event) => setSelectedId(event.target.value)}>
              {camerasWithData.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          )}
          {metrics && <span className="toolbar-period">Період: <strong>{period}</strong></span>}
        </div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {!metrics ? (
        <section className="card panel"><p className="muted">Рахуємо показники…</p></section>
      ) : (
        <>
          <div className="kpis">
            <Kpi
              icon={DoorOpen}
              label="Зайшло"
              value={metrics.entries ? String(metrics.entries.total) : undefined}
              sub={metrics.entries ? `вийшло ${metrics.entries.exits} · ${source}` : undefined}
              blocked={metrics.entries ? undefined : "Намалюйте лінію входу на кадрі камери"}
              onFix={() => go("cameras")}
            />
            <Kpi
              icon={Users}
              label="Пік у залі"
              value={metrics.occupancy ? `${metrics.occupancy.peak} ${metrics.occupancy.peak === 1 ? "людина" : "людей"}` : undefined}
              sub={metrics.occupancy ? `${metrics.occupancy.peakAt ? `о ${formatTime(metrics.occupancy.peakAt)}` : "людей у зоні не було"} · у середньому ${metrics.occupancy.average}` : undefined}
              blocked={metrics.occupancy ? undefined : "Позначте зону залу на кадрі камери"}
              onFix={() => go("cameras")}
            />
            <Kpi
              icon={Clock3}
              label="Середній час у залі"
              value={metrics.dwell ? (metrics.dwell.averageSec === null ? "—" : formatDuration(metrics.dwell.averageSec)) : undefined}
              sub={metrics.dwell ? (metrics.dwell.tracks ? `медіана ${formatDuration(metrics.dwell.medianSec)} · ${metrics.dwell.tracks} треків` : `немає перебувань довших за ${metrics.dwell.minSec} с`) : undefined}
              blocked={metrics.dwell ? undefined : "Позначте зону залу на кадрі камери"}
              onFix={() => go("cameras")}
            />
            <Kpi
              icon={Film}
              label="Оброблено відео"
              value={formatDuration(metrics.videos.reduce((sum, video) => sum + video.durationSec, 0))}
              sub={`${metrics.videos.length} файл(ів) · ${metrics.trackCount} треків людей`}
            />
          </div>
          <div className="charts">
            {metrics.entries && (
              <BarChart eyebrow={`ПО ${formatBucket(metrics.series.bucketSeconds).toUpperCase()}`} title="Входи" labels={labels} tooltipLabels={tooltip} tickEvery={tickEvery} unit="входів"
                series={[{ key: "entries", label: "Зайшло", tone: "s1", values: buckets.map((bucket) => bucket.entries) }]} />
            )}
            {metrics.occupancy && (
              <BarChart eyebrow={`ПО ${formatBucket(metrics.series.bucketSeconds).toUpperCase()}`} title="Людей у залі (у середньому)" labels={labels} tooltipLabels={tooltip} tickEvery={tickEvery} unit="людей"
                series={[{ key: "occupancy", label: "У середньому", tone: "s3", values: buckets.map((bucket) => bucket.occupancyAvg) }]} />
            )}
          </div>
          <div className="split">
            <HeatmapPanel camera={camera} heatmap={metrics.heatmap} />
            <RecentVideos videos={videos} cameras={cameras} go={go} />
          </div>
          <p className="footnote with-icon"><Info />Показники пораховано за треками YOLO. Якщо трекер «губить» людину (перекриття, вихід із кадру), вона може порахуватися двічі, а час у залі — занизитися.</p>
        </>
      )}
    </div>
  );
}

function RecentVideos({ videos, cameras, go }: { videos: Video[]; cameras: Camera[]; go: (page: PageKey) => void }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">ВІДЕО</span>
          <h2>Останні завантаження</h2>
        </div>
        <button className="secondary" onClick={() => go("videos")}>Усі<ArrowRight /></button>
      </div>
      <ul className="recent-list">
        {videos.slice(0, 5).map((video) => (
          <li key={video.id}>
            <div>
              <strong>{video.originalName}</strong>
              <span>{cameras.find((camera) => camera.id === video.cameraId)?.name ?? "Камера"} · {formatDateTime(video.recordedAt)}</span>
            </div>
            <StatusBadge video={video} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Overview({ venue, cameras, videos, worker, go, openVenueModal }: PageContext) {
  const liveCameras = cameras.filter((camera) => camera.source === "rtsp");
  const hasDone = videos.some((video) => video.status === "done");
  const liveData = liveCameras.some((camera) => camera.status.state === "online" || camera.snapshotAt);
  const hasData = hasDone || liveData;
  const markupReady = cameras.some((camera) => markupComplete(camera) && (camera.source === "rtsp" ? Boolean(camera.snapshotAt) : videos.some((video) => video.cameraId === camera.id && video.status === "done")));
  const steps = useMemo<Step[]>(() => {
    const list: Omit<Step, "active">[] = [
      { title: "Створіть заклад", hint: "Назва та адреса кав’ярні чи ресторану.", done: Boolean(venue), action: "Додати заклад", onAction: openVenueModal },
      { title: "Підключіть камеру", hint: "RTSP-адреса камери (наживо) або камера для завантаження записів файлами.", done: cameras.length > 0, action: "До камер", onAction: () => go("cameras") },
      {
        title: "Отримайте перші дані",
        hint: liveCameras.length ? "Вузол обробки підключається до камери, пише архів і рахує людей." : "Завантажте запис і дочекайтесь обробки YOLO. Після обробки файл видаляється.",
        done: hasData,
        action: liveCameras.length ? "Статус камер" : "Завантажити",
        onAction: () => go(liveCameras.length ? "cameras" : "videos"),
      },
      { title: "Розмітьте кадр", hint: "Двері, тротуар чи проріз дверей, зал і столики — залежно від типу камери.", done: markupReady, action: "Розмітити", onAction: () => go("cameras") },
    ];
    const firstOpen = list.findIndex((step) => !step.done);
    return list.map((step, index) => ({ ...step, active: index === firstOpen }));
  }, [venue, cameras.length, liveCameras.length, hasData, markupReady, go, openVenueModal]);

  return (
    <div className="stack">
      <WorkerBanner worker={worker} videos={videos} />
      {(!hasData || !markupReady) && <Checklist steps={steps} />}
      <NowStrip cameras={liveCameras} go={go} />
      <ProcessingCard videos={videos} cameras={cameras} />
      {liveCameras.length > 0 && <LiveDashboard cameras={liveCameras} go={go} />}
      {hasDone && <Dashboard cameras={cameras} videos={videos} go={go} />}
      {!liveCameras.length && !hasDone && cameras.length > 0 && (
        <section className="card panel empty-hero">
          <TrendingUp />
          <h3>Показники з’являться після перших даних</h3>
          <p>Додайте RTSP-камеру — тоді аналітика рахуватиметься наживо — або завантажте запис.</p>
          <button type="button" className="primary" onClick={() => go("cameras")}><Radio />До камер</button>
        </section>
      )}
    </div>
  );
}
