"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  Filter,
  Info,
  MapPin,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { spatialZonesFor, type VenueLocation } from "./system";

export type PageContract = {
  scope: "Локация" | "Сеть" | "Устройство" | "Система";
  period: "range" | "live" | "none";
  sources: string[];
  preconditions: string[];
  output: string;
  freshness: string;
  failureMode: string;
};

const C = (
  scope: PageContract["scope"],
  period: PageContract["period"],
  sources: string[],
  output: string,
  preconditions: string[],
  freshness = "Обновление каждые 1–5 минут",
  failureMode = "Недоступные источники помечаются; метрика не подменяется расчётным значением.",
): PageContract => ({ scope, period, sources, output, preconditions, freshness, failureMode });

export const pageContracts: Record<string, PageContract> = {
  overview: C("Локация", "range", ["Камеры", "POS", "Погода", "График"], "Единая сводка гостей, сервиса и выручки", ["Активная локация", "Сопоставленные зоны", "Часовой пояс"]),
  demo: C("Сеть", "none", ["Демо-данные"], "Ролевой walkthrough продукта", ["Роль", "Формат заведения"]),
  copilot: C("Локация", "live", ["Камеры", "POS", "Погода", "Остатки", "График"], "Приоритизированный план смены", ["Открытая смена", "Назначенный manager", "Пороговые правила"]),
  live: C("Локация", "live", ["Камеры", "Edge AI"], "Текущее состояние зон и инцидентов", ["Online-потоки", "Калибровка", "Clock sync"], "Задержка 1–3 секунды"),
  insights: C("Локация", "range", ["Камеры", "POS", "Погода", "График"], "Объяснимые рекомендации с эффектом", ["Минимум 14 дней истории", "Trust score ≥ 70", "Бизнес-цель"]),
  simulator: C("Локация", "range", ["Прогноз", "Labor", "P&L"], "Сценарий до запуска", ["Baseline", "Ограничения ресурсов", "Cost model"]),
  experiments: C("Локация", "range", ["События", "POS", "Погода", "Промо"], "Control/treatment и доказанный uplift", ["Гипотеза", "Primary metric", "Guardrails", "Размер выборки"]),
  outside: C("Локация", "range", ["Уличная камера", "Погода", "Календарь"], "Проходящий поток и capture rate", ["Tripwire IN/OUT", "Фасадная ROI", "Координаты локации"]),
  inside: C("Локация", "range", ["Камеры", "План этажа"], "Occupancy, dwell и heatmap", ["Зоны", "Camera↔floor calibration", "Track deduplication"]),
  journey: C("Локация", "range", ["Камеры", "POS", "CRM"], "Воронка от улицы до повторного визита", ["Смежные зоны", "Session stitching", "Consent-safe CRM match"]),
  service: C("Локация", "range", ["Камеры", "План", "POS"], "SLA по столам и этапам сервиса", ["Table ROI", "Seat/contact events", "Привязка чека"]),
  staff: C("Локация", "range", ["Камеры", "График", "POS"], "Нагрузка и SLA команды", ["Смена", "Роли сотрудников", "Privacy policy"]),
  kitchen: C("Локация", "range", ["Камеры кухни", "KDS", "Сенсоры"], "SOP и скорость кухни", ["Kitchen ROI", "Pass events", "HACCP-пороги"]),
  videoSearch: C("Локация", "range", ["Event index", "Видеоархив"], "Доказательные фрагменты по запросу", ["Разрешение на просмотр", "Retention", "Индекс событий"]),
  profit: C("Локация", "range", ["POS", "Камеры кассы", "Роли"], "Риски void/refund/discount", ["POS mapping", "Cashier zone", "Review workflow"]),
  waste: C("Локация", "range", ["Waste camera", "Весы", "Recipe cost"], "Waste по продукту и стоимости", ["Waste station", "Scale calibration", "SKU mapping"]),
  forecast: C("Локация", "range", ["История", "Погода", "События", "POS"], "Прогноз гостей, продаж и нагрузки", ["8 недель истории", "Часы работы", "Holiday calendar"]),
  labor: C("Локация", "range", ["Прогноз", "График", "Payroll"], "Почасовой staffing plan", ["Доступность", "Навыки", "Лимиты часов"]),
  prep: C("Локация", "range", ["Прогноз", "POS", "Остатки", "Рецептуры"], "Prep и заказ поставщику", ["Recipe map", "On-hand", "Lead time", "Подтверждающий manager"]),
  safety: C("Локация", "live", ["Сенсоры", "Камеры", "HACCP"], "Критические точки и протоколы", ["Порог", "Ответственный", "Эскалация"]),
  delivery: C("Локация", "live", ["Delivery API", "KDS", "Камеры pickup"], "SLA кухни, упаковки и курьера", ["Каналы", "Pickup ROI", "Order ID mapping"]),
  finance: C("Локация", "range", ["POS", "Inventory", "Labor"], "Prime cost и profit bridge", ["Закрытый период", "COGS mapping", "Payroll sync"]),
  guestAI: C("Локация", "live", ["Телефония", "Брони", "CRM"], "Звонки, брони и win-back", ["Номер локации", "Часы", "Политика записи"]),
  reputation: C("Локация", "range", ["Отзывы", "Операционные события", "Видео"], "Root cause и черновик ответа", ["Подключённый профиль", "Time match", "Подтверждение manager"]),
  menu: C("Локация", "none", ["POS menu", "Стоп-лист", "Брендинг"], "Гостевое QR-меню", ["POS SKU", "Цена и налог", "Язык", "Аллергены"]),
  menuEngineering: C("Локация", "range", ["POS", "Food cost", "QR events"], "Матрица популярности и маржи", ["Recipe cost", "Menu category", "Минимум продаж"]),
  content: C("Локация", "none", ["Медиатека", "Погода", "Occupancy"], "Плейлисты и smart-правила", ["Целевые устройства", "Fallback-контент", "Расписание"]),
  screens: C("Устройство", "live", ["Device heartbeat", "CMS"], "Remote control экранов и планшетов", ["Локация", "Этаж", "Зона", "Pairing code", "Fallback playlist"]),
  alerts: C("Локация", "live", ["Event bus", "Rules", "Routing"], "Инциденты и эскалации", ["Метрика", "Порог", "Длительность", "Получатель"]),
  reports: C("Сеть", "range", ["Метрики", "Роли", "Расписание"], "Периодические отчёты", ["Шаблон", "Scope", "Получатели", "Часовой пояс"]),
  setup: C("Локация", "none", ["Конфигурация"], "Readiness и blockers запуска", ["Локация", "План", "Зоны", "Камеры", "Интеграции", "Privacy"]),
  trust: C("Локация", "live", ["Все источники", "Model registry", "Audit log"], "Lineage, freshness и drift", ["Source IDs", "Model versions", "Quality gates"]),
  locations: C("Сеть", "none", ["Конфигурация локаций"], "Структура и readiness сети", ["Адрес", "Часовой пояс", "Формат", "Вместимость"]),
  floorplan: C("Локация", "none", ["План", "Камеры"], "Этажи, зоны и покрытие", ["Масштаб", "Границы", "Вместимость", "Camera placement"]),
  cameras: C("Локация", "live", ["ONVIF / RTSP / VMS"], "Fleet health и video analytics", ["Локация", "Этаж", "Зона", "Источник", "Placement", "Calibration", "Privacy"]),
  integrations: C("Локация", "live", ["Connectors"], "Синхронизация внешних данных", ["Credentials", "Location mapping", "Field mapping", "Health check"]),
  settings: C("Система", "none", ["Policy store"], "Роли, privacy и правила", ["Право Owner", "Audit trail", "Подтверждение изменений"]),
};

