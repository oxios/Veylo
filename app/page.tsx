/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthGate, useAuth } from "./auth";
import { apiFetch } from "./api-client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CloudSun,
  Coffee,
  Database,
  Download,
  Eye,
  Filter,
  Gauge,
  Grid2X2,
  Map,
  LayoutDashboard,
  Lightbulb,
  ListFilter,
  LogOut,
  MapPin,
  Menu,
  MonitorPlay,
  MoreHorizontal,
  MousePointerClick,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Tablet,
  Target,
  ThermometerSun,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
  Video,
  WandSparkles,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  DeliveryControl,
  GuestAI,
  ImpactStrip,
  MenuEngineering,
  PrepInventory,
  ProfitGuard,
  ShiftCopilot,
  VideoSearchPage,
  WasteVision,
  WhatIfLab,
} from "./advanced";
import {
  CameraControl,
  FloorPlanManager,
  LocationsManager,
  SetupCenter,
  emptyVenueLocation,
  spatialZonesFor,
  type VenueLocation,
  venueLocations,
} from "./system";
import {
  AICopilotDrawer,
  DemoCenter,
  LaborPlanner,
  PrimeCost,
  ReputationHub,
  SafetyHub,
} from "./business";
import { DataTrustCenter, ExperimentHub } from "./audit";
import {
  ActionWorkbench,
  ContractDrawer,
  DataAvailabilityGate,
  DataContextBar,
  contractFor,
  hardBlockersFor,
  type ActionContext,
} from "./qa";

type Key =
  | "overview"
  | "demo"
  | "live"
  | "copilot"
  | "simulator"
  | "experiments"
  | "outside"
  | "inside"
  | "journey"
  | "service"
  | "staff"
  | "kitchen"
  | "videoSearch"
  | "profit"
  | "waste"
  | "insights"
  | "forecast"
  | "labor"
  | "prep"
  | "safety"
  | "delivery"
  | "finance"
  | "guestAI"
  | "reputation"
  | "menu"
  | "menuEngineering"
  | "content"
  | "screens"
  | "alerts"
  | "reports"
  | "setup"
  | "trust"
  | "locations"
  | "floorplan"
  | "cameras"
  | "integrations"
  | "settings";
const groups: any[] = [
  [
    "Командный центр",
    [
      ["overview", "Главная", LayoutDashboard],
      ["demo", "Демо-центр", Play],
      ["copilot", "Автопилот смены", Bot],
      ["live", "Live-центр", Activity],
      ["insights", "AI-инсайты", Sparkles],
      ["simulator", "Что-если Lab", WandSparkles],
      ["experiments", "Эксперименты", Target],
    ],
  ],
  [
    "Видеоаналитика",
    [
      ["outside", "Трафик снаружи", MapPin],
      ["inside", "Гости и зоны", Map],
      ["journey", "Путь гостя", Target],
      ["service", "Сервис и столы", Utensils],
      ["staff", "Команда", Users],
      ["kitchen", "Кухня и стандарты", ClipboardCheck],
      ["videoSearch", "AI-поиск по видео", Search],
      ["profit", "Profit Guard", ShieldCheck],
      ["waste", "Waste Vision", Activity],
    ],
  ],
  [
    "Операции",
    [
      ["forecast", "Прогноз спроса", WandSparkles],
      ["labor", "Labor и график", Users],
      ["prep", "Prep и закупки", PackageCheck],
      ["safety", "Safety и HACCP", ShieldCheck],
      ["delivery", "Delivery control", Activity],
      ["finance", "Prime cost", BarChart3],
    ],
  ],
  [
    "Guest experience",
    [
      ["guestAI", "AI-хост и гости", Bot],
      ["reputation", "Отзывы и репутация", Star],
      ["menu", "QR-меню", QrCode],
      ["menuEngineering", "Menu engineering", TrendingUp],
      ["content", "Контент", MonitorPlay],
      ["screens", "Экраны и планшеты", Tablet],
    ],
  ],
  [
    "Управление",
    [
      ["alerts", "События и алерты", Bell],
      ["reports", "Отчёты", BarChart3],
      ["setup", "Центр настройки", ClipboardCheck],
      ["trust", "Качество данных", ShieldCheck],
      ["locations", "Локации", Store],
      ["floorplan", "Планы и зоны", Map],
      ["cameras", "Камеры", Camera],
      ["integrations", "Интеграции", Zap],
      ["settings", "Настройки", Settings],
    ],
  ],
];
const titles: Record<Key, [string, string]> = {
  overview: [
    "Добрый день, Александр",
    "Вот что происходит в ваших заведениях сегодня",
  ],
  demo: [
    "Демо-центр",
    "Ролевой сценарий, который связывает функции в одну историю",
  ],
  copilot: [
    "Автопилот смены",
    "AI превращает сигналы бизнеса в конкретные действия команды",
  ],
  simulator: [
    "Что-если Lab",
    "Цифровой двойник для проверки решений до запуска",
  ],
  experiments: [
    "Growth experiments",
    "Контрольные группы и доказанный эффект до масштабирования",
  ],
  live: ["Live-центр", "Состояние локации, очереди и события прямо сейчас"],
  outside: [
    "Трафик снаружи",
    "Пешеходный поток, захват входа и влияние погоды",
  ],
  inside: ["Гости и зоны", "Заполненность, тепловые карты и время в зонах"],
  journey: ["Путь гостя", "От первого контакта до заказа и повторного визита"],
  service: [
    "Сервис и столы",
    "Скорость встречи, обслуживания, расчёта и уборки",
  ],
  staff: ["Эффективность команды", "Нагрузка, SLA и возможности для обучения"],
  kitchen: [
    "Кухня и стандарты",
    "Скорость выдачи, безопасность и соблюдение процессов",
  ],
  videoSearch: [
    "AI-поиск по видео",
    "Ищите операционные события обычным языком",
  ],
  profit: ["Profit Guard", "Сопоставление POS и видео для обнаружения потерь"],
  waste: [
    "Waste Vision",
    "Автоматический контроль food waste через камеру и весы",
  ],
  insights: ["AI-инсайты", "Приоритетные рекомендации с оценкой эффекта"],
  forecast: ["Прогноз спроса", "Планирование гостей, выручки, смен и запасов"],
  labor: [
    "Labor и график",
    "Спрос, навыки команды, смены и стоимость часа",
  ],
  prep: [
    "Prep и закупки",
    "Прогноз по блюдам превращается в точный план кухни",
  ],
  safety: [
    "Safety и HACCP",
    "Температуры, гигиена, чек-листы и критические точки",
  ],
  delivery: [
    "Delivery control",
    "Заказы, кухня и курьеры в одном операционном потоке",
  ],
  finance: [
    "Prime cost",
    "Выручка, COGS, labor и контролируемые потери в одной модели",
  ],
  guestAI: ["AI-хост и гости", "Звонки, брони, waitlist, CRM и возврат гостей"],
  reputation: [
    "Отзывы и репутация",
    "Связь обратной связи гостя с реальными операционными событиями",
  ],
  menu: ["QR-меню", "Меню, заказы, апселл и аналитика сканирований"],
  menuEngineering: [
    "Menu engineering",
    "Популярность, маржа и поведение гостя в одной матрице",
  ],
  content: ["Контент-студия", "Плейлисты, расписания и адаптивные промо"],
  screens: [
    "Экраны и планшеты",
    "Удалённое управление устройствами и контентом",
  ],
  alerts: ["События и алерты", "Отклонения, инциденты и реакция команды"],
  reports: ["Отчёты", "Готовые срезы и автоматическая отправка"],
  setup: [
    "Центр настройки",
    "От организации и локации до камеры, зоны и бизнес-метрики",
  ],
  trust: [
    "Качество и происхождение данных",
    "Lineage метрик, источники, model drift и аудит изменений",
  ],
  locations: ["Локации", "Сравнение заведений и региональные показатели"],
  floorplan: [
    "Планы и зоны",
    "Этажи, зоны, объекты и покрытие камер на единой карте",
  ],
  cameras: ["Камеры и зоны", "Источники видео и настройка аналитики"],
  integrations: [
    "Интеграции",
    "Объедините видео, POS, погоду, смены и маркетинг",
  ],
  settings: ["Настройки", "Роли, приватность и параметры аналитики"],
};

