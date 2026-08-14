/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudSun,
  Database,
  Eye,
  FileClock,
  FlaskConical,
  Gauge,
  GitBranch,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  Timer,
  TrendingUp,
  Users,
  Utensils,
  X,
} from "lucide-react";
import type { VenueLocation } from "./system";

type Notify = (text: string) => void;

function TrustPill({ tone = "neutral", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`audit-pill ${tone}`}>{children}</span>;
}

const lineage: Record<string, Array<[any, string, string]>> = {
  "Capture rate": [
    [Camera, "CAM-01", "Tripwire фасада"],
    [Activity, "Track events", "Анонимные траектории"],
    [GitBranch, "Deduplication", "Окно 4 секунды"],
    [Database, "Traffic aggregate", "Прошли / вошли"],
    [Target, "Capture rate", "18,7%"],
  ],
  "First contact SLA": [
    [Camera, "CAM-02", "Table ROI"],
    [Utensils, "Seat event", "Гость сел"],
    [Users, "Staff track", "Первый контакт"],
    [Timer, "SLA timer", "Порог 5 минут"],
    [Gauge, "Service SLA", "92,4%"],
  ],
  "Prime cost": [
    [Database, "Poster POS", "Продажи и voids"],
    [Users, "Labor", "Часы и payroll"],
    [Utensils, "Inventory", "Recipe food cost"],
    [GitBranch, "Cost mapping", "Локация и период"],
    [BarChart3, "Prime cost", "46,3%"],
  ],
  "Food safety": [
    [Server, "Sensor T-14", "Prep fridge"],
    [Camera, "CAM-04", "Дверь и зона"],
    [Activity, "Threshold event", "+7°C · 10 минут"],
    [ClipboardCheck, "HACCP protocol", "Назначенная задача"],
    [ShieldCheck, "Safety score", "94/100"],
  ],
};