export function contractFor(page: string): PageContract {
  return pageContracts[page] ?? C("Локация", "range", ["Мок-данные"], "Демонстрационный результат", ["Активная локация"]);
}

function sourceState(source: string, location: VenueLocation): { ready: boolean; detail: string } {
  const cameraSource = /камер|видео|event index|edge/i.test(source);
  const spatialSource = /план|roi/i.test(source);
  const laborSource = /график|labor|payroll/i.test(source);
  const connected = location.connectedSources ?? [];
  if (/connectors/i.test(source) && connected.length === 0) return { ready: false, detail: "К локации не подключено ни одного внешнего источника" };
  if (/device heartbeat|cms/i.test(source) && !location.demoSeeded && (location.configuredScreens?.length ?? 0) === 0) return { ready: false, detail: "Экран или планшет не подключён к этой локации" };
  if (cameraSource && location.cameras === 0) return { ready: false, detail: "Источник не подключён к этой локации" };
  if (cameraSource && location.online < location.cameras) return { ready: false, detail: `${location.cameras - location.online} из ${location.cameras} потоков недоступно` };
  if (cameraSource && location.configuredCameras?.some((camera) => !camera.calibrated)) return { ready: false, detail: "Новая камера ещё не прошла calibration validation" };
  if (spatialSource && location.zones === 0) return { ready: false, detail: "План не содержит сохранённых зон" };
  if (/pos/i.test(source) && !connected.includes("Poster POS")) return { ready: false, detail: "POS не сопоставлен с этой локацией" };
  if (/погод/i.test(source) && !connected.includes("OpenWeather")) return { ready: false, detail: "Провайдер погоды не привязан к координатам локации" };
  const connector = [
    [/график|labor|payroll/i, "Worksection"],
    [/kds/i, "KDS"],
    [/crm/i, "CRM / Loyalty"],
    [/inventory|остат|рецептур|recipe|food cost|on-hand/i, "Inventory"],
    [/сенсор|haccp/i, "IoT / HACCP"],
    [/delivery api/i, "Delivery aggregators"],
    [/телефон|брони/i, "Telephony / Reservations"],
    [/отзыв/i, "Google Business"],
    [/p&l/i, "BAS / 1C"],
  ].find(([pattern]) => (pattern as RegExp).test(source))?.[1] as string | undefined;
  if (connector && !connected.includes(connector)) return { ready: false, detail: `${connector} не сопоставлен с локацией` };
  if (laborSource && location.id === "central") return { ready: false, detail: "Источник графика не подключён" };
  return { ready: true, detail: "Источник сопоставлен с location_id" };
}