function pathForPage(page: Key) {
  return `/${page.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function pageFromPath(pathname: string): Key | null {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  if (!slug) return "overview";
  return (Object.keys(titles) as Key[]).find((key) => pathForPage(key).slice(1) === slug) ?? null;
}

function Trend({ v, good = true }: { v: string; good?: boolean }) {
  return (
    <span className={good ? "trend good" : "trend bad"}>
      {good ? <TrendingUp /> : <TrendingDown />}
      {v}
    </span>
  );
}
function Metric({ label, value, trend, icon: I, tone = "mint" }: any) {
  return (
    <article className="card metric">
      <div className={`metric-ico ${tone}`}>
        <I />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <Trend v={trend} good={!trend.startsWith("−")} />
      </div>
    </article>
  );
}
const metricSets: Record<string, any[]> = {
  overview: [
    ["Гостей сегодня", "1 284", "+12,4%", Users],
    ["Захват с улицы", "18,7%", "+2,1 п.п.", MousePointerClick, "blue"],
    ["Средний чек", "₴486", "+6,8%", Coffee, "amber"],
    ["SLA сервиса", "92,4%", "−3,2%", Timer, "violet"],
  ],
  outside: [
    ["Проходящий поток", "6 842", "+9,1%", Users],
    ["Вошли", "1 284", "+12,4%", Store, "blue"],
    ["Capture rate", "18,7%", "+2,1 п.п.", Target, "amber"],
    ["У витрины", "18 сек", "+3 сек", Timer, "violet"],
  ],
  inside: [
    ["Сейчас внутри", "86", "+14 к среднему", Users],
    ["Средний визит", "1ч 18м", "+9 мин", Timer, "blue"],
    ["Столы заняты", "72%", "+6 п.п.", Utensils, "amber"],
    ["Повторные гости", "31%", "+4,2%", Activity, "violet"],
  ],
  service: [
    ["Первый контакт", "1:18", "+12% лучше", Timer],
    ["До заказа", "6:42", "+38 сек лучше", Coffee, "blue"],
    ["До уборки", "5:31", "+1:08 лучше", PackageCheck, "amber"],
    ["Столов в SLA", "92,4%", "−3,2%", Gauge, "violet"],
  ],
  staff: [
    ["В смене", "12", "+2 к утру", Users],
    ["Гостей / сотрудника", "7,2", "+0,8", Gauge, "blue"],
    ["Активное время", "84%", "+4 п.п.", Activity, "amber"],
    ["Нарушений SLA", "9", "−18%", AlertTriangle, "violet"],
  ],
  kitchen: [
    ["Время блюда", "18:24", "+1:12 лучше", Timer],
    ["В очереди", "14", "+3", ListFilter, "blue"],
    ["SOP compliance", "94,8%", "+2,4%", ShieldCheck, "amber"],
    ["Инцидентов", "2", "−4", AlertTriangle, "violet"],
  ],
  menu: [
    ["Сканирований", "684", "+18,2%", QrCode],
    ["Меню → заказ", "42,8%", "+4,1 п.п.", MousePointerClick, "blue"],
    ["Средний QR-чек", "₴512", "+8,6%", Coffee, "amber"],
    ["Апселл", "₴26 840", "+12,4%", TrendingUp, "violet"],
  ],
  screens: [
    ["Устройств", "24", "+2", Tablet],
    ["Онлайн", "23", "+99,4% uptime", Wifi, "blue"],
    ["Показы", "18 420", "+16%", Eye, "amber"],
    ["Вовлечённость", "12,8%", "+2,6 п.п.", MousePointerClick, "violet"],
  ],
  locations: [
    ["Локаций", "4", "+все активны", Store],
    ["Гостей по сети", "4 728", "+10,6%", Users, "blue"],
    ["Средний capture", "17,8%", "+1,8 п.п.", Target, "amber"],
    ["Network SLA", "90,4%", "+2,1%", Gauge, "violet"],
  ],
};

type LocationSignals = {
  guests: number;
  passers: number;
  capture: string;
  averageCheck: string;
  serviceSla: string;
  inside: number;
  freeSeats: number;
  queue: number;
  occupiedTables: string;
  staff: number;
  qrScans: number;
  screens: number;
  screensOnline: number;
};

const signalsByLocation: Record<string, LocationSignals> = {
  franko: {
    guests: 1284,
    passers: 6842,
    capture: "18,7%",
    averageCheck: "₴486",
    serviceSla: "92,4%",
    inside: 86,
    freeSeats: 14,
    queue: 7,
    occupiedTables: "72%",
    staff: 12,
    qrScans: 684,
    screens: 6,
    screensOnline: 5,
  },
  shevchenka: {
    guests: 1106,
    passers: 6827,
    capture: "16,2%",
    averageCheck: "₴318",
    serviceSla: "95,1%",
    inside: 48,
    freeSeats: 9,
    queue: 3,
    occupiedTables: "75%",
    staff: 8,
    qrScans: 512,
    screens: 4,
    screensOnline: 4,
  },
  dniprovska: {
    guests: 1492,
    passers: 6972,
    capture: "21,4%",
    averageCheck: "₴428",
    serviceSla: "91,6%",
    inside: 104,
    freeSeats: 18,
    queue: 6,
    occupiedTables: "79%",
    staff: 16,
    qrScans: 836,
    screens: 8,
    screensOnline: 8,
  },
  central: {
    guests: 846,
    passers: 5716,
    capture: "14,8%",
    averageCheck: "₴274",
    serviceSla: "87,1%",
    inside: 29,
    freeSeats: 6,
    queue: 5,
    occupiedTables: "68%",
    staff: 6,
    qrScans: 391,
    screens: 3,
    screensOnline: 2,
  },
};

const weatherByLocation: Record<string, { temperature: string; condition: string; uplift: string; forecast: Array<[string, string, string]> }> = {
  franko: { temperature: "+24°", condition: "Ясно", uplift: "+16%", forecast: [["Сейчас", "+24°", "+16%"], ["Пт", "+22°", "+11%"], ["Сб", "+19°", "+4%"], ["Вс", "+15°", "−9%"]] },
  shevchenka: { temperature: "+21°", condition: "Облачно", uplift: "+7%", forecast: [["Сейчас", "+21°", "+7%"], ["Пт", "+18°", "+2%"], ["Сб", "+17°", "−3%"], ["Вс", "+20°", "+5%"]] },
  dniprovska: { temperature: "+27°", condition: "Солнечно", uplift: "+19%", forecast: [["Сейчас", "+27°", "+19%"], ["Пт", "+28°", "+21%"], ["Сб", "+25°", "+14%"], ["Вс", "+23°", "+9%"]] },
  central: { temperature: "+18°", condition: "Дождь", uplift: "−12%", forecast: [["Сейчас", "+18°", "−12%"], ["Пт", "+17°", "−15%"], ["Сб", "+20°", "+3%"], ["Вс", "+21°", "+6%"]] },
};

function signalsFor(location?: VenueLocation) {
  const known = signalsByLocation[location?.id ?? "franko"];
  if (known) return known;
  return {
    guests: 0,
    passers: 0,
    capture: "—",
    averageCheck: "—",
    serviceSla: "—",
    inside: 0,
    freeSeats: location?.capacity ?? 0,
    queue: 0,
    occupiedTables: "—",
    staff: 0,
    qrScans: 0,
    screens: 0,
    screensOnline: 0,
  };
}

function weatherFor(location: VenueLocation) {
  return weatherByLocation[location.id] ?? { temperature: "—", condition: "Нет источника", uplift: "—", forecast: [["Сейчас", "—", "—"]] as Array<[string, string, string]> };
}

function localMetricValue(label: string, location?: VenueLocation) {
  const signal = signalsFor(location);
  const values: Record<string, string> = {
    "Гостей сегодня": signal.guests.toLocaleString("ru-RU"),
    "Проходящий поток": signal.passers.toLocaleString("ru-RU"),
    Вошли: signal.guests.toLocaleString("ru-RU"),
    "Захват с улицы": signal.capture,
    "Capture rate": signal.capture,
    "Средний чек": signal.averageCheck,
    "SLA сервиса": signal.serviceSla,
    "Столов в SLA": signal.serviceSla,
    "Сейчас внутри": String(signal.inside),
    "Столы заняты": signal.occupiedTables,
    "В смене": String(signal.staff),
    Сканирований: signal.qrScans.toLocaleString("ru-RU"),
    Устройств: String(signal.screens),
    Онлайн: String(signal.screensOnline),
  };
  return values[label];
}

function Metrics({ type, location, overrides = {} }: { type: string; location?: VenueLocation; overrides?: Record<string, string> }) {
  return (
    <section className="metrics">
      {(metricSets[type] || metricSets.overview).map((x, i) => (
        <Metric
          key={x[0]}
          label={x[0]}
          value={overrides[x[0]] ?? localMetricValue(x[0], location) ?? x[1]}
          trend={x[2]}
          icon={x[3]}
          tone={x[4]}
        />
      ))}
    </section>
  );
}
function LineChart() {
  return (
    <div className="linechart">
      <div className="chartgrid" />
      <svg viewBox="0 0 680 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#53d6ab" stopOpacity=".35" />
            <stop offset="1" stopColor="#53d6ab" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 130 C45 125 48 92 94 99 S150 142 192 110 S240 55 286 72 S335 109 379 54 S430 30 484 59 S538 92 584 28 S630 54 680 34 L680 160 L0 160Z"
          fill="url(#fill)"
        />
        <path
          d="M0 130 C45 125 48 92 94 99 S150 142 192 110 S240 55 286 72 S335 109 379 54 S430 30 484 59 S538 92 584 28 S630 54 680 34"
          fill="none"
          stroke="#27c593"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div>
        {["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map(
          (x) => (
            <span key={x}>{x}</span>
          ),
        )}
      </div>
    </div>
  );
}
function Bars() {
  let v = [62, 71, 48, 58, 84, 100, 76];
  return (
    <div className="bars">
      {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x, i) => (
        <div key={x}>
          <em>{[421, 458, 336, 397, 612, 704, 523][i]}</em>
          <i style={{ height: `${v[i]}%` }} />
          <span>{x}</span>
        </div>
      ))}
    </div>
  );
}
function Donut({ v = 72 }: { v?: number }) {
  return (
    <div className="donut" style={{ "--v": `${v * 3.6}deg` } as any}>
      <div>
        <strong>{v}%</strong>
        <span>заполнено</span>
      </div>
    </div>
  );
}
function HeatGrid() {
  let vals = [
    2, 3, 3, 4, 4, 2, 2, 4, 5, 6, 5, 3, 3, 5, 7, 8, 7, 5, 4, 6, 8, 7, 6, 4, 5,
    7, 9, 9, 8, 6, 6, 8, 10, 10, 9, 7, 5, 6, 8, 9, 8, 6,
  ];
  return (
    <div className="heatgrid">
      <div className="heat-times">
        {["10", "12", "14", "16", "18", "20"].map((x) => (
          <span key={x}>{x}:00</span>
        ))}
      </div>
      {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, di) => (
        <div key={d}>
          <strong>{d}</strong>
          {vals.slice(di * 6, di * 6 + 6).map((v, i) => (
            <i key={i} style={{ opacity: 0.15 + v * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
function Insight({ tone, title, text, effect, onOpen }: any) {
  let I =
    tone === "warn" ? AlertTriangle : tone === "up" ? TrendingUp : Lightbulb;
  return (
    <article className={`insight ${tone}`}>
      <div>
        <I />
      </div>
      <p>
        <span>
          {tone === "warn"
            ? "ТРЕБУЕТ ВНИМАНИЯ"
            : tone === "up"
              ? "ВОЗМОЖНОСТЬ РОСТА"
              : "РЕКОМЕНДАЦИЯ"}
        </span>
        <strong>{title}</strong>
        <em>{text}</em>
        <button onClick={onOpen}>
          Посмотреть расчёт <ChevronRight />
        </button>
      </p>
      <aside>
        <span>Прогноз эффекта</span>
        <strong>{effect}</strong>
      </aside>
    </article>
  );
}

function Overview({ go, open, location }: any) {
  const signal = signalsFor(location);
  const weather = weatherFor(location);
  return (
    <>
      <ImpactStrip go={go} />
      <Metrics type="overview" location={location} />
      <section className="grid-main">
        <article className="card span2 chart">
          <div className="card-head">
            <div>
              <span>СЕГОДНЯ · {location.name.toUpperCase()}</span>
              <h2>Гостевой поток</h2>
            </div>
            <div className="legend">
              <i /> Сегодня <b /> прошлый четверг
            </div>
          </div>
          <div className="chart-total">
            <strong>{signal.guests.toLocaleString("ru-RU")}</strong>
            <Trend v="+142 гостя" />
            <span>Пик ожидается в 18:40</span>
          </div>
          <LineChart />
        </article>
        <article className="card occupancy">
          <div className="card-head">
            <div>
              <span>ПРЯМО СЕЙЧАС</span>
              <h2>Загрузка зала</h2>
            </div>
            <span className="live">
              <i />
              LIVE
            </span>
          </div>
          <Donut v={Number.parseFloat(signal.occupiedTables)} />
          <div className="occupancy-stats">
            <div>
              <strong>{signal.inside}</strong>
              <span>гостей</span>
            </div>
            <div>
              <strong>{signal.freeSeats}</strong>
              <span>мест</span>
            </div>
            <div>
              <strong>{signal.queue} мин</strong>
              <span>очередь</span>
            </div>
          </div>
          <button className="secondary full" onClick={() => go("live")}>
            Открыть live-центр
          </button>
        </article>
      </section>
      <div className="section-head">
        <div>
          <span>СФОРМИРОВАНО VENUE AI</span>
          <h2>Что стоит сделать сегодня</h2>
        </div>
        <button onClick={() => go("insights")}>
          Все инсайты <ChevronRight />
        </button>
      </div>
      <div className="insights">
        <Insight
          tone="warn"
          title="Провал трафика по средам с 12:00 до 14:00"
          text="Поток ниже среднего на 52%. Запустите lunch-комбо на экранах и в QR-меню."
          effect="+₴18–26 тыс./мес"
          onOpen={open}
        />
        <Insight
          tone="up"
          title="Терраса недоиспользована в тёплую погоду"
          text="При +21°C гости сидят дольше, но зона заполнена лишь на 48%."
          effect="+8,6% к выручке"
          onOpen={open}
        />
        <Insight
          tone="idea"
          title="Усилить смену перед вечерним пиком"
          text="С 18:00 время первого контакта растёт до 4:12. Добавьте официанта с 17:30."
          effect="−27% ожидания"
          onOpen={open}
        />
      </div>
      <section className="triple">
        <article className="card">
          <div className="card-head">
            <div>
              <span>7 ДНЕЙ</span>
              <h2>Поток по дням</h2>
            </div>
            <Filter />
          </div>
          <Bars />
        </article>
        <article className="card">
          <div className="card-head">
            <div>
              <span>СКОРОСТЬ</span>
              <h2>Ключевые этапы</h2>
            </div>
          </div>
          <ProgressRows />
        </article>
        <article className="card weather">
          <div className="card-head">
            <div>
              <span>КОРРЕЛЯЦИЯ</span>
              <h2>Погода × трафик</h2>
            </div>
            <CloudSun />
          </div>
          <div className="weather-now">
            <Sun />
            <strong>{weather.temperature}</strong>
            <span>{weather.condition} · {weather.uplift} трафика</span>
          </div>
          {[
            ["Солнечно, +20…+26°", "+18%"],
            ["Дождь", "−23%"],
            ["Ниже 0°", "−14%"],
          ].map((x) => (
            <div className="weather-row" key={x[0]}>
              <span>{x[0]}</span>
              <b className={x[1].startsWith("−") ? "red" : ""}>{x[1]}</b>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}
function ProgressRows() {
  return (
    <div className="progressrows">
      {[
        ["Встреча гостя", "1:18", 96],
        ["Принятие заказа", "6:42", 91],
        ["Выдача блюда", "18:24", 88],
        ["Расчёт", "4:08", 93],
        ["Уборка стола", "5:31", 86],
      ].map((x) => (
        <div key={x[0] as string}>
          <span>{x[0] as string}</span>
          <strong>{x[1] as string}</strong>
          <i>
            <b style={{ width: `${x[2]}%` }} />
          </i>
          <em>{x[2]}%</em>
        </div>
      ))}
    </div>
  );
}

function Live({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  const cams = ["Вход · улица", "Главный зал", "Бар и очередь", "Кухня · pass", "Терраса", "Выдача и pickup", "Служебный вход"].slice(0, location.cameras);
  const [cam, setCam] = useState(0);
  const [grid, setGrid] = useState(false);
  const selectedOnline = cam < location.online;
  return (
    <section className="live-layout">
      <article className="card camera">
        <div className="card-head">
          <div>
            <span className="live">
              <i />
              {selectedOnline ? "LIVE" : "LAST FRAME"}
            </span>
            <h2>{cams[cam]}</h2>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setGrid((value) => !value);
              notify(grid ? "Открыта выбранная камера" : "Открыта сетка камер 2×2");
            }}
          >
            <Grid2X2 />
            {grid ? "Одна камера" : "Сетка 2×2"}
          </button>
        </div>
        <div className={`video-scene ${grid ? "quad" : ""}`}>
          {grid ? (
            <div className="camera-quad">
              {cams.map((name, index) => (
                <button
                  className={cam === index ? "active" : ""}
                  key={name}
                  onClick={() => {
                    setCam(index);
                    setGrid(false);
                  }}
                >
                  <Video />
                  <strong>{name}</strong>
                  <span>CAM-0{index + 1} · {index < location.online ? "LIVE" : "OFFLINE"}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="zone z1" />
              <div className="zone z2" />
              {selectedOnline && [1, 2, 3, 4, 5, 6].map((x) => (
                <i key={x} className={`person p${x}`} />
              ))}
              <span>CAM-0{cam + 1} · {location.name} · 1080p</span>
              <em>21:14:36</em>
            </>
          )}
        </div>
        <div className="video-controls">
          <Play />
          <i>
            <b />
          </i>
          <span>{selectedOnline ? "LIVE" : "OFFLINE"}</span>
          <Eye />
        </div>
      </article>
      <aside>
        <article className="card">
          <div className="card-head">
            <h2>Камеры</h2>
            <span className={location.online === location.cameras ? "status ok" : "status bad"}>{location.online}/{location.cameras} онлайн</span>
          </div>
          <div className="camlist">
            {cams.map((x, i) => (
              <button
                className={cam === i ? "active" : ""}
                onClick={() => {
                  setCam(i);
                  setGrid(false);
                }}
                key={x}
              >
                <Video />
                <p>
                  <strong>{x}</strong>
                  <span>
                    {
                      [
                        "184 прохожих/ч",
                        "72 гостя · 84%",
                        "9 в очереди · 8 мин",
                        "Kitchen pass · 18:24",
                        "18 гостей · 48%",
                        "Pickup SLA · 4:12",
                        "Access events · 3",
                      ][i] ?? "Health 96 · поток стабилен"
                    }
                  </span>
                </p>
                <i className={i < location.online ? "" : "offline"} />
              </button>
            ))}
          </div>
        </article>
        <article className="card">
          <div className="card-head">
            <h2>Live-события</h2>
            <ListFilter />
          </div>
          <div className="events">
            {[
              ["21:12", "Очередь выше нормы", "Бар · 9 гостей"],
              ["21:07", "Стол ждёт уборки", "Стол 14 · 8:12"],
              ["20:58", "SLA первого контакта", "Зона B · 4:36"],
            ].map((x) => (
              <div key={x[0]}>
                <i />
                <time>{x[0]}</time>
                <p>
                  <strong>{x[1]}</strong>
                  <span>{x[2]}</span>
                </p>
              </div>
            ))}
          </div>
        </article>
      </aside>
    </section>
  );
}

function Outside({ location, notify, period, onPeriodChange }: { location: VenueLocation; notify: (text: string) => void; period: string; onPeriodChange: (period: string) => void }) {
  const signal = signalsFor(location);
  const weather = weatherFor(location);
  const funnel: Array<[string, number, string]> = [
    ["Прошли мимо", signal.passers, "100%"],
    ["Замедлились", Math.round(signal.passers * 0.318), "31,8%"],
    ["Посмотрели витрину", Math.round(signal.passers * 0.218), "21,8%"],
    ["Вошли", signal.guests, signal.capture],
  ];
  return (
    <>
      <Metrics type="outside" location={location} />
      <section className="grid-main">
        <article className="card span2 chart">
          <div className="card-head">
            <div>
              <span>ПОЧАСОВОЙ СРЕЗ · {location.name.toUpperCase()}</span>
              <h2>Улица → вход</h2>
            </div>
            <Tabs value={period} onChange={onPeriodChange} />
          </div>
          <div className="chart-total">
            <strong>{signal.capture}</strong>
            <span>средний захват входа</span>
            <Trend v="лучше сети на 3,2 п.п." />
          </div>
          <LineChart />
        </article>
        <article className="card weather">
          <div className="card-head">
            <div>
              <span>ПРОГНОЗ</span>
              <h2>Влияние погоды</h2>
            </div>
            <ThermometerSun />
          </div>
          {weather.forecast.map((x) => (
            <div className="forecast-row" key={x[0]}>
              <span>{x[0]}</span>
              <Sun />
              <strong>{x[1]}</strong>
              <em className={x[2].startsWith("−") ? "red" : ""}>{x[2]}</em>
            </div>
          ))}
        </article>
      </section>
      <section className="two">
        <article className="card">
          <div className="card-head">
            <div>
              <span>ПО ЧАСАМ И ДНЯМ</span>
              <h2>Карта интенсивности</h2>
            </div>
            <button
              className="secondary"
              onClick={() => notify("Фильтр часов, дней и погоды открыт")}
            >
              <Filter />
              Фильтры
            </button>
          </div>
          <HeatGrid />
        </article>
        <article className="card">
          <div className="card-head">
            <div>
              <span>КОНВЕРСИЯ ФАСАДА</span>
              <h2>Воронка входа</h2>
            </div>
          </div>
          <div className="funnel">
            {funnel.map((x, i) => (
              <div style={{ width: `${100 - i * 12}%` }} key={x[0]}>
                <span>{x[0]}</span>
                <strong>{x[1].toLocaleString("ru-RU")}</strong>
                <em>{x[2]}</em>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
function Tabs({ value, onChange }: { value?: string; onChange?: (period: string) => void }) {
  const [localActive, setLocalActive] = useState("Сегодня");
  const active = value ?? localActive;
  return (
    <div className="tabs">
      {["Сегодня", "7 дней", "30 дней", "90 дней"].map((period) => (
        <button
          className={active === period ? "active" : ""}
          key={period}
          onClick={() => {
            setLocalActive(period);
            onChange?.(period);
          }}
        >
          {period}
        </button>
      ))}
    </div>
  );
}

function Inside({ location, period, onPeriodChange }: { location: VenueLocation; period: string; onPeriodChange: (period: string) => void }) {
  return (
    <>
      <Metrics type="inside" location={location} />
      <section className="two wide">
        <article className="card">
          <div className="card-head">
            <div>
              <span>{location.name.toUpperCase()} · ГЛАВНЫЙ ЗАЛ · СЕГОДНЯ</span>
              <h2>Тепловая карта активности</h2>
            </div>
            <Tabs value={period} onChange={onPeriodChange} />
          </div>
          <div className="floor">
            <span>ВХОД</span>
            {Array.from({ length: 12 }).map((_, i) => (
              <b className={`table t${i}`} key={i}>
                {i + 1}
              </b>
            ))}
            {[1, 2, 3, 4].map((x) => (
              <i className={`blob h${x}`} key={x} />
            ))}
          </div>
        </article>
        <article className="card">
          <div className="card-head">
            <div>
              <span>ПРОСТРАНСТВО</span>
              <h2>Эффективность зон</h2>
            </div>
          </div>
          <div className="zonelist">
            {[
              ["Главный зал", "84%", "1:24", "+12%"],
              ["Терраса", "48%", "1:52", "+4%"],
              ["Бар", "91%", "0:38", "−3%"],
              ["У окна", "76%", "1:31", "+9%"],
            ].map((x, i) => (
              <div key={x[0]}>
                <i className={`zc${i}`} />
                <p>
                  <strong>{x[0]}</strong>
                  <span>
                    {x[1]} занято · визит {x[2]}
                  </span>
                </p>
                <em className={x[3].startsWith("−") ? "red" : ""}>{x[3]}</em>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function Journey({ location }: { location: VenueLocation }) {
  const signal = signalsFor(location);
  const [audience, setAudience] = useState("Все гости");
  let stages = [
    [MapPin, "Прошли рядом", signal.passers.toLocaleString("ru-RU"), "100%"],
    [Store, "Вошли", signal.guests.toLocaleString("ru-RU"), signal.capture],
    [Utensils, "Сели", Math.round(signal.guests * 0.861).toLocaleString("ru-RU"), "86,1%"],
    [QrCode, "Открыли QR", Math.round(signal.guests * 0.398).toLocaleString("ru-RU"), "46,2%"],
    [Coffee, "Заказали", Math.round(signal.guests * 0.79).toLocaleString("ru-RU"), "91,7%"],
    [Activity, "Вернутся", Math.round(signal.guests * 0.226).toLocaleString("ru-RU"), "28,6%"],
  ];
  return (
    <>
      <Metrics type="outside" location={location} />
      <article className="card journey">
        <div className="card-head">
          <div>
            <span>{signal.passers.toLocaleString("ru-RU")} АНОНИМНЫХ ТРЕКОВ · {location.name.toUpperCase()}</span>
            <h2>Воронка гостевого пути</h2>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setAudience((value) =>
                value === "Все гости"
                  ? "Новые гости"
                  : value === "Новые гости"
                    ? "Повторные гости"
                    : "Все гости",
              )
            }
          >
            <Filter />
            {audience}
          </button>
        </div>
        <div className="journeyflow">
          {stages.map(([I, l, v, p]: any, i) => (
            <div key={l}>
              <div>
                <I />
                <span>{l}</span>
                <strong>{v}</strong>
                <em>{p}</em>
              </div>
              {i < 5 && <ChevronRight />}
            </div>
          ))}
        </div>
      </article>
      <section className="two">
        <article className="card">
          <div className="card-head">
            <h2>Популярные маршруты</h2>
          </div>
          <Rows
            data={[
              ["Вход → стол → QR → заказ", "41%", "32 мин"],
              ["Вход → бар → стол → заказ", "29%", "18 мин"],
              ["Вход → стол → официант", "21%", "26 мин"],
              ["Вход → выход без заказа", "8%", "4 мин"],
            ]}
          />
        </article>
        <article className="card">
          <div className="card-head">
            <h2>Точки потери</h2>
          </div>
          <div className="loss">
            <AlertTriangle />
            <p>
              <strong>8,1% уходят без заказа</strong>
              <span>Чаще при ожидании меню более 7 минут</span>
            </p>
            <TrendingDown />
            <p>
              <strong>14% QR-сессий без действия</strong>
              <span>Категория «Сезонное» слишком низко</span>
            </p>
          </div>
        </article>
      </section>
    </>
  );
}
function Rows({ data }: { data: string[][] }) {
  return (
    <div className="rows">
      {data.map((x) => (
        <div key={x[0]}>
          <span>{x[0]}</span>
          <strong>{x[1]}</strong>
          <em>{x[2]}</em>
        </div>
      ))}
    </div>
  );
}

function Service({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [resolvedTasks, setResolvedTasks] = useState<number[]>([]);
  return (
    <>
      <Metrics type="service" location={location} />
      <section className="two wide">
        <article className="card">
          <div className="card-head">
            <div>
              <span>LIVE · 20 СТОЛОВ</span>
              <h2>Карта сервиса</h2>
            </div>
            <div className="legend">
              <i /> норма <i className="amber" /> ожидание{" "}
              <i className="redbg" /> SLA
            </div>
          </div>
          <div className="service-tables">
            {Array.from({ length: 20 }).map((_, i) => {
              let c =
                i % 7 === 0
                  ? "alert"
                  : i % 4 === 0
                    ? "wait"
                    : i % 6 === 0
                      ? "free"
                      : "ok";
              return (
                <button
                  className={`${c} ${selectedTable === i ? "selected" : ""}`}
                  key={i}
                  onClick={() => {
                    setSelectedTable(i);
                    notify(`Открыта карточка стола ${i + 1} · ${location.name}`);
                  }}
                >
                  <span>Стол {i + 1}</span>
                  <strong>
                    {c === "alert" ? "12:48" : c === "wait" ? "04:16" : "01:22"}
                  </strong>
                  <em>
                    {c === "free"
                      ? "свободен"
                      : c === "alert"
                        ? "реакция"
                        : "обслуживание"}
                  </em>
                </button>
              );
            })}
          </div>
        </article>
        <article className="card">
          <div className="card-head">
            <h2>Очередь задач</h2>
            <span className="count">{6 - resolvedTasks.length}</span>
          </div>
          <div className="tasks">
            {[
              ["Стол 8", "Ожидает расчёт", "7:42"],
              ["Стол 15", "Нужна уборка", "9:18"],
              ["Стол 11", "Ожидает заказ", "5:26"],
              ["Стол 3", "Проверить гостя", "3:14"],
            ].map((x, i) => (
              <button
                className={`${i < 2 ? "urgent" : ""} ${resolvedTasks.includes(i) ? "resolved" : ""}`}
                key={x[0]}
                onClick={() => {
                  setResolvedTasks((current) =>
                    current.includes(i) ? current : [...current, i],
                  );
                  notify(`${x[0]}: задача принята в работу`);
                }}
              >
                <i />
                <p>
                  <strong>
                    {x[0]} · {x[1]}
                  </strong>
                  <span>{x[2]}</span>
                </p>
                <ChevronRight />
              </button>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function Staff({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  let data = [
    ["Мария К.", "Официант", "96", "18", "₴14 820"],
    ["Андрей С.", "Официант", "91", "16", "₴13 440"],
    ["Ирина П.", "Официант", "88", "21", "₴12 980"],
    ["Денис Т.", "Бармен", "94", "42", "₴18 210"],
    ["София М.", "Хостес", "97", "63", "—"],
  ];
  return (
    <>
      <Metrics type="staff" location={location} />
      <DataCard
        notify={notify}
        title="Текущая смена"
        heads={[
          "Сотрудник",
          "Service score",
          "Столов / контактов",
          "Продажи",
          "Статус",
        ]}
        rows={data}
      />
      <section className="two">
        <article className="card">
          <div className="card-head">
            <h2>Нагрузка по часам</h2>
          </div>
          <Bars />
        </article>
        <article className="card">
          <div className="card-head">
            <h2>Coaching opportunities</h2>
            <Bot />
          </div>
          <div className="coaching">
            <div>
              <i>1</i>
              <p>
                <strong>Сократить путь Андрея между зонами</strong>
                <span>32% времени уходит на перемещения</span>
              </p>
            </div>
            <div>
              <i>2</i>
              <p>
                <strong>Подсказка по апселлу для Ирины</strong>
                <span>Допродажи на 18% ниже команды</span>
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
function DataCard({ title, heads, rows, notify }: any) {
  return (
    <article className="card datacard">
      <div className="card-head">
        <div>
          <span>ОБНОВЛЕНО 5 МИН НАЗАД</span>
          <h2>{title}</h2>
        </div>
        <button
          className="secondary"
          onClick={() => notify?.(`Экспорт «${title}» подготовлен`)}
        >
          <Download />
          Экспорт
        </button>
      </div>
      <div className="datatable">
        <div className="tr th">
          {heads.map((h: string) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        {rows.map((r: string[], i: number) => (
          <div className="tr" key={r[0]}>
            <span className="who">
              <i>
                {r[0]
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </i>
              <p>
                <strong>{r[0]}</strong>
                <em>{r[1]}</em>
              </p>
            </span>
            <span>
              <b className="score">{r[2]}</b>
            </span>
            <span>{r[3]}</span>
            <span>
              <strong>{r[4]}</strong>
            </span>
            <span>
              <span className={i === 2 ? "status warn" : "status ok"}>
                {i === 2 ? "Перегрузка" : "В норме"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function Kitchen({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  return (
    <>
      <Metrics type="kitchen" location={location} />
      <section className="two">
        <article className="card">
          <div className="card-head">
            <div>
              <span>СЕГОДНЯ</span>
              <h2>Скорость кухни</h2>
            </div>
          </div>
          <ProgressRows />
        </article>
        <article className="card">
          <div className="card-head">
            <h2>Контроль стандартов</h2>
          </div>
          <div className="compliance">
            {[
              ["Перчатки", "98%"],
              ["Головные уборы", "96%"],
              ["Мытьё рук", "92%"],
              ["Чистота проходов", "99%"],
              ["Температурный журнал", "91%"],
              ["Cold zone", "97%"],
            ].map((x) => (
              <div key={x[0]}>
                <ShieldCheck />
                <span>{x[0]}</span>
                <strong>{x[1]}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
      <article className="card incidents">
        <div className="card-head">
          <h2>Последние отклонения</h2>
          <button onClick={() => notify("Открыт журнал отклонений кухни")}>
            Журнал <ChevronRight />
          </button>
        </div>
        {[
          ["19:42", "Зона пасса перегружена", "6 блюд ожидали более 4 минут"],
          [
            "17:16",
            "Проход к cold zone перекрыт",
            "Объект в проходе 2 мин 18 сек",
          ],
        ].map((x) => (
          <div key={x[0]}>
            <AlertTriangle />
            <time>{x[0]}</time>
            <p>
              <strong>{x[1]}</strong>
              <span>{x[2]}</span>
            </p>
            <button
              className="secondary"
              onClick={() => notify(`Открыт доказательный фрагмент · ${x[0]}`)}
            >
              <Play />
              Фрагмент
            </button>
          </div>
        ))}
      </article>
    </>
  );
}

function Insights({ open, notify, period, onPeriodChange }: any) {
  return (
    <>
      <div className="ai-banner">
        <Sparkles />
        <p>
          <span>Venue AI проанализировал</span>
          <strong>4 локации · 168 часов видео · 38 240 событий</strong>
        </p>
        <em>Обновлено 12 минут назад</em>
      </div>
      <div className="filterbar">
        <Tabs value={period} onChange={onPeriodChange} />
        <button className="secondary" onClick={() => notify("Показаны инсайты высокого приоритета")}>
          <ListFilter />
          Приоритет
        </button>
      </div>
      <div className="insights large">
        <Insight
          tone="warn"
          title="Среда и четверг, 12:00–14:00: спад потока на 52%"
          text="Запустите lunch-комбо за ₴249 на фасадном экране и в QR-меню."
          effect="+₴18–26 тыс./мес"
          onOpen={open}
        />
        <Insight
          tone="up"
          title="Персонализировать промо на экранах по погоде"
          text="Холодные напитки конвертируют на 22% лучше при +23°C."
          effect="+6,4% к чеку"
          onOpen={open}
        />
        <Insight
          tone="idea"
          title="Изменить расстановку столов в зоне B"
          text="Столы B7–B10 имеют на 31% меньшую загрузку из-за узкого прохода."
          effect="+14 мест/день"
          onOpen={open}
        />
        <Insight
          tone="warn"
          title="Ускорить уборку столов после 18:00"
          text="Медиана уборки растёт с 4:12 до 8:06 и создаёт очередь."
          effect="−11 мин ожидания"
          onOpen={open}
        />
      </div>
    </>
  );
}
function Forecast({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  const [applied, setApplied] = useState(false);
  const signal = signalsFor(location);
  return (
    <>
      <article className="card forecast-hero">
        <div>
          <span>ПРОГНОЗ НА ПЯТНИЦУ · ТОЧНОСТЬ 91%</span>
          <h2>Ожидаем {Math.round(signal.guests * 1.14).toLocaleString("ru-RU")} гостей</h2>
          <p>
            На 14% выше средней пятницы. Факторы: +23°C и ясно, концерт в 600 м,
            начало месяца.
          </p>
          <div>
            <b>
              <Sun />
              Погода +8%
            </b>
            <b>
              <MapPin />
              События +5%
            </b>
            <b>
              <CalendarDays />
              Календарь +3%
            </b>
          </div>
        </div>
        <Donut v={91} />
      </article>
      <Metrics type="overview" location={location} />
      <section className="two">
        <article className="card chart">
          <div className="card-head">
            <h2>Почасовой прогноз</h2>
          </div>
          <LineChart />
        </article>
        <article className="card">
          <div className="card-head">
            <h2>План смены</h2>
          </div>
          <Rows
            data={[
              ["10:00–12:00", "6 чел.", "Низкая"],
              ["12:00–15:00", "11 чел.", "Средняя"],
              ["15:00–18:00", "9 чел.", "Средняя"],
              ["18:00–22:00", "15 чел.", "Пиковая"],
              ["22:00–00:00", "8 чел.", "Средняя"],
            ]}
          />
          <button
            className="primary full"
            onClick={() => {
              setApplied(true);
              notify("План смены передан в Labor planner на подтверждение");
            }}
          >
            {applied ? <><Check /> Передано в расписание</> : "Применить к расписанию"}
          </button>
        </article>
      </section>
    </>
  );
}

function QRMenu({ location, notify }: { location: VenueLocation; notify: (text: string) => void }) {
  const hasPos = location.connectedSources?.includes("Poster POS") ?? false;
  const [dishes, setDishes] = useState([
    ["Гарбузовий крем-суп", "₴189", "14,2%", "Основное"],
    ["Телятина з трюфельним пюре", "₴389", "11,8%", "Основное"],
    ["Салат з печеним буряком", "₴219", "10,4%", "Основное"],
    ["Lunch combo", "₴249", "—", "Завтраки"],
    ["Баскський чізкейк", "₴179", "9,7%", "Десерты"],
  ]);
  const [on, setOn] = useState(hasPos ? [true, true, true, false, true] : [false, false, false, false, false]);
  const [category, setCategory] = useState(hasPos ? "Все 42" : "Черновики");
  const [preview, setPreview] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", category: "Основное", price: "249", sku: "POS-", tax: "20%", allergens: "" });
  const [itemError, setItemError] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [phoneCategory, setPhoneCategory] = useState("Популярное");
  const publishedDishes = dishes.filter((_, index) => on[index]);
  const phoneDishes = publishedDishes.filter((dish) => (phoneCategory === "Популярное" || dish[3] === phoneCategory) && dish[0].toLocaleLowerCase().includes(phoneSearch.trim().toLocaleLowerCase()));
  const visibleDishRows = dishes.map((dish, index) => ({ dish, index })).filter(({ dish, index }) => category === "Все 42" || category === "Черновики" || (category === "Популярное" ? index < 3 : dish[3] === category));
  const createItem = () => {
    const price = Number(itemForm.price);
    if (itemForm.name.trim().length < 3) { setItemError("Укажите название позиции минимум из 3 символов."); return; }
    if (!Number.isFinite(price) || price <= 0) { setItemError("Цена должна быть больше нуля."); return; }
    if (!itemForm.sku.trim() || itemForm.sku.trim() === "POS-") { setItemError("Укажите POS SKU — без него стоп-лист и продажи не синхронизируются."); return; }
    setDishes((current) => [[itemForm.name.trim(), `₴${price}`, "новая", itemForm.category], ...current]); setOn((current) => [false, ...current]); setItemOpen(false); setItemError(""); notify(`${itemForm.name.trim()} создана как выключенный черновик · POS ${itemForm.sku}`);
  };
  return (
    <>
      <Metrics type="menu" location={location} overrides={!hasPos ? { Сканирований: "0", "Меню → заказ": "—", "Средний QR-чек": "—", Апселл: "—" } : {}} />
      {!hasPos && <div className="action-banner warning"><AlertTriangle /><p><strong>QR-меню работает как черновик</strong><span>Poster POS не сопоставлен с {location.name}: публикация, цены и стоп-лист заблокированы.</span></p><button className="secondary" onClick={() => notify("Откройте «Интеграции» → Poster POS и сопоставьте внешнюю локацию")}>Что подключить</button></div>}
      <section className="menu-layout">
        <article className="card menu-editor">
          <div className="card-head">
            <div>
              <span>ОСНОВНОЕ · UA</span>
              <h2>Позиции и доступность</h2>
            </div>
            <button
              className="primary"
              onClick={() => setItemOpen(true)}
            >
              + Добавить
            </button>
          </div>
          <div className="menutabs">
            {[hasPos ? "Все 42" : "Черновики", "Популярное", "Завтраки", "Основное", "Напитки", "Десерты"].map((item) => (
              <button
                className={category === item ? "active" : ""}
                key={item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="dishes">
            {visibleDishRows.map(({ dish: x, index: i }) => (
              <div key={x[0]}>
                <div className={`dish d${i}`}>
                  <Coffee />
                </div>
                <p>
                  <strong>{x[0]}</strong>
                  <span>
                    {x[1]} · конверсия {x[2]}
                  </span>
                </p>
                <label className="switch">
                  <input
                    aria-label={`${on[i] ? "Скрыть" : "Опубликовать"} позицию ${x[0]}`}
                    type="checkbox"
                    checked={on[i]}
                    onChange={() => { if (!hasPos && !on[i]) { notify("Публикация заблокирована: сначала подключите Poster POS и location mapping"); return; } setOn((a) => a.map((v, j) => (j === i ? !v : v))); }}
                  />
                  <i />
                </label>
                <button className="icon" aria-label={`Действия с позицией ${x[0]}`} onClick={() => notify(`Действия «${x[0]}»: редактирование, дублирование и архив доступны в production`)}><MoreHorizontal /></button>
              </div>
            ))}
          </div>
        </article>
        <aside className="phonebox">
          <div className="phone">
            <span className="notch" />
            <div className="qrbrand">
              <strong>{location.name.split(",")[0].toUpperCase()}</strong>
              <span>{location.format.toLowerCase()} · {location.city}</span>
              {cartCount > 0 && <b className="phone-cart">Корзина · {cartCount}</b>}
            </div>
            <label className="phonesearch"><Search /><input aria-label="Поиск в гостевом меню" value={phoneSearch} onChange={(event) => setPhoneSearch(event.target.value)} placeholder="Поиск в меню" /></label>
            <div className="phonecats">
              {["Популярное", "Основное", "Напитки"].map((item) => <button className={phoneCategory === item ? "active" : ""} key={item} onClick={() => setPhoneCategory(item)}>{item}</button>)}
            </div>
            <div className={`phonepromo ${hasPos ? "" : "draft"}`}>
              <span>{hasPos ? "LUNCH TIME" : "DRAFT PREVIEW"}</span>
              <strong>{hasPos ? "Комбо за ₴249" : "Публикация закрыта"}</strong>
              <button onClick={() => notify(hasPos ? "Lunch combo открыто в гостевом меню" : "Промо недоступно: сначала подключите POS и опубликуйте позиции")}>{hasPos ? "Смотреть" : "Что нужно"}</button>
            </div>
            <h4>Популярное сегодня</h4>
            {phoneDishes.length === 0 && <div className="phone-empty"><Coffee /><span>{publishedDishes.length ? "Ничего не найдено" : "Нет опубликованных позиций"}</span><small>{publishedDishes.length ? "Измените запрос." : "Это честный preview черновика."}</small></div>}
            {phoneDishes.slice(0, 2).map((x, i) => (
              <div className="phonedish" key={x[0]}>
                <div className={`dish d${i}`} />
                <p>
                  <strong>{x[0]}</strong>
                  <span>{x[1]}</span>
                </p>
                <button aria-label={`Добавить ${x[0]} в корзину`} onClick={() => { setCartCount((value) => value + 1); notify(`${x[0]} добавлено в демо-корзину`); }}>+</button>
              </div>
            ))}
          </div>
          <button className="secondary full" onClick={() => setPreview(true)}>
            <Eye />
            Открыть гостевой preview
          </button>
        </aside>
      </section>
      {preview && (
        <div className="modalback" onMouseDown={() => setPreview(false)}>
          <div className="modal qr-preview-modal" role="dialog" aria-modal="true" aria-labelledby="qr-preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <button onClick={() => setPreview(false)} aria-label="Закрыть preview"><X /></button>
            <div className="qr-preview-code"><QrCode /></div>
            <span>ГОСТЕВАЯ ССЫЛКА · {location.name.toUpperCase()}</span>
            <h2 id="qr-preview-title">QR-меню готово к просмотру</h2>
            <p>{hasPos ? "Украинский · 42 позиции · стоп-лист синхронизирован с Poster 4 минуты назад." : "Preview черновика · POS и стоп-лист ещё не подключены · публикация недоступна."}</p>
            <div className="modalactions">
              <button className="secondary" onClick={() => { setCopied(true); notify(`Гостевая ссылка ${location.name} скопирована в демо`); }}>{copied ? "Скопировано" : "Скопировать ссылку"}</button>
              <button className="primary" onClick={() => { setPreview(false); notify("Гостевой preview открыт в режиме телефона"); }}>Открыть меню</button>
            </div>
          </div>
        </div>
      )}
      {itemOpen && <div className="modalback" onMouseDown={() => setItemOpen(false)}><div className="modal menu-item-modal" role="dialog" aria-modal="true" aria-labelledby="menu-item-title" onMouseDown={(event) => event.stopPropagation()}><button onClick={() => setItemOpen(false)} aria-label="Закрыть создание позиции"><X /></button><div className="modalico"><Coffee /></div><span>QR MENU · {location.name.toUpperCase()}</span><h2 id="menu-item-title">Новая позиция меню</h2><p>Позиция создаётся выключенной. Для публикации нужны POS SKU, цена, категория, налог и проверка аллергенов.</p><div className="menu-item-grid"><label className="wide">Название *<input required minLength={3} value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Например, сезонный раф" /></label><label>Категория *<select required value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}><option>Завтраки</option><option>Основное</option><option>Напитки</option><option>Десерты</option></select></label><label>Цена, ₴ *<input required type="number" min="1" max="10000" value={itemForm.price} onChange={(event) => setItemForm((current) => ({ ...current, price: event.target.value }))} /></label><label>POS SKU *<input required value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} /></label><label>Налог<select value={itemForm.tax} onChange={(event) => setItemForm((current) => ({ ...current, tax: event.target.value }))}><option>20%</option><option>14%</option><option>7%</option><option>0%</option></select></label><label className="wide">Аллергены<input value={itemForm.allergens} onChange={(event) => setItemForm((current) => ({ ...current, allergens: event.target.value }))} placeholder="Молоко, глютен, орехи…" /></label></div>{itemError && <div className="sys-form-error" role="alert"><AlertTriangle />{itemError}</div>}<div className="modalactions"><button className="secondary" onClick={() => setItemOpen(false)}>Отмена</button><button className="primary" onClick={createItem}>Создать черновик</button></div></div></div>}
    </>
  );
}

const screenTemplates = [
  ["Экран фасад", "Samsung 55″", "Lunch boost", "1 этаж", "Вход", "SCREEN-01"],
  ["Планшет вход", "iPad 10.2″", "Queue & welcome", "1 этаж", "Вход", "SCREEN-02"],
  ["Menu board 1", "LG 43″", "Main menu", "1 этаж", "Бар и очередь", "SCREEN-03"],
  ["Menu board 2", "LG 43″", "Drinks", "1 этаж", "Бар и очередь", "SCREEN-04"],
  ["Терраса", "Galaxy Tab A8", "Fallback menu", "1 этаж", "Терраса", "SCREEN-05"],
  ["Экран команды", "Philips 32″", "Shift dashboard", "1 этаж", "Кухня", "SCREEN-06"],
  ["Pickup screen", "Samsung 43″", "Order status", "1 этаж", "Выдача", "SCREEN-07"],
  ["Drive-through", "LG 49″", "Dynamic menu", "1 этаж", "Касса", "SCREEN-08"],
];

function contentTargetsFor(location: VenueLocation) {
  const seeded = location.demoSeeded ? screenTemplates.slice(0, signalsFor(location).screens).map((item) => item[0]) : [];
  return [...new Set([...seeded, ...(location.configuredScreens ?? []).map((item) => item.name)])];
}

function Content({ notify, location }: { notify: (text: string) => void; location: VenueLocation }) {
  const targetDevices = contentTargetsFor(location);
  const [active, setActive] = useState(0);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleCount, setRuleCount] = useState(location.demoSeeded ? 3 : 0);
  const starterPlaylist = location.demoSeeded ? "Lunch boost" : "Welcome starter";
  const [ruleForm, setRuleForm] = useState({ signal: "Температура", operator: "выше", threshold: "23", secondary: "Occupancy террасы < 60%", playlist: starterPlaylist, targets: targetDevices.length ? `Все устройства · ${targetDevices.length}` : "", fallback: starterPlaylist });
  const [ruleError, setRuleError] = useState("");
  const [list, setList] = useState(() => location.demoSeeded ? [
    ["Lunch boost", "11:30–14:30", "8 экранов"],
    ["Evening mood", "18:00–23:00", "12 экранов"],
    ["Rainy day", "Условие: дождь", "6 экранов"],
    ["Weekend brunch", "Сб–Вс · 09:00", "9 экранов"],
  ] : [["Welcome starter", "Черновик", "0 экранов"]]);
  const [clipsByPlaylist, setClipsByPlaylist] = useState<Record<number, string[]>>(() => location.demoSeeded ? {
    0: ["Lunch combo · 12 сек", "Chef’s choice · 10 сек", "Cold drinks · 10 сек"],
    1: ["Evening ambience · 18 сек", "Dessert pairing · 12 сек"],
    2: ["Rainy day offer · 15 сек"],
    3: ["Weekend brunch · 20 сек"],
  } : { 0: [] });
  const activeClips = clipsByPlaylist[active] ?? [];
  return (
    <>
      <div className="action-banner">
        <MonitorPlay />
        <p>
          <strong>Контент реагирует на данные</strong>
          <span>
            {location.name}: меняйте промо по погоде, загрузке, времени и наличию блюд · {ruleCount} smart-правила.
          </span>
        </p>
        <button className="primary" onClick={() => setRuleOpen(true)}>Создать smart-правило</button>
      </div>
      <section className="content-grid">
        <article className="card">
          <div className="card-head">
            <h2>Плейлисты</h2>
            <button
              className="primary"
              onClick={() => {
                const nextIndex = list.length;
                setList((current) => [...current, ["Новый плейлист", "Черновик", "0 экранов"]]);
                setClipsByPlaylist((current) => ({ ...current, [nextIndex]: [] }));
                setActive(nextIndex);
                notify("Создан новый плейлист-черновик");
              }}
            >
              + Новый
            </button>
          </div>
          <div className="playlists">
            {list.map((x, i) => (
              <button
                className={active === i ? "active" : ""}
                onClick={() => setActive(i)}
                key={x[0]}
              >
                <div className={`cover c${i}`}>
                  <Play />
                </div>
                <p>
                  <strong>{x[0]}</strong>
                  <span>
                    {x[1]} · {x[2]}
                  </span>
                </p>
                <span className={i === 0 ? "status ok" : "status"}>
                  {i === 0 ? "Активен" : "Запланирован"}
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </article>
        <article className="card content-editor">
          <div className="card-head">
            <div>
              <span>РЕДАКТОР</span>
              <h2>{list[active][0]}</h2>
            </div>
            <button className="secondary" aria-disabled={activeClips.length === 0} onClick={() => notify(activeClips.length ? `Плейлист «${list[active][0]}» сохранён · ${activeClips.length} клипа` : "Сохранение заблокировано: добавьте хотя бы один клип")}>Сохранить</button>
          </div>
          <div className="screenpreview">
            <span>{activeClips.length ? list[active][1].toUpperCase() : "DRAFT · NO MEDIA"}</span>
            <strong>{list[active][0]}</strong>
            <b>{activeClips.length ? `${activeClips.length} clips` : "Добавьте контент"}</b>
          </div>
          <div className="clips">
            {activeClips.length === 0 && <div className="content-empty-clips"><MonitorPlay /><p><strong>Плейлист пуст</strong><span>Добавьте demo-клип, прежде чем назначать его экрану или smart-rule.</span></p></div>}
            {activeClips.map((x, i) => (
              <div key={x}>
                <i>{i + 1}</i>
                <p>
                  <strong>{x}</strong>
                  <span>media item · demo</span>
                </p>
              </div>
            ))}
            <button className="secondary" onClick={() => { const name = `Demo clip ${activeClips.length + 1} · 12 сек`; setClipsByPlaylist((current) => ({ ...current, [active]: [...(current[active] ?? []), name] })); notify(`${name} добавлен в «${list[active][0]}»`); }}>+ Добавить demo-клип</button>
          </div>
        </article>
      </section>
      {ruleOpen && (
        <div className="modalback" onMouseDown={() => setRuleOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="content-rule-title" onMouseDown={(event) => event.stopPropagation()}>
            <button onClick={() => setRuleOpen(false)} aria-label="Закрыть"><X /></button>
            <div className="modalico"><Zap /></div>
            <span>SMART CONTENT RULE</span>
            <h2 id="content-rule-title">Контент по погоде и загрузке</h2>
            <p>Опишите условие, целевые устройства и fallback — устройство не должно остаться с пустым экраном.</p>
            <div className="content-rule-grid"><label>Сигнал *<select value={ruleForm.signal} onChange={(event) => setRuleForm((current) => ({ ...current, signal: event.target.value }))}><option>Температура</option><option>Осадки</option><option>Occupancy</option><option>Очередь</option><option>Стоп-лист</option></select></label><label>Условие<select value={ruleForm.operator} onChange={(event) => setRuleForm((current) => ({ ...current, operator: event.target.value }))}><option>выше</option><option>ниже</option><option>равно</option><option>изменилось</option></select></label><label>Порог *<input required value={ruleForm.threshold} onChange={(event) => setRuleForm((current) => ({ ...current, threshold: event.target.value }))} /></label><label>Доп. guardrail<input value={ruleForm.secondary} onChange={(event) => setRuleForm((current) => ({ ...current, secondary: event.target.value }))} /></label><label>Плейлист *<select value={ruleForm.playlist} onChange={(event) => setRuleForm((current) => ({ ...current, playlist: event.target.value }))}>{list.map((item) => <option key={item[0]}>{item[0]}</option>)}</select></label><label>Устройства *<select required value={ruleForm.targets} onChange={(event) => setRuleForm((current) => ({ ...current, targets: event.target.value }))}>{targetDevices.length === 0 ? <option value="">Нет подключённых устройств</option> : <><option>{`Все устройства · ${targetDevices.length}`}</option>{targetDevices.map((item) => <option key={item}>{item}</option>)}</>}</select><small>{targetDevices.length ? `Scope: ${location.name}` : "Сначала подключите экран или планшет."}</small></label><label className="wide">Fallback *<select value={ruleForm.fallback} onChange={(event) => setRuleForm((current) => ({ ...current, fallback: event.target.value }))}>{list.map((item) => <option key={item[0]}>{item[0]}</option>)}</select></label></div>
            <div className="modalstats">
              <div><span>Условие</span><strong>{ruleForm.signal} {ruleForm.operator} {ruleForm.threshold}</strong><em>{ruleForm.secondary || "без guardrail"}</em></div>
              <div><span>Охват</span><strong>{ruleForm.targets}</strong><em>fallback: {ruleForm.fallback}</em></div>
            </div>
            {ruleError && <div className="sys-form-error" role="alert"><AlertTriangle />{ruleError}</div>}
            <div className="modalactions">
              <button className="secondary" onClick={() => setRuleOpen(false)}>Отмена</button>
              <button className="primary" onClick={() => {
                if (!ruleForm.threshold.trim() || !ruleForm.targets.trim() || !ruleForm.fallback) { setRuleError("Заполните порог, устройства и fallback-плейлист."); return; }
                const playlistIndex = list.findIndex((item) => item[0] === ruleForm.playlist);
                const fallbackIndex = list.findIndex((item) => item[0] === ruleForm.fallback);
                if ((clipsByPlaylist[playlistIndex]?.length ?? 0) === 0 || (clipsByPlaylist[fallbackIndex]?.length ?? 0) === 0) { setRuleError("Основной и fallback-плейлисты должны содержать хотя бы один клип."); return; }
                if (["Температура", "Осадки"].includes(ruleForm.signal) && !location.connectedSources?.includes("OpenWeather")) { setRuleError("Для этого сигнала привяжите OpenWeather к координатам активной локации."); return; }
                if (["Occupancy", "Очередь"].includes(ruleForm.signal) && (location.cameras === 0 || location.zones === 0)) { setRuleError("Для этого сигнала нужны зона, камера и активированная калибровка."); return; }
                if (ruleForm.signal === "Стоп-лист" && !location.connectedSources?.includes("Poster POS")) { setRuleError("Стоп-лист недоступен без Poster POS и location mapping."); return; }
                setRuleCount((value) => value + 1); setRuleOpen(false); setRuleError(""); notify(`Smart-правило создано: ${ruleForm.signal} ${ruleForm.operator} ${ruleForm.threshold} → ${ruleForm.playlist}`);
              }}>Сохранить правило</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Screens({ location, notify, onLocationUpdate }: { location: VenueLocation; notify: (text: string, context?: { location?: VenueLocation }) => void; onLocationUpdate: (location: VenueLocation) => void }) {
  const signal = signalsFor(location);
  const spatialZones = spatialZonesFor(location);
  const availableZones = [...new Set(spatialZones.map((item) => item.name))];
  const configuredDeviceRows = (location.configuredScreens ?? []).map((item) => [item.name, item.model, item.playlist, item.floor, item.zone, item.id]);
  const seededDeviceCount = location.demoSeeded ? signal.screens : 0;
  const [devices, setDevices] = useState(() => [...(location.demoSeeded ? screenTemplates.slice(0, seededDeviceCount) : []), ...configuredDeviceRows]);
  const [on, setOn] = useState(() => [...(location.demoSeeded ? screenTemplates.slice(0, signal.screens).map((_, index) => index < signal.screensOnline) : []), ...(location.configuredScreens ?? []).map((item) => item.online)]);
  const [control, setControl] = useState<number | null>(null);
  const [screenTab, setScreenTab] = useState("Контент");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectForm, setConnectForm] = useState({ code: "VF-9274", name: "Планшет welcome", model: "Android tablet", floor: "1 этаж", zone: availableZones[0] ?? "", orientation: "Landscape", playlist: "Queue & welcome" });
  const [connectError, setConnectError] = useState("");
  const [brightness, setBrightness] = useState<Record<number, number>>(() => Object.fromEntries((location.configuredScreens ?? []).map((item, index) => [seededDeviceCount + index, item.brightness ?? 78])));
  const [publishedAt, setPublishedAt] = useState<Record<number, string>>({});
  const connectDevice = () => {
    if (!/^VF-\d{4}$/i.test(connectForm.code.trim())) { setConnectError("Код подключения должен иметь формат VF-0000 и отображаться на устройстве."); return; }
    if (!connectForm.name.trim() || !connectForm.floor || !connectForm.zone) { setConnectError("Укажите название, этаж и зону устройства."); return; }
    if (!spatialZones.some((item) => `${item.floor} этаж` === connectForm.floor && item.name === connectForm.zone)) { setConnectError("Выбранная зона не относится к этому этажу. Обновите spatial context."); return; }
    const id = `SCREEN-${String(devices.length + 1).padStart(2, "0")}`;
    const nextDefinition = { id, name: connectForm.name.trim(), model: connectForm.model, playlist: connectForm.playlist, floor: connectForm.floor, zone: connectForm.zone, orientation: connectForm.orientation, online: true, brightness: 78 };
    const updated = { ...location, configuredScreens: [...(location.configuredScreens ?? []), nextDefinition] };
    setDevices((current) => [...current, [connectForm.name.trim(), connectForm.model, connectForm.playlist, connectForm.floor, connectForm.zone, id]]); setOn((current) => [...current, true]); onLocationUpdate(updated); setConnectOpen(false); setConnectError(""); notify(`${connectForm.name} подключён к ${location.name} → ${connectForm.floor} → ${connectForm.zone}`, { location: updated });
  };
  return (
    <>
      <Metrics type="screens" location={location} overrides={{ Устройств: String(devices.length), Онлайн: String(on.filter(Boolean).length), ...(location.demoSeeded ? {} : { Показы: "0", Вовлечённость: "—" }) }} />
      <article className="card">
        <div className="card-head">
          <div>
            <span>{location.name.toUpperCase()} · {devices.length} УСТРОЙСТВ</span>
            <h2>Управление устройствами</h2>
          </div>
          <button className="primary" onClick={() => setConnectOpen(true)}>+ Подключить</button>
        </div>
        <div className="devices">
          {devices.map((x, i) => (
            <article className={!on[i] ? "offline" : ""} key={x[0]}>
              <div className={`device ds${i}`}>
                <Tablet />
                <span className={on[i] ? "status ok" : "status bad"}>
                  {on[i] ? "Online" : "Offline"}
                </span>
                <strong>{String(x[2]).split(" ").slice(0, 2).join(" ").toUpperCase()}</strong>
              </div>
              <h3>{x[0]}</h3>
              <p>
                {x[1]} · {x[2]}<br />{x[3]} → {x[4]}
              </p>
              <div>
                <button className="secondary" onClick={() => setControl(i)}>
                  <Play />
                  Управлять
                </button>
                <button
                  className="icon"
                  aria-label={on[i] ? `Перевести ${x[0]} в offline` : `Включить ${x[0]}`}
                  onClick={() => { const nextOnline = !on[i]; setOn((a) => a.map((v, j) => (j === i ? nextOnline : v))); const id = devices[i][5]; if (location.configuredScreens?.some((item) => item.id === id)) onLocationUpdate({ ...location, configuredScreens: location.configuredScreens.map((item) => item.id === id ? { ...item, online: nextOnline } : item) }); }}
                >
                  <Wifi />
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>
      {control !== null && (
        <div className="modalback screen-control-back" onMouseDown={() => setControl(null)}>
          <div className="screen-control" role="dialog" aria-modal="true" aria-labelledby="screen-control-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><Tablet /><p><span>{location.name} · {devices[control][3]} → {devices[control][4]} · {devices[control][5]}</span><strong id="screen-control-title">{devices[control][0]}</strong><em>{devices[control][1]} · {on[control] ? "Online" : "Offline"}</em></p></div>
              <button onClick={() => setControl(null)} aria-label="Закрыть"><X /></button>
            </header>
            <div className="screen-control-tabs">
              {["Контент", "Расписание", "Устройство"].map((tab) => <button className={screenTab === tab ? "active" : ""} key={tab} onClick={() => setScreenTab(tab)}>{tab}</button>)}
            </div>
            {screenTab === "Контент" && (
              <main className="screen-control-main">
                <div className="screen-live-preview"><span>LIVE PREVIEW</span><strong>{devices[control][2]}</strong><em>{devices[control][4]} · fallback готов</em><i><Play /></i></div>
                <aside><span>СЕЙЧАС ПОКАЗЫВАЕТСЯ</span><h3>{devices[control][2]}</h3><p>{publishedAt[control] ? `Опубликовано ${publishedAt[control]}` : "3 клипа · 32 секунды · обновлено 4 минуты назад"}</p>{[[`${devices[control][2]} · main`, "12 сек"], ["Fallback playlist", "10 сек"], ["Venue message", "10 сек"]].map(([name, duration], index) => <button key={name} onClick={() => notify(`Открыт клип ${index + 1}: ${name}`)}><i>{index + 1}</i><span>{name} · {duration}</span><ChevronRight /></button>)}<button className="primary full" aria-disabled={!on[control]} onClick={() => { if (!on[control]) { notify("Публикация заблокирована: устройство offline"); return; } setPublishedAt((current) => ({ ...current, [control]: "только что" })); notify(`Контент опубликован на ${devices[control][0]} · checksum подтверждён`); }}>Опубликовать изменения</button></aside>
              </main>
            )}
            {screenTab === "Расписание" && <main className="screen-simple-panel"><CalendarDays /><h3>Автоматическое расписание</h3><p>{devices[control][2]} · 11:30–14:30<br />Evening fallback · 18:00–23:00<br />Safe fallback · в остальное время</p><button className="primary" onClick={() => notify(`Расписание ${devices[control][0]} сохранено`)}>Сохранить расписание</button></main>}
            {screenTab === "Устройство" && <main className="screen-simple-panel"><Settings /><h3>Параметры устройства</h3><label>Яркость · {brightness[control] ?? 78}%<input aria-label="Яркость устройства" type="range" min="10" max="100" value={brightness[control] ?? 78} onChange={(event) => { const value = Number(event.target.value); setBrightness((current) => ({ ...current, [control]: value })); const id = devices[control][5]; if (location.configuredScreens?.some((item) => item.id === id)) onLocationUpdate({ ...location, configuredScreens: location.configuredScreens.map((item) => item.id === id ? { ...item, brightness: value } : item) }); }} /></label><p>{devices[control][3]} → {devices[control][4]} · Wi‑Fi −51 dBm · storage 62% · app v3.4.1</p><button className="secondary" aria-disabled={!on[control]} onClick={() => notify(on[control] ? `Команда перезапуска отправлена на ${devices[control][0]}` : "Перезапуск недоступен: устройство offline")}>Перезапустить приложение</button></main>}
          </div>
        </div>
      )}
      {connectOpen && (
        <div className="modalback" onMouseDown={() => setConnectOpen(false)}>
          <div className="modal screen-connect-modal" role="dialog" aria-modal="true" aria-labelledby="screen-connect-title" onMouseDown={(event) => event.stopPropagation()}>
            <button onClick={() => setConnectOpen(false)} aria-label="Закрыть подключение устройства"><X /></button>
            <div className="modalico"><Tablet /></div>
            <span>DEVICE PAIRING · {location.name.toUpperCase()}</span>
            <h2 id="screen-connect-title">Подключить экран или планшет</h2>
            <p>Код отображается в приложении VenueFlow Player. Пространственный контекст определяет, какие smart-правила и плейлисты получит устройство.</p>
            <div className="screen-connect-grid">
              <label>Pairing code *<input required pattern="VF-[0-9]{4}" value={connectForm.code} onChange={(event) => setConnectForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></label>
              <label>Название *<input required value={connectForm.name} onChange={(event) => setConnectForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Тип<select value={connectForm.model} onChange={(event) => setConnectForm((current) => ({ ...current, model: event.target.value }))}><option>Android tablet</option><option>iPad</option><option>Smart TV</option><option>Web player</option></select></label>
              <label>Ориентация<select value={connectForm.orientation} onChange={(event) => setConnectForm((current) => ({ ...current, orientation: event.target.value }))}><option>Landscape</option><option>Portrait</option></select></label>
              <label>Этаж *
                <select required value={connectForm.floor} onChange={(event) => {
                  const nextFloor = event.target.value;
                  const nextZone = spatialZones.find((item) => `${item.floor} этаж` === nextFloor)?.name ?? "";
                  setConnectForm((current) => ({ ...current, floor: nextFloor, zone: nextZone }));
                }}>
                  {Array.from({ length: Math.max(1, location.floors) }).map((_, index) => <option key={index}>{index + 1} этаж</option>)}
                </select>
              </label>
              <label>Зона *
                <select required value={connectForm.zone} onChange={(event) => setConnectForm((current) => ({ ...current, zone: event.target.value }))}>
                  {spatialZones.filter((item) => `${item.floor} этаж` === connectForm.floor).length === 0
                    ? <option value="">Нет зон на этаже</option>
                    : spatialZones.filter((item) => `${item.floor} этаж` === connectForm.floor).map((item) => <option key={item.id}>{item.name}</option>)}
                </select>
                <small>{availableZones.length === 0 ? "Сначала создайте зону в разделе «Планы и зоны»." : "Устройство наследует расписание и smart-правила этой зоны."}</small>
              </label>
              <label className="wide">Fallback-плейлист *<select required value={connectForm.playlist} onChange={(event) => setConnectForm((current) => ({ ...current, playlist: event.target.value }))}><option>Queue & welcome</option><option>Lunch boost</option><option>Main menu</option><option>Fallback menu</option></select></label>
            </div>
            {connectError && <div className="sys-form-error" role="alert"><AlertTriangle />{connectError}</div>}
            <div className="modalactions"><button className="secondary" onClick={() => setConnectOpen(false)}>Отмена</button><button className="primary" onClick={connectDevice}>Проверить и подключить</button></div>
          </div>
        </div>
      )}
    </>
  );
}

const generic: Record<
  string,
  { metrics?: string; title: string; kind: string }
> = {
  alerts: { title: "Активные события", kind: "alerts" },
  reports: { title: "Автоматические отчёты", kind: "reports" },
  locations: {
    metrics: "locations",
    title: "Сравнение локаций",
    kind: "locations",
  },
  cameras: { title: "Источники видео", kind: "cameras" },
  integrations: { title: "Каталог интеграций", kind: "integrations" },
  settings: { title: "Приватность и данные", kind: "settings" },
};

const settingsPanels: Record<string, { kicker: string; title: string; items: Array<[string, string, boolean]> }> = {
  "Профиль компании": {
    kicker: "ОРГАНИЗАЦИЯ",
    title: "Профиль компании",
    items: [
      ["Единый часовой пояс", "Europe/Kyiv для отчётов и расписаний сети.", true],
      ["Сводка по брендам", "Объединять Franko и Central Café в owner-view.", true],
      ["Публичный статус", "Не показывать состояние инфраструктуры вне организации.", false],
    ],
  },
  "Пользователи и роли": {
    kicker: "RBAC · 18 ПОЛЬЗОВАТЕЛЕЙ",
    title: "Пользователи и роли",
    items: [
      ["Owner видит P&L сети", "Полный доступ ко всем локациям и денежным метрикам.", true],
      ["Manager ограничен локацией", "Видео и задачи только назначенного заведения.", true],
      ["Экспорт видео по согласованию", "Требовать подтверждение Owner или Security.", true],
      ["Временный доступ подрядчику", "Автоматически завершать сессию через 24 часа.", false],
    ],
  },
  Уведомления: {
    kicker: "ROUTING & ESCALATION",
    title: "Уведомления",
    items: [
      ["Критические события в Telegram", "Offline камеры, safety и cold-chain сразу.", true],
      ["Эскалация через 5 минут", "Если manager не принял событие, уведомить owner.", true],
      ["Ежедневная digest-сводка", "09:00 по локальному времени локации.", true],
      ["Информационные push", "Промо-цели и положительная динамика.", false],
    ],
  },
  "Приватность и данные": {
    kicker: "БЕЗОПАСНОСТЬ",
    title: "Приватность и данные",
    items: [
      ["Анонимизация видео", "Лица размываются на устройстве до передачи данных.", true],
      ["Хранение фрагментов", "Только события и нарушения SLA · 30 дней.", true],
      ["Аналитика демографии", "Возрастные группы без распознавания личности.", false],
      ["Доступ менеджеров", "Только к назначенной локации.", true],
    ],
  },
  "Пороговые значения": {
    kicker: "BUSINESS RULES",
    title: "Пороговые значения",
    items: [
      ["Очередь: больше 8 гостей", "Алерт после 3 минут устойчивого превышения.", true],
      ["Первый контакт: больше 5 минут", "Создать задачу официанту и manager.", true],
      ["Температура prep: выше +7°C", "Критический HACCP-протокол без задержки.", true],
      ["Низкая уверенность модели", "Не создавать действия при confidence ниже 70%.", true],
    ],
  },
  Брендинг: {
    kicker: "WHITE LABEL",
    title: "Брендинг интерфейсов",
    items: [
      ["Логотип в QR-меню", "Использовать бренд активной локации.", true],
      ["Фирменные цвета на экранах", "Синхронизировать дизайн-токены плейлистов.", true],
      ["Powered by VenueFlow", "Показывать подпись в гостевом меню.", false],
    ],
  },
  "API и webhooks": {
    kicker: "DEVELOPER PLATFORM",
    title: "API и webhooks",
    items: [
      ["Signed webhooks", "Подписывать события HMAC-SHA256.", true],
      ["Sandbox события", "Отправлять тестовые queue и occupancy events.", true],
      ["Доступ к raw-видео через API", "Запрещено политикой организации.", false],
    ],
  },
  Тариф: {
    kicker: "VENUEFLOW SCALE",
    title: "Тариф и лимиты",
    items: [
      ["24 camera streams", "Использовано 24 из 32 доступных потоков.", true],
      ["AI Copilot", "Неограниченные запросы для Owner и Manager.", true],
      ["Дополнительное хранение", "Подключить ещё 2 TB событийного архива.", false],
    ],
  },
};

const integrationNames = ["Poster POS", "OpenWeather", "Google Business", "Worksection", "BAS / 1C", "Telegram", "Google Calendar", "Webhook API", "KDS", "CRM / Loyalty", "Inventory", "IoT / HACCP", "Delivery aggregators", "Telephony / Reservations"];

function alertRowsForLocation(location: VenueLocation): Array<[string, string, string, boolean]> {
  if (location.demoSeeded) return [
    ["critical", "Очередь в баре выше 8 гостей", "4 минуты назад", true],
    ["warning", "Стол 15 ждёт уборки 9:18", "7 минут назад", true],
    ["warning", "Камера террасы потеряла поток", "12 минут назад", false],
    ["info", "Трафик на 34% выше прогноза", "18 минут назад", false],
    ["info", "Lunch boost достиг цели", "26 минут назад", false],
  ];
  const rows: Array<[string, string, string, boolean]> = [];
  if (location.zones === 0) rows.push(["critical", "Не создан пространственный контекст", "блокирует аналитику", true]);
  if (location.cameras === 0) rows.push(["critical", "Нет подключённых камер", "блокирует видеометрики", true]);
  else if (location.configuredCameras?.some((camera) => !camera.calibrated)) rows.push(["warning", "Калибровка камеры не активирована", "события ещё не публикуются", true]);
  if (!location.connectedSources?.includes("Poster POS")) rows.push(["warning", "Poster POS не сопоставлен", "чеки и меню недоступны", true]);
  if (!location.connectedSources?.includes("OpenWeather")) rows.push(["warning", "Погода не привязана к координатам", "weather uplift недоступен", true]);
  return rows.length ? rows : [["info", "Критических событий нет", "конфигурация готова", false]];
}

function Generic({ type, toast, location, onLocationUpdate }: any) {
  const [handledAlerts, setHandledAlerts] = useState<string[]>([]);
  const [alertFilter, setAlertFilter] = useState("Все");
  const [alertRuleCount, setAlertRuleCount] = useState(location.demoSeeded ? 8 : 0);
  const [reportCount, setReportCount] = useState(4);
  const [workflow, setWorkflow] = useState<"alert" | "report" | null>(null);
  const [workflowError, setWorkflowError] = useState("");
  const workflowZones = [...new Set([...spatialZonesFor(location).map((item) => item.name), "Вся локация"])];
  const [alertForm, setAlertForm] = useState({ name: "Очередь требует реакции", metric: "Queue length", operator: ">", threshold: "8", duration: "3", zone: workflowZones[0], channel: "Telegram + in-app", owner: "Manager", escalation: "5" });
  const [reportForm, setReportForm] = useState({ name: "Executive weekly", template: "Owner summary", scope: "Активная локация", schedule: "Каждый понедельник · 09:00", timezone: location.timezone, recipients: "owner@demo.local", format: "PDF" });
  const [integrationsState, setIntegrationsState] = useState(() => integrationNames.map((name) => location.connectedSources?.includes(name) ?? false));
  const [integrationSetup, setIntegrationSetup] = useState<number | null>(null);
  const [integrationTested, setIntegrationTested] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationForm, setIntegrationForm] = useState({ account: "Oxios Food Demo", externalLocation: location.name, internalLocation: location.name, cadence: "Каждые 5 минут", history: "30 дней" });
  const [settingTab, setSettingTab] = useState("Приватность и данные");
  const [savedSettingValues, setSavedSettingValues] = useState<Record<string, boolean[]>>(() => Object.fromEntries(Object.entries(settingsPanels).map(([key, value]) => [key, value.items.map((item) => item[2])])));
  const [draftSettingValues, setDraftSettingValues] = useState<Record<string, boolean[]>>(() => Object.fromEntries(Object.entries(settingsPanels).map(([key, value]) => [key, value.items.map((item) => item[2])])));
  const panel = settingsPanels[settingTab];
  const settingDirty = draftSettingValues[settingTab].some((value, index) => value !== savedSettingValues[settingTab][index]);
  const submitWorkflow = () => {
    if (workflow === "alert") {
      const threshold = Number(alertForm.threshold); const duration = Number(alertForm.duration); const escalation = Number(alertForm.escalation);
      if (!alertForm.name.trim() || !Number.isFinite(threshold) || threshold < 0 || !Number.isFinite(duration) || duration < 0 || duration > 120 || !Number.isFinite(escalation) || escalation < 1 || escalation > 60) { setWorkflowError("Проверьте название, порог, длительность 0–120 мин и эскалацию 1–60 мин."); return; }
      if (["Queue length", "First contact SLA", "Occupancy"].includes(alertForm.metric) && (location.zones === 0 || location.cameras === 0)) { setWorkflowError("Для этой метрики нужны сохранённая зона, камера и калибровка."); return; }
      if (alertForm.metric === "Camera health" && location.cameras === 0) { setWorkflowError("Нельзя контролировать camera health: в локации нет камер."); return; }
      if (alertForm.metric === "Temperature" && !location.demoSeeded) { setWorkflowError("Для temperature alert сначала сопоставьте IoT-сенсор с локацией."); return; }
      if (alertForm.channel.startsWith("Telegram") && !location.connectedSources?.includes("Telegram")) { setWorkflowError("Канал Telegram не подключён к этой локации. Выберите in-app или настройте интеграцию."); return; }
      setAlertRuleCount((value) => value + 1); setWorkflow(null); setWorkflowError(""); toast(`Правило «${alertForm.name}» создано как черновик · ${alertForm.zone} · эскалация ${alertForm.escalation} мин`); return;
    }
    const recipients = reportForm.recipients.split(",").map((item: string) => item.trim()).filter(Boolean);
    if (!reportForm.name.trim() || recipients.length === 0 || recipients.some((item: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) { setWorkflowError("Укажите название и корректные email получателей через запятую."); return; }
    setReportCount((value) => value + 1); setWorkflow(null); setWorkflowError(""); toast(`Отчёт «${reportForm.name}» создан · ${reportForm.schedule} · ${reportForm.format}`);
  };
  const workflowModal = workflow && <div className="modalback" onMouseDown={() => setWorkflow(null)}><div className="modal workflow-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-title" onMouseDown={(event) => event.stopPropagation()}><button onClick={() => setWorkflow(null)} aria-label="Закрыть мастер"><X /></button><div className="modalico">{workflow === "alert" ? <Bell /> : <BarChart3 />}</div><span>{workflow === "alert" ? `ALERT RULE · ${location.name.toUpperCase()}` : "REPORT BUILDER · OXIOS FOOD GROUP"}</span><h2 id="workflow-title">{workflow === "alert" ? "Когда и кого уведомлять?" : "Что, когда и кому отправлять?"}</h2>{workflow === "alert" ? <div className="workflow-grid"><label className="wide">Название правила *<input required value={alertForm.name} onChange={(event) => setAlertForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Метрика *<select value={alertForm.metric} onChange={(event) => setAlertForm((current) => ({ ...current, metric: event.target.value }))}><option>Queue length</option><option>First contact SLA</option><option>Camera health</option><option>Temperature</option><option>Occupancy</option></select></label><label>Зона *<select value={alertForm.zone} onChange={(event) => setAlertForm((current) => ({ ...current, zone: event.target.value }))}>{workflowZones.map((item: string) => <option key={item}>{item}</option>)}</select></label><label>Условие<div className="workflow-inline"><select value={alertForm.operator} onChange={(event) => setAlertForm((current) => ({ ...current, operator: event.target.value }))}><option>&gt;</option><option>&lt;</option><option>=</option></select><input aria-label="Порог правила" type="number" min="0" value={alertForm.threshold} onChange={(event) => setAlertForm((current) => ({ ...current, threshold: event.target.value }))} /></div></label><label>Устойчиво, минут<input type="number" min="0" max="120" value={alertForm.duration} onChange={(event) => setAlertForm((current) => ({ ...current, duration: event.target.value }))} /></label><label>Канал<select value={alertForm.channel} onChange={(event) => setAlertForm((current) => ({ ...current, channel: event.target.value }))}><option>Telegram + in-app</option><option>Email + in-app</option><option>In-app only</option></select></label><label>Ответственный<select value={alertForm.owner} onChange={(event) => setAlertForm((current) => ({ ...current, owner: event.target.value }))}><option>Manager</option><option>Shift lead</option><option>Owner</option><option>Security</option></select></label><label className="wide">Эскалация через, минут<input type="number" min="1" max="60" value={alertForm.escalation} onChange={(event) => setAlertForm((current) => ({ ...current, escalation: event.target.value }))} /></label></div> : <div className="workflow-grid"><label className="wide">Название *<input required value={reportForm.name} onChange={(event) => setReportForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Шаблон<select value={reportForm.template} onChange={(event) => setReportForm((current) => ({ ...current, template: event.target.value }))}><option>Owner summary</option><option>Operations</option><option>Traffic & conversion</option><option>Food safety</option></select></label><label>Scope<select value={reportForm.scope} onChange={(event) => setReportForm((current) => ({ ...current, scope: event.target.value }))}><option>Активная локация</option><option>Все локации</option><option>Регион</option></select></label><label>Расписание<select value={reportForm.schedule} onChange={(event) => setReportForm((current) => ({ ...current, schedule: event.target.value }))}><option>Каждый понедельник · 09:00</option><option>Ежедневно · 09:00</option><option>1 числа · 10:00</option></select></label><label>Часовой пояс<select value={reportForm.timezone} onChange={(event) => setReportForm((current) => ({ ...current, timezone: event.target.value }))}><option>{location.timezone}</option><option>UTC</option></select></label><label>Формат<select value={reportForm.format} onChange={(event) => setReportForm((current) => ({ ...current, format: event.target.value }))}><option>PDF</option><option>XLSX</option><option>CSV</option></select></label><label className="wide">Demo-получатели *<input required value={reportForm.recipients} onChange={(event) => setReportForm((current) => ({ ...current, recipients: event.target.value }))} /><small>В прототипе письмо не отправляется.</small></label></div>}{workflowError && <div className="sys-form-error" role="alert"><AlertTriangle />{workflowError}</div>}<div className="modalactions"><button className="secondary" onClick={() => setWorkflow(null)}>Отмена</button><button className="primary" onClick={submitWorkflow}>Создать черновик</button></div></div></div>;
  if (type === "alerts")
    return (
      <>
        <div className="filterbar">
          <div className="tabs" aria-label="Фильтр событий">
            {["Все", "Требуют реакции", "Информационные"].map((item) => <button className={alertFilter === item ? "active" : ""} key={item} onClick={() => setAlertFilter(item)}>{item}</button>)}
          </div>
          <button className="primary" onClick={() => setWorkflow("alert")}>+ Создать правило · {alertRuleCount}</button>
        </div>
        <article className="card alertlist">
          {alertRowsForLocation(location).filter((item) => alertFilter === "Все" || (alertFilter === "Требуют реакции" ? item[3] : !item[3])).map((x) => (
            <div key={x[1]}>
              <div className={`alertico ${x[0]}`}>
                <AlertTriangle />
              </div>
              <p>
                <strong>{x[1]}</strong>
                <span>{location.name} · {x[2]}</span>
                <em>
                  {x[3] ? "Требуется реакция" : "Информационное событие"}
                </em>
              </p>
              <button
                className="secondary"
                onClick={() => {
                  if (x[3]) setHandledAlerts((current) => current.includes(x[1]) ? current : [...current, x[1]]);
                  toast(x[3] ? `${x[1]}: событие принято` : `Открыты детали: ${x[1]}`);
                }}
              >
                {handledAlerts.includes(x[1]) ? "Принято" : x[3] ? "Принять" : "Подробнее"}
              </button>
              <button className="icon" aria-label={`Дополнительные действия: ${x[1]}`} onClick={() => toast(`Действия события «${x[1]}»: назначить, отложить или открыть журнал`)}><MoreHorizontal /></button>
            </div>
          ))}
        </article>
        {workflowModal}
      </>
    );
  if (type === "reports")
    return (
      <>
        <div className="action-banner">
          <Download />
          <p>
            <strong>Следующий отчёт через 10 часов</strong>
            <span>Executive weekly будет отправлен 4 получателям.</span>
          </p>
          <button className="primary" onClick={() => setWorkflow("report")}>Создать отчёт · {reportCount}</button>
        </div>
        <div className="reportgrid">
          {[
            [BarChart3, "Executive weekly", "Каждый понедельник"],
            [Users, "Гостевой поток", "Ежедневно"],
            [Utensils, "Service performance", "Каждую пятницу"],
            [MonitorPlay, "Digital experience", "1 числа месяца"],
          ].map(([I, t, s]: any) => (
            <article className="card" key={t}>
              <div>
                <I />
              </div>
              <h3>{t}</h3>
              <p>Готовый отчёт с динамикой и рекомендациями</p>
              <span>
                <CalendarDays />
                {s}
              </span>
              <button className="secondary" onClick={() => toast(`Открыт отчёт «${t}»`)}>Открыть</button>
            </article>
          ))}
        </div>
        {workflowModal}
      </>
    );
  if (type === "integrations")
    return (
      <>
        <div className="integration-hero">
          <Zap />
          <h2>Все сигналы бизнеса — в одном месте</h2>
          <p>
            Объедините видео с продажами, погодой, сменами, запасами и
            маркетингом.
          </p>
        </div>
        <div className="integrations">
          {integrationNames.map((x, i) => (
            <article className="card" key={x}>
              <i>{x.slice(0, 2).toUpperCase()}</i>
              <p>
                <strong>{x}</strong>
                <span>
                  {
                    [
                      "Продажи и чеки",
                      "Погода и прогноз",
                      "Отзывы и события",
                      "Задачи команды",
                      "Учёт и запасы",
                      "Алерты и отчёты",
                      "Локальные события",
                      "Свои сценарии",
                      "Заказы кухни и время выдачи",
                      "Гости, сегменты и повторные визиты",
                      "Остатки, рецептуры и закупки",
                      "Температуры и critical control points",
                      "Glovo, Bolt Food и собственная доставка",
                      "Звонки, брони и AI-host",
                    ][i]
                  }
                </span>
              </p>
              <span className={integrationsState[i] ? "status ok" : "status"}>
                {integrationsState[i] ? "Подключено" : "Доступно"}
              </span>
              <button
                className="secondary"
                onClick={() => {
                  setIntegrationSetup(i);
                  setIntegrationTested(integrationsState[i]);
                  setIntegrationError("");
                  setIntegrationForm((current) => ({ ...current, externalLocation: location.name, internalLocation: location.name }));
                }}
              >
                {integrationsState[i] ? "Настроить" : "Подключить"}
              </button>
            </article>
          ))}
        </div>
        {integrationSetup !== null && (
          <div className="modalback" onMouseDown={() => setIntegrationSetup(null)}>
            <div className="modal workflow-modal" role="dialog" aria-modal="true" aria-labelledby="integration-title" onMouseDown={(event) => event.stopPropagation()}>
              <button onClick={() => setIntegrationSetup(null)} aria-label="Закрыть подключение интеграции"><X /></button>
              <div className="modalico"><Zap /></div>
              <span>CONNECTOR SETUP · {location.name.toUpperCase()}</span>
              <h2 id="integration-title">{integrationsState[integrationSetup] ? "Настроить" : "Подключить"} {integrationNames[integrationSetup]}</h2>
              <p>В production здесь появятся OAuth/API credentials. В демо проверяем главное: какой внешний объект соответствует какой VenueFlow-локации и какие данные синхронизируются.</p>
              <div className="workflow-grid">
                <label className="wide">Аккаунт / организация *<input required value={integrationForm.account} onChange={(event) => { setIntegrationTested(false); setIntegrationError(""); setIntegrationForm((current) => ({ ...current, account: event.target.value })); }} /></label>
                <label>Внешняя локация *<input required value={integrationForm.externalLocation} onChange={(event) => { setIntegrationTested(false); setIntegrationError(""); setIntegrationForm((current) => ({ ...current, externalLocation: event.target.value })); }} /></label>
                <label>VenueFlow location *<select required value={integrationForm.internalLocation} disabled><option>{location.name}</option></select><small>Контекст фиксирован активной локацией, чтобы исключить ошибочное mapping.</small></label>
                <label>Частота sync<select value={integrationForm.cadence} onChange={(event) => setIntegrationForm((current) => ({ ...current, cadence: event.target.value }))}><option>Live / webhook</option><option>Каждую минуту</option><option>Каждые 5 минут</option><option>Каждый час</option></select></label>
                <label>История<select value={integrationForm.history} onChange={(event) => setIntegrationForm((current) => ({ ...current, history: event.target.value }))}><option>Без истории</option><option>7 дней</option><option>30 дней</option><option>90 дней</option></select></label>
              </div>
              <div className={`integration-test ${integrationTested ? "ready" : ""}`}><Database /><p><strong>{integrationTested ? "Connection test пройден" : "Требуется connection test"}</strong><span>{integrationTested ? "Schema v3 · clock sync 220 мс · location mapping подтверждён" : "Credentials не сохраняются в UI-прототипе"}</span></p>{integrationTested && <Check />}</div>
              {integrationError && <div className="sys-form-error" role="alert"><AlertTriangle />{integrationError}</div>}
              <div className="modalactions">
                <button className="secondary" onClick={() => setIntegrationSetup(null)}>Отмена</button>
                <button className="secondary" onClick={() => {
                  if (!integrationForm.account.trim() || !integrationForm.externalLocation.trim()) { setIntegrationError("Заполните аккаунт и внешнюю локацию."); return; }
                  setIntegrationTested(true); setIntegrationError("");
                }}>Проверить соединение</button>
                <button className="primary" disabled={!integrationTested} onClick={() => {
                  const index = integrationSetup;
                  const source = integrationNames[index];
                  const wasConnected = integrationsState[index];
                  const nextSources = [...new Set([...(location.connectedSources ?? []), source])];
                  const nextReadiness = Math.min(100, location.readiness + (wasConnected ? 0 : 8));
                  const coreReady = ["Poster POS", "OpenWeather"].every((item) => nextSources.includes(item));
                  const calibrationReady = location.cameras > 0 && (location.demoSeeded || (location.configuredCameras ?? []).every((camera) => camera.calibrated));
                  const ready = location.zones > 0 && location.cameras > 0 && location.online === location.cameras && calibrationReady && coreReady && location.privacyConfigured && nextReadiness >= 80;
                  const updated = { ...location, connectedSources: nextSources, readiness: nextReadiness, status: ready ? "ready" as const : location.status === "setup" ? "setup" as const : "attention" as const };
                  setIntegrationsState((current) => current.map((value, itemIndex) => itemIndex === index ? true : value));
                  onLocationUpdate?.(updated);
                  setIntegrationSetup(null);
                  toast(`Интеграция ${source} ${wasConnected ? "обновлена" : "подключена"} · ${integrationForm.externalLocation} → ${integrationForm.internalLocation}`);
                }}>{integrationsState[integrationSetup] ? "Сохранить mapping" : "Подключить"}</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  return (
    <section className="settingslayout">
      <aside className="card settingnav">
        {[
          "Профиль компании",
          "Пользователи и роли",
          "Уведомления",
          "Приватность и данные",
          "Пороговые значения",
          "Брендинг",
          "API и webhooks",
          "Тариф",
        ].map((x) => (
          <button
            className={settingTab === x ? "active" : ""}
            key={x}
            onClick={() => setSettingTab(x)}
          >
            {x}
            <ChevronRight />
          </button>
        ))}
      </aside>
      <article className="card settingcontent">
        <div className="card-head">
          <div>
            <span>{panel.kicker}</span>
            <h2>{panel.title}</h2>
          </div>
        </div>
        {panel.items.map((x, itemIndex) => (
          <div className="setting" key={x[0] as string}>
            <p>
              <strong>{x[0] as string}</strong>
              <span>{x[1] as string}</span>
            </p>
            <label className="switch">
              <input aria-label={x[0] as string} type="checkbox" checked={draftSettingValues[settingTab][itemIndex]} onChange={() => setDraftSettingValues((current) => ({ ...current, [settingTab]: current[settingTab].map((value, index) => index === itemIndex ? !value : value) }))} />
              <i />
            </label>
          </div>
        ))}
        <div className="settingsfoot">
          <span className={settingDirty ? "settings-dirty" : "settings-saved"}>{settingDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
          <button className="secondary" disabled={!settingDirty} onClick={() => { setDraftSettingValues((current) => ({ ...current, [settingTab]: [...savedSettingValues[settingTab]] })); toast("Изменения текущего раздела отменены"); }}>Отменить</button>
          <button
            className="primary"
            disabled={!settingDirty}
            onClick={() => { setSavedSettingValues((current) => ({ ...current, [settingTab]: [...draftSettingValues[settingTab]] })); toast(`${panel.title}: настройки сохранены и добавлены в audit log`); }}
          >
            Сохранить
          </button>
        </div>
      </article>
    </section>
  );
}

function NoLocationState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="no-location-state">
      <article className="card">
        <i><Store /></i>
        <span>VENUEFLOW · ЛОКАЦИИ</span>
        <h1>Нет активной локации</h1>
        <p>Все прежние локации удалены. Добавьте новое заведение, чтобы перейти к этажам, зонам и плану.</p>
        <button className="primary" onClick={onAdd}>Добавить локацию <ArrowRight /></button>
      </article>
    </section>
  );
}

function VenueFlowDashboard() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [page, setPage] = useState<Key>(() => pageFromPath(pathname) ?? "overview"),
    [locations, setLocations] = useState<VenueLocation[]>(venueLocations),
    [location, setLocation] = useState<VenueLocation>(emptyVenueLocation),
    [locationMenu, setLocationMenu] = useState(false),
    [mobile, setMobile] = useState(false),
    [sidebarHidden, setSidebarHidden] = useState(() => pageFromPath(pathname) === "floorplan"),
    [aiOpen, setAiOpen] = useState(false),
    [dateRange, setDateRange] = useState("Сегодня"),
    [dateMenu, setDateMenu] = useState(false),
    [contractOpen, setContractOpen] = useState(false),
    [action, setAction] = useState<ActionContext | null>(null),
    [lastAction, setLastAction] = useState<ActionContext | null>(null),
    [filterSummaries, setFilterSummaries] = useState<Record<string, string>>({}),
    [modal, setModal] = useState(false),
    [developmentNoticeOpen, setDevelopmentNoticeOpen] = useState(true),
    [toast, setToast] = useState("");
  const currentContract = contractFor(page);
  const goToPage = (nextPage: Key | string) => {
    const targetPage = nextPage as Key;
    setPage(targetPage);
    if (targetPage === "floorplan") setSidebarHidden(true);
    setDevelopmentNoticeOpen(true);
    router.push(pathForPage(targetPage));
  };
  useEffect(() => {
    if (pathname === "/") {
      router.replace(pathForPage("overview"));
      return;
    }
    const routedPage = pageFromPath(pathname);
    if (!routedPage) {
      router.replace(pathForPage("overview"));
      return;
    }
    setPage(routedPage);
    setDevelopmentNoticeOpen(true);
    setMobile(false);
    window.scrollTo(0, 0);
  }, [pathname, router]);
  useEffect(() => {
    if (!developmentNoticeOpen) return;
    const closeDevelopmentNotice = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDevelopmentNoticeOpen(false);
    };
    window.addEventListener("keydown", closeDevelopmentNotice);
    return () => window.removeEventListener("keydown", closeDevelopmentNotice);
  }, [developmentNoticeOpen]);
  useEffect(() => {
    let active = true;
    apiFetch<{ locations: VenueLocation[] }>("/locations")
      .then(({ locations: savedLocations }) => {
        if (!active) return;
        setLocations(savedLocations);
        setLocation((current) => savedLocations.find((item) => item.id === current.id) ?? savedLocations[0] ?? emptyVenueLocation);
      })
      .catch(() => setToast("Не удалось загрузить сохранённые локации"));
    return () => { active = false; };
  }, []);
  const notify = (s: string, context?: { period?: string; location?: VenueLocation; page?: Key }) => {
    const actionLocation = context?.location ?? locations.find((item) => s.includes(item.name)) ?? location;
    const actionPage = context?.page ?? page;
    const actionContract = contractFor(actionPage);
    const nextAction: ActionContext = {
      id: Date.now(),
      message: s,
      page: actionPage,
      pageTitle: titles[actionPage][0],
      location: actionLocation,
      period: actionContract.period === "live" ? "Live · сегодня" : actionContract.period === "none" ? "Не применяется" : context?.period ?? dateRange,
      contract: actionContract,
    };
    setLastAction(nextAction);
    if (/фильтр|экспорт|отч[её]т|диагност|health report|фрагмент|доказатель|методик|чек #|model card|журнал/i.test(s)) setAction(nextAction);
    setToast(s);
    setTimeout(() => setToast(""), 2200);
  };
  const applySavedLocation = (saved: VenueLocation) => {
    const mergeLocation = (current: VenueLocation) => ({
      ...current,
      ...saved,
      backendFloors: saved.backendFloors ?? current.backendFloors,
      planElements: saved.planElements ?? current.planElements,
      planFileNames: saved.planFileNames ?? current.planFileNames,
      planPdfUrls: saved.planPdfUrls ?? current.planPdfUrls,
      planAssetUrls: saved.planAssetUrls ?? current.planAssetUrls,
      planAssetTypes: saved.planAssetTypes ?? current.planAssetTypes,
      customZones: saved.customZones ?? current.customZones,
    });
    setLocation((current) => !current.id || current.id === saved.id ? mergeLocation(current) : current);
    setLocations((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? mergeLocation(item) : item)
      : [...current, saved]);
  };
  const createLocation = async (created: VenueLocation) => {
    const result = await apiFetch<{ location: VenueLocation; floor: { id: string; level: number; name: string; canvas?: { width: number; height: number; gridSize: number } } }>("/locations", { method: "POST", body: JSON.stringify(created) });
    const saved = { ...result.location, backendFloors: [result.floor] };
    applySavedLocation(saved);
    return saved;
  };
  const updateLocation = (updated: VenueLocation) => {
    applySavedLocation(updated);
    void apiFetch<{ location: VenueLocation }>(`/locations/${encodeURIComponent(updated.id)}`, { method: "PUT", body: JSON.stringify(updated) })
      .then(({ location: saved }) => applySavedLocation(saved))
      .catch((error) => notify(`Изменения показаны локально, но не сохранены: ${error instanceof Error ? error.message : "ошибка API"}`));
  };
  const changeDateRange = (period: string) => { setDateRange(period); setDateMenu(false); notify(`Период изменён: ${period}`, { period }); };
  const content = (() => {
    if (locations.length === 0 && page !== "locations") return <NoLocationState onAdd={() => goToPage("locations")} />;
    switch (page) {
      case "overview":
        return <Overview go={goToPage} open={() => setModal(true)} location={location} />;
      case "demo":
        return <DemoCenter key={location.id} go={goToPage as any} notify={notify} location={location} />;
      case "copilot":
        return <ShiftCopilot key={location.id} notify={notify} />;
      case "simulator":
        return <WhatIfLab key={location.id} notify={notify} />;
      case "experiments":
        return <ExperimentHub key={location.id} location={location} notify={notify} />;
      case "live":
        return <Live key={location.id} location={location} notify={notify} />;
      case "outside":
        return <Outside key={location.id} location={location} notify={notify} period={dateRange} onPeriodChange={changeDateRange} />;
      case "inside":
        return <Inside key={location.id} location={location} period={dateRange} onPeriodChange={changeDateRange} />;
      case "journey":
        return <Journey key={location.id} location={location} />;
      case "service":
        return <Service key={location.id} location={location} notify={notify} />;
      case "staff":
        return <Staff key={location.id} location={location} notify={notify} />;
      case "kitchen":
        return <Kitchen key={location.id} location={location} notify={notify} />;
      case "videoSearch":
        return <VideoSearchPage key={location.id} notify={notify} />;
      case "profit":
        return <ProfitGuard key={location.id} notify={notify} />;
      case "waste":
        return <WasteVision key={location.id} notify={notify} />;
      case "insights":
        return <Insights key={location.id} open={() => setModal(true)} notify={notify} period={dateRange} onPeriodChange={changeDateRange} />;
      case "forecast":
        return <Forecast key={location.id} location={location} notify={notify} />;
      case "labor":
        return <LaborPlanner key={location.id} notify={notify} />;
      case "prep":
        return <PrepInventory key={location.id} notify={notify} />;
      case "safety":
        return <SafetyHub key={location.id} notify={notify} />;
      case "delivery":
        return <DeliveryControl key={location.id} notify={notify} />;
      case "finance":
        return <PrimeCost key={location.id} notify={notify} />;
      case "guestAI":
        return <GuestAI key={location.id} notify={notify} />;
      case "reputation":
        return <ReputationHub key={location.id} notify={notify} location={location} />;
      case "menu":
        return <QRMenu key={location.id} location={location} notify={notify} />;
      case "menuEngineering":
        return <MenuEngineering key={location.id} notify={notify} />;
      case "content":
        return <Content key={location.id} notify={notify} location={location} />;
      case "screens":
        return <Screens key={location.id} location={location} notify={notify} onLocationUpdate={updateLocation} />;
      case "setup":
        return <SetupCenter key={location.id} go={goToPage as any} notify={notify} location={location} locations={locations} />;
      case "trust":
        return <DataTrustCenter key={location.id} location={location} notify={notify} />;
      case "locations":
        return (
          <LocationsManager
            notify={notify}
            locations={locations}
            activeLocation={location}
            onLocationChange={setLocation}
            onCreateLocation={createLocation}
            onLocationUpdate={updateLocation}
            go={goToPage as any}
          />
        );
      case "floorplan":
        return <FloorPlanManager key={location.id} notify={notify} location={location} go={goToPage as any} onLocationUpdate={updateLocation} />;
      case "cameras":
        return <CameraControl key={location.id} notify={notify} location={location} locations={locations} onLocationUpdate={updateLocation} />;
      default:
        return <Generic key={`${page}-${location.id}`} type={page} toast={notify} location={location} onLocationUpdate={updateLocation} />;
    }
  })();
  const configPages: Key[] = ["demo", "menu", "content", "screens", "setup", "locations", "floorplan", "cameras", "integrations", "settings"];
  const canExport = !configPages.includes(page) && (location.demoSeeded || hardBlockersFor(currentContract, location).length === 0);
  const cameraSetupMissing = location.cameras === 0;
  const calibrationProblemCount = location.configuredCameras?.filter((camera) => !camera.calibrated || camera.status !== "online").length ?? 0;
  const cameraProblemCount = cameraSetupMissing ? 1 : Math.max(Math.max(0, location.cameras - location.online), calibrationProblemCount);
  const cameraNeedsAttention = cameraProblemCount > 0;
  const alertCount = alertRowsForLocation(location).filter((item) => item[1] !== "Критических событий нет").length;
  return (
    <div className={`shell${sidebarHidden ? " sidebar-hidden" : ""}`}>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <i>VF</i>
          <p>
            <strong>VenueFlow</strong>
            <span>Video intelligence</span>
          </p>
          <button onClick={() => setMobile(false)} aria-label="Закрыть меню">
            <X />
          </button>
        </div>
        <div className="venue-wrap">
          <button className="venue" onClick={() => setLocationMenu((value) => !value)}>
            <i>{location.name[0]}</i>
            <p>
              <strong>{location.name}</strong>
              <span>{location.city}</span>
            </p>
            <ChevronDown />
          </button>
          {locationMenu && (
            <div className="venue-menu">
              <span>АКТИВНАЯ ЛОКАЦИЯ</span>
              {locations.map((item) => (
                <button
                  className={item.id === location.id ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    setLocation(item);
                    setLocationMenu(false);
                    notify(`Переключено на ${item.name}`, { location: item });
                  }}
                >
                  <i>{item.name[0]}</i>
                  <p><strong>{item.name}</strong><span>{item.city} · {item.online}/{item.cameras} камер</span></p>
                  {item.id === location.id && <Check />}
                </button>
              ))}
              <button className="manage" onClick={() => { goToPage("locations"); setLocationMenu(false); }}>
                Управление локациями <ArrowRight />
              </button>
            </div>
          )}
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g[0]}>
              <label>{g[0]}</label>
              {g[1].map(([k, l, I]: any) => (
                <button
                  className={page === k ? "active" : ""}
                  key={k}
                  onClick={() => {
                    goToPage(k);
                    setMobile(false);
                    window.scrollTo(0, 0);
                  }}
                >
                  <I />
                  <span>{l}</span>
                  {k === "alerts" && <em>{alertCount}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <footer>
          <div>
            <span>
              <i />
              {cameraSetupMissing ? "Требуется настройка" : cameraNeedsAttention ? "Требует внимания" : "Система работает"}
            </span>
            <small>{cameraSetupMissing ? `Камеры не добавлены · ${location.name}` : calibrationProblemCount ? `${calibrationProblemCount === 1 ? "1 камера требует" : `${calibrationProblemCount} камер требуют`} calibration · ${location.name}` : `${location.online} из ${location.cameras} камер онлайн · ${location.name}`}</small>
          </div>
          <div>
            <i>АК</i>
            <p>
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </p>
            <button className="profile-more" aria-label="Выйти" title="Выйти" onClick={() => void logout()}><LogOut /></button>
          </div>
        </footer>
      </aside>
      {mobile && <button className="scrim" aria-label="Закрыть боковое меню" onClick={() => setMobile(false)} />}
      <main className={page === "floorplan" ? "floorplan-main" : ""}>
        <header>
          <button className="desktop-sidebar-toggle" aria-label={sidebarHidden ? "Показать боковое меню" : "Скрыть боковое меню"} title={sidebarHidden ? "Показать меню" : "Скрыть меню"} onClick={() => setSidebarHidden((value) => !value)}>
            {sidebarHidden ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button className="burger" aria-label="Открыть боковое меню" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div className="crumb">
            <span>VenueFlow</span>
            <ChevronRight />
            <strong>{titles[page][0]}</strong>
          </div>
          <div className="topactions">
            <button className="ai-launch" onClick={() => setAiOpen(true)}>
              <Sparkles />
              <span>Venue AI</span>
            </button>
            <span className={`healthy ${cameraNeedsAttention ? "issue" : ""}`}>
              <i />
              {cameraSetupMissing ? <>Требуется настройка <em>нет камер</em></> : cameraNeedsAttention ? <>Требует внимания <em>{cameraProblemCount} {cameraProblemCount === 1 ? "проблема" : "проблемы"}</em></> : <>Все системы <em>в норме</em></>}
            </span>
            <button className="notify" onClick={() => goToPage("alerts")} aria-label="Открыть уведомления">
              <Bell />
              <i>{alertCount}</i>
            </button>
            <button className="avatar" onClick={() => goToPage("settings")} aria-label="Открыть профиль">АК</button>
          </div>
        </header>
        <div className="content">
          <div className="pagehead">
            <div>
              <h1>{titles[page][0]}</h1>
              <p>{titles[page][1]}</p>
            </div>
            <div>
              {currentContract.period === "range" && <div className="date-wrap">
                <button className="date" aria-haspopup="listbox" aria-expanded={dateMenu} onClick={() => setDateMenu((value) => !value)}>
                  <CalendarDays />{dateRange}<ChevronDown />
                </button>
                {dateMenu && <div className="date-menu" role="listbox" aria-label="Период данных">
                  {["Сегодня", "7 дней", "30 дней", "90 дней"].map((period) => <button className={dateRange === period ? "active" : ""} role="option" aria-selected={dateRange === period} key={period} onClick={() => changeDateRange(period)}>{period}{dateRange === period && <Check />}</button>)}
                </div>}
              </div>}
              {currentContract.period === "live" && <span className="qa-live-period"><i /> Live · сегодня</span>}
              {canExport && <button className="secondary" onClick={() => notify(`Экспорт страницы «${titles[page][0]}»`)}><Download />Экспорт</button>}
            </div>
          </div>
          <DataContextBar contract={currentContract} location={location} period={dateRange} filterSummary={filterSummaries[page]} onOpen={() => setContractOpen(true)} />
          <DataAvailabilityGate contract={currentContract} location={location} bypass={configPages.includes(page) || page === "alerts"} go={goToPage}>{content}</DataAvailabilityGate>
        </div>
      </main>
      {developmentNoticeOpen && (
        <div className="modalback development-notice-back" onMouseDown={() => setDevelopmentNoticeOpen(false)}>
          <div className="modal development-notice" role="dialog" aria-modal="true" aria-labelledby="development-notice-title" aria-describedby="development-notice-description" onMouseDown={(event) => event.stopPropagation()}>
            <button onClick={() => setDevelopmentNoticeOpen(false)} aria-label="Закрыть уведомление">
              <X />
            </button>
            <div className="modalico">
              <Settings />
            </div>
            <span>VENUEFLOW · ПРЕДВАРИТЕЛЬНАЯ ВЕРСИЯ</span>
            <h2 id="development-notice-title">Экран «{titles[page][0]}» в разработке</h2>
            <p id="development-notice-description">
              Функции и данные на этом экране пока демонстрационные. Вы можете закрыть уведомление и продолжить просмотр интерфейса.
            </p>
            <div className="modalactions">
              <button className="primary" autoFocus onClick={() => setDevelopmentNoticeOpen(false)}>
                Продолжить просмотр
              </button>
            </div>
          </div>
        </div>
      )}
      {modal && (
        <div className="modalback" onMouseDown={() => setModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="campaign-recommendation-title" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => setModal(false)} aria-label="Закрыть рекомендацию">
              <X />
            </button>
            <div className="modalico">
              <Sparkles />
            </div>
            <span>AI-РЕКОМЕНДАЦИЯ · ВЫСОКИЙ ПРИОРИТЕТ</span>
            <h2 id="campaign-recommendation-title">Запустить lunch-комбо в среду и четверг</h2>
            <p>
              Анализ 8 недель показывает устойчивый спад трафика на 52% с 12:00
              до 14:00. Проходящий поток остаётся высоким, но capture rate
              падает до 11%.
            </p>
            <div className="modalstats">
              <div>
                <span>Прогноз выручки</span>
                <strong>+₴18–26 тыс.</strong>
                <em>в месяц</em>
              </div>
              <div>
                <span>Уверенность</span>
                <strong>87%</strong>
                <em>на основе 8 недель</em>
              </div>
            </div>
            <h3>Рекомендуемый сценарий</h3>
            <ol>
              <li>Создать lunch-комбо за ₴249.</li>
              <li>Показать промо на фасадном экране с 11:30.</li>
              <li>Поднять Lunch наверх в QR-меню.</li>
              <li>Через 14 дней сравнить результат.</li>
            </ol>
            <div className="modalactions">
              <button className="secondary" onClick={() => setModal(false)}>
                Не сейчас
              </button>
              <button
                className="primary"
                onClick={() => {
                  setModal(false);
                  goToPage("content");
                  notify("Черновик кампании создан", { page: "content" });
                }}
              >
                Создать кампанию
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <ClipboardCheck />
          {toast}
          {lastAction && <button onClick={() => setAction(lastAction)}>Контекст</button>}
        </div>
      )}
      <AICopilotDrawer
        key={location.id}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        page={page}
        location={location}
        go={goToPage as any}
        notify={notify}
      />
      <ContractDrawer open={contractOpen} onClose={() => setContractOpen(false)} contract={currentContract} location={location} pageTitle={titles[page][0]} />
      <ActionWorkbench key={action?.id ?? 0} action={action} onClose={() => setAction(null)} onCommit={(message, filterSummary) => { if (filterSummary) { const actionPage = action?.page ?? page; setFilterSummaries((current) => ({ ...current, [actionPage]: filterSummary })); } setAction(null); setToast(message); setTimeout(() => setToast(""), 2200); }} />
    </div>
  );
}

export default function Home() {
  return <AuthGate><VenueFlowDashboard /></AuthGate>;
}