export function DataTrustCenter({ location, notify }: { location: VenueLocation; notify: Notify }) {
  const [metric, setMetric] = useState("Capture rate");
  const [checked, setChecked] = useState(false);
  const [auditFilter, setAuditFilter] = useState("Все");
  const hasNoCameras = location.cameras === 0;
  const hasCameraIssue = hasNoCameras || location.online < location.cameras;
  const hasCalibrationIssue = !location.demoSeeded && (location.configuredCameras ?? []).some((camera) => !camera.calibrated);
  const hasZones = location.zones > 0;
  const hasPos = location.connectedSources?.includes("Poster POS") ?? false;
  const hasWeather = location.connectedSources?.includes("OpenWeather") ?? false;
  const hasLabor = location.connectedSources?.includes("Worksection") ?? false;
  const hasInventory = location.connectedSources?.includes("Inventory") ?? false;
  const hasSensors = location.connectedSources?.includes("IoT / HACCP") ?? false;
  const warningCount = Number(hasCameraIssue) + Number(hasCalibrationIssue) + Number(!hasZones) + Number(!hasPos) + Number(!hasWeather) + Number(!hasLabor);
  const warningWord = warningCount === 1 ? "предупреждение" : warningCount >= 2 && warningCount <= 4 ? "предупреждения" : "предупреждений";
  const passedChecks = 27 - warningCount;
  const trustScore = Math.min(99, Math.max(0, location.readiness + (checked ? 2 : 0)));
  const metricAvailable = metric === "Capture rate" || metric === "First contact SLA"
    ? !hasCameraIssue && !hasCalibrationIssue && hasZones
    : metric === "Prime cost"
      ? hasPos && hasLabor && hasInventory
      : !hasCameraIssue && hasSensors;
  const sources = [
    [Camera, "Видео", hasNoCameras ? "нет источников" : `${location.online}/${location.cameras} потоков`, hasCameraIssue ? "attention" : "success", hasNoCameras ? "добавьте камеру и spatial context" : hasCameraIssue ? `${location.cameras - location.online} источник недоступен` : "свежесть < 1 сек"],
    [Database, "Poster POS", hasPos ? "sync 4 мин" : "не подключено", hasPos ? "success" : "attention", hasPos ? "99,7% чеков сопоставлено" : "нет location mapping"],
    [CloudSun, "Погода", hasWeather ? "sync 9 мин" : "не подключено", hasWeather ? "success" : "attention", hasWeather ? "координаты подтверждены" : "нет провайдера погоды"],
    [Users, "Labor", hasLabor ? "sync 12 мин" : "не подключено", hasLabor ? "success" : "attention", hasLabor ? "18 сотрудников mapped" : "нет источника графика"],
  ];
  const auditEvents = location.demoSeeded ? [
    ["21:18", "Manager", "Изменён порог очереди", "8 → 9 гостей"],
    ["20:54", "Venue AI", "Создано доказательство", "EVT-94821 · CAM-03"],
    ["19:42", "System", "Обнаружен RTSP timeout", `${location.name} · последний источник`],
    ["18:10", "Owner", "Экспортирован weekly report", "4 получателя"],
    ["16:32", "Integrator", "Обновлена POS-схема", "poster.order.v3"],
  ] : [
    ["сейчас", "System", "Создан контекст локации", `${location.name} · ${location.timezone}`],
    ["сейчас", "System", hasZones ? "Зоны плана сохранены" : "Ожидается план и разметка зон", hasZones ? `${location.zones} зон` : "метрики заблокированы"],
    ["сейчас", "System", hasNoCameras ? "Ожидается источник видео" : "Источник видео добавлен", hasNoCameras ? "камера → этаж → зона" : `${location.online}/${location.cameras} online`],
  ];
  return (
    <>
      <section className="audit-trust-hero">
        <div>
          <span><ShieldCheck /> DATA TRUST CENTER · {location.name.toUpperCase()}</span>
          <h2>Каждую цифру можно объяснить и проверить</h2>
          <p>Свежесть источников, lineage метрик, качество моделей, калибровка и журнал изменений — в одном месте.</p>
          <button
            className="primary"
            onClick={() => {
              setChecked(true);
              notify(`27 проверок завершены · ${warningCount ? `найдено ${warningCount} ${warningWord}` : "предупреждений нет"}`);
            }}
          >
            <RefreshCw /> Проверить сейчас
          </button>
        </div>
        <aside>
          <div style={{ "--trust": `${trustScore * 3.6}deg` } as React.CSSProperties}>
            <strong>{trustScore}</strong><span>trust score</span>
          </div>
          <p><strong>{warningCount ? `${warningCount} ${warningWord}` : "Данные надёжны"}</strong><span>{checked ? "проверено только что" : "проверено 12 минут назад"}</span></p>
        </aside>
      </section>

      <section className="audit-source-grid">
        {sources.map(([Icon, title, value, tone, text]: any) => (
          <article className="card" key={title}>
            <i className={tone}><Icon /></i>
            <p><span>{title}</span><strong>{value}</strong><em>{text}</em></p>
            <TrustPill tone={tone}>{tone === "success" ? <><Check /> Healthy</> : <><AlertTriangle /> Проверить</>}</TrustPill>
          </article>
        ))}
      </section>

      <section className="audit-trust-layout">
        <article className="card audit-lineage">
          <div className="card-head">
            <div><span>METRIC LINEAGE</span><h2>Откуда взялась метрика</h2></div>
            <select aria-label="Метрика для просмотра происхождения" value={metric} onChange={(event) => setMetric(event.target.value)}>
              {Object.keys(lineage).map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          {metricAvailable ? <div className="audit-lineage-flow">
            {lineage[metric].map(([Icon, title, text], index) => (
              <div key={title}>
                <article><i><Icon /></i><p><strong>{title}</strong><span>{text}</span></p></article>
                {index < lineage[metric].length - 1 && <ArrowRight />}
              </div>
            ))}
          </div> : <div className="audit-lineage-empty"><AlertTriangle /><p><strong>Lineage ещё не сформирован</strong><span>Подключите обязательные источники выбранной метрики; VenueFlow не подменяет отсутствующие события демо-значениями.</span></p></div>}
          <div className="audit-contract">
            <Database />
            <p><strong>Контракт метрики</strong><span>location_id · floor_id · zone_id · source_id · event_time · model_version · confidence</span></p>
            <button className="secondary" onClick={() => notify(`Контракт «${metric}» открыт`)}>Посмотреть JSON</button>
          </div>
        </article>

        <aside className="card audit-quality">
          <div className="card-head"><div><span>QUALITY GATES</span><h2>Проверки перед публикацией</h2></div><TrustPill tone={warningCount ? "attention" : "success"}>{passedChecks}/27</TrustPill></div>
          {[
            ["Clock sync", hasNoCameras ? "нет источников для проверки" : "расхождение 180 мс", !hasNoCameras],
            ["Camera calibration", hasNoCameras ? "камеры не добавлены" : hasCameraIssue ? `${location.cameras - location.online} источник не проверен` : hasCalibrationIssue ? "есть неактивированная калибровка" : "ошибка < 0,2 м", !hasCameraIssue && !hasCalibrationIssue],
            ["POS reconciliation", hasPos ? "99,7% matched" : "POS не подключён", hasPos],
            ["Duplicate tracks", location.demoSeeded ? "0,8% · ниже порога" : "появится после активации tracking", location.demoSeeded],
            ["Minimum sample", location.demoSeeded ? "8 недель истории" : "история ещё не накоплена", location.demoSeeded],
            ["Labor mapping", hasLabor ? "18/18 сотрудников" : "источник отсутствует", hasLabor],
          ].map(([title, text, ready]: any) => (
            <button key={title} onClick={() => notify(`${title}: ${text}`)}>
              <i className={ready ? "ready" : "warn"}>{ready ? <Check /> : <AlertTriangle />}</i>
              <p><strong>{title}</strong><span>{text}</span></p>
              <ChevronRight />
            </button>
          ))}
        </aside>
      </section>

      <section className="audit-bottom-grid">
        <article className="card audit-models">
          <div className="card-head"><div><span>MODEL GOVERNANCE</span><h2>Модели и drift</h2></div><button className="secondary" aria-disabled={hasNoCameras} onClick={() => notify(hasNoCameras ? "Валидация недоступна: нет событий подключённых камер" : "Запущена выборочная валидация 200 событий")}>Validate sample</button></div>
          <div className="audit-model-head"><span>Модель</span><span>Версия</span><span>Precision</span><span>Drift 7д</span><span>Статус</span></div>
          {hasNoCameras ? <div className="audit-model-empty"><AlertTriangle /><p><strong>Нет выборки этой локации</strong><span>Model quality появится после camera validation и накопления событий.</span></p></div> : [
            ["People detection", "v2.8.4", "97,2%", "+0,4%", "Healthy"],
            ["Multi-camera tracking", "v1.9.2", "94,8%", "−0,7%", "Healthy"],
            ["Table state", "v3.1.0", "92,6%", "−2,4%", "Review"],
            ["Queue estimator", "v2.4.7", "95,1%", "+0,1%", "Healthy"],
          ].map((row) => <button key={row[0]} onClick={() => notify(`Открыта model card: ${row[0]}`)}>{row.map((cell, index) => index === 4 ? <TrustPill tone={cell === "Healthy" ? "success" : "attention"} key={cell}>{cell}</TrustPill> : <span key={cell}>{cell}</span>)}</button>)}
        </article>
        <article className="card audit-log">
          <div className="card-head"><div><span>IMMUTABLE AUDIT LOG</span><h2>Кто и что изменил</h2></div><div>{["Все", "User", "System"].map((item) => <button className={auditFilter === item ? "active" : ""} key={item} onClick={() => setAuditFilter(item)}>{item}</button>)}</div></div>
          {auditEvents.filter((event) => auditFilter === "Все" || (auditFilter === "System" ? event[1] === "System" || event[1] === "Venue AI" : event[1] !== "System" && event[1] !== "Venue AI")).map((event) => <div key={`${event[0]}-${event[2]}`}><time>{event[0]}</time><i>{event[1][0]}</i><p><strong>{event[2]}</strong><span>{event[1]} · {event[3]}</span></p><Eye /></div>)}
          <button className="secondary full" onClick={() => notify("Audit log экспортирован с checksum")}>Экспорт с checksum</button>
        </article>
      </section>
    </>
  );
}

type Experiment = {
  title: string;
  hypothesis: string;
  status: "running" | "completed" | "draft";
  progress: number;
  lift: string;
  confidence: string;
  metric: string;
  treatment: string;
  control: string;
  days: string;
};

const experiments: Experiment[] = [
  { title: "Lunch boost · ср–чт", hypothesis: "Фасад + QR увеличат capture в тихие часы", status: "running", progress: 64, lift: "+11,8%", confidence: "91%", metric: "Capture → order", treatment: "Lunch combo на экране и QR", control: "Обычный контент", days: "День 9 из 14" },
  { title: "Терраса: welcome prompt", hypothesis: "Подсказка хостес сократит первый контакт", status: "completed", progress: 100, lift: "−24%", confidence: "96%", metric: "First contact", treatment: "Задача при посадке", control: "Текущий процесс", days: "Завершён · 21 день" },
  { title: "Cold drinks по погоде", hypothesis: "Промо при +23°C поднимет mix напитков", status: "draft", progress: 0, lift: "+6–9%", confidence: "forecast", metric: "Drink mix", treatment: "Dynamic screen rule", control: "Static playlist", days: "Не запущен" },
  { title: "Prep после 19:00", hypothesis: "Нижний batch снизит waste без stockout", status: "running", progress: 42, lift: "−₴284/д", confidence: "84%", metric: "Waste cost", treatment: "Prep −18%", control: "Baseline recipe prep", days: "День 6 из 14" },
];

export function ExperimentHub({ location, notify }: { location: VenueLocation; notify: Notify }) {
  const [items, setItems] = useState<Experiment[]>(location.demoSeeded ? experiments : []);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [rolledOut, setRolledOut] = useState(false);
  const [draft, setDraft] = useState({ hypothesis: "Промо lunch-комбо увеличит capture с 12:00 до 14:00", metric: "Capture → order", duration: "14 дней", guardrails: "Погода, день недели, staffing, параллельные промо" });
  const [draftError, setDraftError] = useState("");
  const current = items[selected];
  const visible = items.map((item, index) => ({ item, index })).filter(({ item }) => filter === "all" || item.status === filter);
  const changeFilter = (nextFilter: string) => { setFilter(nextFilter); const first = items.findIndex((item) => nextFilter === "all" || item.status === nextFilter); setSelected(first); setRolledOut(false); };
  const createExperiment = () => {
    if (draft.hypothesis.trim().length < 12) { setDraftError("Гипотеза должна описывать изменение и ожидаемый эффект."); return; }
    if (!draft.guardrails.trim()) { setDraftError("Добавьте хотя бы один guardrail, чтобы отличить uplift от внешнего фактора."); return; }
    const created: Experiment = { title: draft.hypothesis.split(" ").slice(0, 5).join(" "), hypothesis: draft.hypothesis.trim(), status: "draft", progress: 0, lift: "—", confidence: "не рассчитано", metric: draft.metric, treatment: "Требуется описать treatment", control: "Текущий процесс", days: `${draft.duration} · не запущен` };
    const nextIndex = items.length; setItems((currentItems) => [...currentItems, created]); setSelected(nextIndex); setFilter("all"); setCreateOpen(false); setDraftError(""); notify(`Эксперимент EXP-${String(nextIndex + 21).padStart(3,"0")} создан · обязательный следующий шаг: проверить выборку и treatment`);
  };
  const rolloutEligible = current?.status === "completed";
  return (
    <>
      <section className="audit-exp-hero">
        <div><span><FlaskConical /> GROWTH EXPERIMENTS · {location.name.toUpperCase()}</span><h2>Докажите эффект до масштабирования</h2><p>Контрольная группа, погода, день недели и операционные guardrails отделяют реальный uplift от совпадения.</p></div>
        <button className="primary" onClick={() => setCreateOpen(true)}><Plus /> Новый эксперимент</button>
      </section>
      <section className="audit-exp-metrics">
        {[[FlaskConical,"Активных",String(items.filter((item) => item.status === "running").length),`из ${items.length}`],[TrendingUp,"Подтверждённый эффект",location.demoSeeded ? "+₴42,8k" : "—",location.demoSeeded ? "30 дней" : "нет завершённых тестов"],[Target,"Win rate",location.demoSeeded ? "68%" : "—",location.demoSeeded ? "17 из 25" : "нужна история"],[Timer,"Time to evidence",location.demoSeeded ? "12 дней" : "—","median"]].map(([Icon,label,value,text]:any)=><article className="card" key={label}><i><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}
      </section>
      <section className="audit-exp-layout">
        <article className="card audit-exp-list">
          <div className="card-head"><div><span>ПОРТФЕЛЬ</span><h2>Эксперименты</h2></div><div>{[["all","Все"],["running","Live"],["completed","Готово"],["draft","Draft"]].map(([key,label])=><button className={filter===key?"active":""} key={key} onClick={()=>changeFilter(key)}>{label}</button>)}</div></div>
          {visible.length === 0 && <div className="audit-exp-empty"><FlaskConical /><p><strong>Экспериментов в этом scope нет</strong><span>Создайте проверяемую гипотезу; результат появится только после control/treatment и достаточной выборки.</span></p><button className="secondary" onClick={() => setCreateOpen(true)}>Создать черновик</button></div>}
          {visible.map(({ item, index }) => <button className={selected===index?"active":""} key={item.title} onClick={()=>{setSelected(index);setRolledOut(false);}}><i className={item.status}><FlaskConical /></i><p><span>{item.status === "running" ? "LIVE" : item.status === "completed" ? "ЗАВЕРШЁН" : "ЧЕРНОВИК"}</span><strong>{item.title}</strong><em>{item.hypothesis}</em><b><i style={{width:`${item.progress}%`}} /></b></p><aside><strong>{item.lift}</strong><span>{item.days}</span></aside><ChevronRight /></button>)}
        </article>
        {current ? <article className="card audit-exp-detail">
          <div className="card-head"><div><span>EXPERIMENT EXP-{String(selected + 21).padStart(3,"0")}</span><h2>{current.title}</h2></div><TrustPill tone={current.status === "running" ? "live" : current.status === "completed" ? "success" : "neutral"}>{current.status}</TrustPill></div>
          <div className="audit-hypothesis"><Sparkles /><p><span>ГИПОТЕЗА</span><strong>{current.hypothesis}</strong></p></div>
          <div className="audit-variants">
            <article><span>A · CONTROL</span><strong>{current.control}</strong><p>482 сессии · baseline</p><i><b style={{width:"67%"}} /></i></article>
            <article><span>B · TREATMENT</span><strong>{current.treatment}</strong><p>496 сессий · stratified</p><i><b style={{width:"79%"}} /></i></article>
          </div>
          <div className="audit-result">
            <div><span>PRIMARY METRIC</span><strong>{current.metric}</strong><em>{current.lift} uplift</em></div>
            <div><span>CONFIDENCE</span><strong>{current.confidence}</strong><em>sequential test</em></div>
            <div><span>EST. VALUE</span><strong>+₴18,4k</strong><em>30 дней</em></div>
          </div>
          <div className="audit-evidence"><span>CAUSAL GUARDRAILS</span>{[[CloudSun,"Погода","сбалансирована"],[FileClock,"День и час","stratified"],[Store,"Другие промо","исключены"],[Users,"Staffing","±3%" ]].map(([Icon,label,value]:any)=><div key={label}><Icon /><p><strong>{label}</strong><span>{value}</span></p><CheckCircle2 /></div>)}</div>
          <div className="audit-detail-actions"><button className="secondary" onClick={()=>notify("Открыт полный statistical report")}>Методика и данные</button><button className="primary" disabled={!rolloutEligible} title={!rolloutEligible ? current.status === "running" ? "Дождитесь статистически достаточного результата" : "Сначала запустите эксперимент" : undefined} onClick={()=>{setRolledOut(true);notify("Победитель добавлен в rollout plan на подтверждение Owner");}}>{rolledOut?<><Check /> В rollout plan</>:rolloutEligible?<>Масштабировать победителя <ArrowRight /></>:current.status === "running"?<>Дождитесь результата</>:<>Сначала запустить</>}</button></div>
        </article> : <article className="card audit-exp-detail audit-exp-placeholder"><FlaskConical /><h2>Выберите или создайте эксперимент</h2><p>Здесь появятся гипотеза, варианты, guardrails, статистическая уверенность и критерий rollout.</p></article>}
      </section>
      {createOpen && <div className="audit-overlay" onMouseDown={()=>setCreateOpen(false)}><div className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="new-experiment-title" onMouseDown={(event)=>event.stopPropagation()}><button onClick={()=>setCreateOpen(false)} aria-label="Закрыть мастер эксперимента"><X /></button><span><FlaskConical /> НОВЫЙ ЭКСПЕРИМЕНТ · {location.name.toUpperCase()}</span><h2 id="new-experiment-title">Что хотим доказать?</h2><label>Гипотеза *<input required minLength={12} value={draft.hypothesis} onChange={(event)=>setDraft((current)=>({...current,hypothesis:event.target.value}))} /></label><div><label>Основная метрика *<select required value={draft.metric} onChange={(event)=>setDraft((current)=>({...current,metric:event.target.value}))}><option>Capture → order</option><option>First contact SLA</option><option>Average check</option><option>Waste cost</option></select></label><label>Длительность *<select required value={draft.duration} onChange={(event)=>setDraft((current)=>({...current,duration:event.target.value}))}><option>14 дней</option><option>21 день</option><option>28 дней</option></select></label></div><label>Guardrails *<input required value={draft.guardrails} onChange={(event)=>setDraft((current)=>({...current,guardrails:event.target.value}))} /></label>{draftError&&<p className="audit-form-error" role="alert"><AlertTriangle />{draftError}</p>}<aside><ShieldCheck /><p><strong>До запуска ещё потребуются</strong><span>Control/treatment, размер выборки, traffic split, owner метрики и проверка конфликтующих промо.</span></p></aside><footer><button className="secondary" onClick={()=>setCreateOpen(false)}>Отмена</button><button className="primary" onClick={createExperiment}>Создать черновик</button></footer></div></div>}
    </>
  );
}