function blockersFor(contract: PageContract, location: VenueLocation) {
  const blockers: string[] = [];
  const usesCamera = contract.sources.some((source) => /камер|видео|event index|edge/i.test(source));
  const usesSpatialContext = contract.sources.some((source) => /камер|видео|план|event index|edge/i.test(source));
  const usesLabor = contract.sources.some((source) => /график|labor|payroll/i.test(source));
  const usesPos = contract.sources.some((source) => /pos/i.test(source));
  const usesWeather = contract.sources.some((source) => /погод/i.test(source));
  if (usesCamera && location.cameras === 0) blockers.push("Нет ни одной подключённой камеры");
  else if (usesCamera && location.online < location.cameras) blockers.push(`${location.cameras - location.online} камера без потока`);
  else if (usesCamera && location.configuredCameras?.some((camera) => !camera.calibrated)) blockers.push("Новая камера не прошла calibration validation");
  if (usesSpatialContext && location.zones === 0) blockers.push("Не создано ни одной зоны на плане");
  if (usesLabor && location.id === "central") blockers.push("Labor-источник не подключён");
  if (usesPos && !location.connectedSources?.includes("Poster POS")) blockers.push("POS не сопоставлен с локацией");
  if (usesWeather && !location.connectedSources?.includes("OpenWeather")) blockers.push("Погода не привязана к координатам");
  if (contract.period === "range" && location.historyDays < 1) blockers.push("Исторические события ещё не накоплены");
  if (contract.preconditions.some((item) => /14 дней/i.test(item)) && location.historyDays < 14) blockers.push(`Нужно 14 дней истории · сейчас ${location.historyDays}`);
  if (contract.preconditions.some((item) => /8 недель/i.test(item)) && location.historyDays < 56) blockers.push(`Нужно 8 недель истории · сейчас ${location.historyDays} дней`);
  if (contract.preconditions.some((item) => /baseline|минимум продаж/i.test(item)) && location.historyDays < 14) blockers.push("Не накоплен baseline для сравнения");
  const missingSource = contract.sources.find((source) => !sourceState(source, location).ready);
  if (missingSource) blockers.push(`${missingSource}: ${sourceState(missingSource, location).detail}`);
  if (location.readiness < 70 && contract.scope !== "Сеть") blockers.push(`Readiness ${location.readiness}%`);
  return [...new Set(blockers)];
}

export function hardBlockersFor(contract: PageContract, location: VenueLocation) {
  return blockersFor(contract, location).filter((item) => !item.startsWith("Readiness"));
}

export function DataContextBar({
  contract,
  location,
  period,
  filterSummary,
  onOpen,
}: {
  contract: PageContract;
  location: VenueLocation;
  period: string;
  filterSummary?: string;
  onOpen: () => void;
}) {
  const blockers = blockersFor(contract, location);
  return (
    <section className={`qa-context-bar ${blockers.length ? "warning" : ""}`} aria-label="Контекст данных страницы">
      <div><Store /><p><span>{contract.scope}</span><strong>{contract.scope === "Сеть" || contract.scope === "Система" ? "Oxios Food Group" : location.name}</strong></p></div>
      <div><CalendarDays /><p><span>Период</span><strong>{contract.period === "live" ? "Live · сегодня" : contract.period === "none" ? "Не применяется" : period}</strong></p></div>
      <div className="qa-context-sources"><Database /><p><span>Источники</span><strong>{contract.sources.slice(0, 3).join(" · ")}{contract.sources.length > 3 ? ` +${contract.sources.length - 3}` : ""}</strong></p></div>
      {filterSummary && <div className="qa-context-filter"><Filter /><p><span>Фильтры</span><strong>{filterSummary}</strong></p></div>}
      <div className="qa-context-health">
        {blockers.length ? <AlertTriangle /> : <CheckCircle2 />}
        <p><span>{blockers.length ? "Ограничение" : "Контракт готов"}</span><strong>{blockers[0] ?? contract.freshness}</strong></p>
      </div>
      <button className="secondary" onClick={onOpen}><Info /> Как формируется</button>
    </section>
  );
}

export function DataAvailabilityGate({
  contract,
  location,
  bypass = false,
  go,
  children,
}: {
  contract: PageContract;
  location: VenueLocation;
  bypass?: boolean;
  go: (page: string) => void;
  children: React.ReactNode;
}) {
  const hardBlockers = hardBlockersFor(contract, location);
  if (bypass || location.demoSeeded || contract.scope !== "Локация" || contract.period === "none" || hardBlockers.length === 0) return children;
  const nextPage = hardBlockers.some((item) => /зон|план/i.test(item)) ? "floorplan" : hardBlockers.some((item) => /камер|поток|calibration/i.test(item)) ? "cameras" : hardBlockers.some((item) => /истори|baseline/i.test(item)) ? "trust" : "integrations";
  const nextLabel = nextPage === "floorplan" ? "Настроить план и зоны" : nextPage === "cameras" ? "Настроить камеры" : nextPage === "trust" ? "Проверить качество данных" : "Подключить источники";
  return (
    <section className="qa-availability" role="status">
      <div className="qa-availability-icon"><Database /></div>
      <span>DATA READINESS · {location.name.toUpperCase()}</span>
      <h2>Метрики ещё не публикуются</h2>
      <p>Это не ошибка и не нулевые данные: для выбранной локации пока не выполнены обязательные условия контракта страницы.</p>
      <div>{hardBlockers.map((item) => <p key={item}><AlertTriangle /><strong>{item}</strong></p>)}</div>
      <aside><button className="primary" onClick={() => go(nextPage)}>{nextLabel} <ChevronRight /></button><button className="secondary" onClick={() => go("setup")}>Открыть центр настройки</button></aside>
      <small>После появления валидных источников VenueFlow автоматически покажет метрики, графики и инсайты этой локации.</small>
    </section>
  );
}

export function ContractDrawer({
  open,
  onClose,
  contract,
  location,
  pageTitle,
}: {
  open: boolean;
  onClose: () => void;
  contract: PageContract;
  location: VenueLocation;
  pageTitle: string;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  const blockers = blockersFor(contract, location);
  return (
    <div className="qa-overlay" onMouseDown={onClose}>
      <aside className="qa-drawer" role="dialog" aria-modal="true" aria-labelledby="qa-contract-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><i><Database /></i><p><span>DATA CONTRACT</span><strong id="qa-contract-title">{pageTitle}</strong></p></div><button onClick={onClose} aria-label="Закрыть контракт данных"><X /></button></header>
        <div className="qa-scope-path"><Store /><strong>{contract.scope === "Сеть" || contract.scope === "Система" ? "Oxios Food Group" : location.name}</strong><ChevronRight /><MapPin /><span>{contract.scope}</span><ChevronRight /><Database /><span>{contract.output}</span></div>
        <section><span>ОБЯЗАТЕЛЬНЫЕ ВХОДЫ</span>{contract.sources.map((source) => { const state = sourceState(source, location); return <div className={`qa-check-row ${state.ready ? "" : "missing"}`} key={source}>{state.ready ? <CheckCircle2 /> : <AlertTriangle />}<p><strong>{source}</strong><em>{state.detail}</em></p></div>; })}</section>
        <section><span>УСЛОВИЯ ПУБЛИКАЦИИ</span>{contract.preconditions.map((item) => <div className="qa-check-row gate" key={item}><ClipboardCheck /><p><strong>{item}</strong><em>Обязательный gate · фактический статус показан ниже</em></p></div>)}</section>
        {blockers.length > 0 && <section className="qa-blockers"><span>ТЕКУЩИЕ ОГРАНИЧЕНИЯ</span>{blockers.map((item) => <div key={item}><AlertTriangle /><p><strong>{item}</strong><em>Зависимые данные маркируются как неполные</em></p></div>)}</section>}
        <section className="qa-contract-result"><ShieldCheck /><p><span>РЕЗУЛЬТАТ</span><strong>{contract.output}</strong><em>{contract.failureMode}</em></p></section>
        <footer><span><RefreshCw /> {contract.freshness}</span><button className="primary" onClick={onClose}>Понятно</button></footer>
      </aside>
    </div>
  );
}

export type ActionContext = {
  id: number;
  message: string;
  page: string;
  pageTitle: string;
  location: VenueLocation;
  period: string;
  contract: PageContract;
};

type ActionKind = "filters" | "export" | "diagnostic" | "evidence" | "receipt";

function actionKind(message: string): ActionKind {
  if (/фильтр/i.test(message)) return "filters";
  if (/экспорт|report|отч[её]т|checksum/i.test(message)) return "export";
  if (/диагност|health/i.test(message)) return "diagnostic";
  if (/фрагмент|чек #|доказатель|model card|методик|журнал/i.test(message)) return "evidence";
  return "receipt";
}

export function ActionWorkbench({
  action,
  onClose,
  onCommit,
}: {
  action: ActionContext | null;
  onClose: () => void;
  onCommit: (message: string, filterSummary?: string) => void;
}) {
  const [camera, setCamera] = useState("Все камеры");
  const [zone, setZone] = useState("Все зоны");
  const [confidence, setConfidence] = useState("70%+");
  const [format, setFormat] = useState("PDF");
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const [diagnosed, setDiagnosed] = useState(false);
  const [note, setNote] = useState("");
  const [workError, setWorkError] = useState("");
  const kind = useMemo(() => actionKind(action?.message ?? ""), [action?.message]);
  useEffect(() => {
    if (!action) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [action?.id, action, onClose]);
  if (!action) return null;
  const availableZones = spatialZonesFor(action.location).map((item) => item.name);
  const requiresCamera = action.contract.sources.some((source) => /камер|видео|event index|edge/i.test(source));
  const commit = () => {
    setWorkError("");
    if (kind === "filters" && requiresCamera && action.location.cameras === 0) { setWorkError("Фильтр по видео недоступен: в активной локации нет камер."); return; }
    if (kind === "diagnostic" && action.location.cameras === 0) { setWorkError("Диагностика не запущена: сначала добавьте источник видео."); return; }
    if (kind === "filters") return onCommit("Фильтры применены", `${camera} · ${zone} · ${confidence}`);
    if (kind === "export") return onCommit(`Демо-экспорт ${format} подготовлен для ${action.location.name}`);
    if (kind === "diagnostic") return diagnosed ? onCommit("Результат диагностики добавлен в журнал") : setDiagnosed(true);
    return onCommit("Действие подтверждено в демо-режиме");
  };
  const title = kind === "filters" ? "Настроить фильтры" : kind === "export" ? "Подготовить экспорт" : kind === "diagnostic" ? "Диагностика источника" : kind === "evidence" ? "Доказательство и контекст" : "Результат действия";
  return (
    <div className="qa-overlay" onMouseDown={onClose}>
      <section className="qa-action-sheet" role="dialog" aria-modal="true" aria-labelledby="qa-action-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><i>{kind === "filters" ? <Filter /> : kind === "export" ? <Download /> : kind === "diagnostic" ? <Settings2 /> : kind === "evidence" ? <Play /> : <ClipboardCheck />}</i><p><span>{action.pageTitle.toUpperCase()}</span><strong id="qa-action-title">{title}</strong></p></div><button onClick={onClose} aria-label="Закрыть детали действия"><X /></button></header>
        <div className="qa-action-context"><span><Store /> {action.location.name}</span><span><CalendarDays /> {action.period}</span><span><Database /> {action.contract.sources.join(" · ")}</span></div>
        <article className="qa-action-message"><Info /><p><span>ИНИЦИИРОВАННОЕ ДЕЙСТВИЕ</span><strong>{action.message}</strong><em>Прототип показывает входные данные и ожидаемый результат; серверная запись не создаётся.</em></p></article>
        {kind === "filters" && <div className="qa-form-grid"><label>Камера<select value={action.location.cameras === 0 ? "Нет подключённых камер" : camera} disabled={action.location.cameras === 0} onChange={(event) => setCamera(event.target.value)}>{action.location.cameras === 0 ? <option>Нет подключённых камер</option> : <><option>Все камеры</option><option>Только online</option><option>Только проблемные</option></>}</select></label><label>Зона<select value={availableZones.length === 0 ? "Нет сохранённых зон" : zone} disabled={availableZones.length === 0} onChange={(event) => setZone(event.target.value)}>{availableZones.length === 0 ? <option>Нет сохранённых зон</option> : <><option>Все зоны</option>{availableZones.map((item) => <option key={item}>{item}</option>)}</>}</select></label><label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value)}><option>70%+</option><option>85%+</option><option>95%+</option></select></label><label>Период<input value={action.period} readOnly /></label></div>}
        {kind === "export" && <><div className="qa-form-grid"><label>Формат<select value={format} onChange={(event) => setFormat(event.target.value)}><option>PDF</option><option>CSV</option><option>XLSX</option><option>JSON</option></select></label><label>Scope<input value={`${action.location.name} · ${action.period}`} readOnly /></label></div><label className="qa-checkbox"><input type="checkbox" checked={includeEvidence} onChange={(event) => setIncludeEvidence(event.target.checked)} /><i /> Включить ID событий и ссылки на доказательные фрагменты</label></>}
        {kind === "diagnostic" && <div className="qa-diagnostic">{[["Heartbeat", "2 сек назад"], ["Stream", diagnosed ? "1920×1080 · 25 FPS" : "Ожидает проверки"], ["Clock sync", diagnosed ? "180 мс" : "Ожидает проверки"], ["Model runtime", diagnosed ? "Healthy" : "Ожидает проверки"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong>{diagnosed && <CheckCircle2 />}</div>)}</div>}
        {(kind === "evidence" || kind === "receipt") && <div className="qa-evidence"><div><Play /><span>DEMO EVIDENCE</span><strong>EVT-{String(94000 + action.id).slice(-5)}</strong></div><section><p><span>Scope</span><strong>{action.location.name}</strong></p><p><span>Период</span><strong>{action.period}</strong></p><p><span>Источник</span><strong>{action.contract.sources[0]}</strong></p><p><span>Результат</span><strong>{action.contract.output}</strong></p></section></div>}
        {workError && <div className="sys-form-error" role="alert"><AlertTriangle />{workError}</div>}
        <label className="qa-note">Комментарий к действию<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Опционально: причина, наблюдение или решение…" /></label>
        <footer><button className="secondary" onClick={onClose}>Отмена</button><button className="primary" onClick={commit}>{kind === "filters" ? "Применить" : kind === "export" ? "Подготовить файл" : kind === "diagnostic" && !diagnosed ? "Запустить проверку" : "Подтвердить"}</button></footer>
      </section>
    </div>
  );
}
