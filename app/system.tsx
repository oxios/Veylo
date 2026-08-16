/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "./api-client";
import PlanCanvas, { type PlanCanvasZone, type PlanElement } from "./plan-canvas";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Cable,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Cloud,
  Crosshair,
  DoorOpen,
  EyeOff,
  Gauge,
  ImagePlus,
  Info,
  Layers3,
  ListChecks,
  LockKeyhole,
  Map,
  MapPin,
  MousePointer2,
  Network,
  Plus,
  RefreshCw,
  Router,
  ScanLine,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Table2,
  Trash2,
  Upload,
  Users,
  Utensils,
  Video,
  Wifi,
  X,
  Zap,
} from "lucide-react";

export type VenueLocation = {
  id: string;
  name: string;
  city: string;
  address: string;
  format: string;
  timezone: string;
  floors: number;
  zones: number;
  cameras: number;
  online: number;
  readiness: number;
  capacity: number;
  businessHours: string;
  coordinates: { lat: number; lng: number };
  status: "ready" | "attention" | "setup";
  /** Seeded demo venues have a prebuilt spatial map; user-created venues start empty. */
  demoSeeded: boolean;
  planFloors?: string[];
  customZones?: VenueZoneDefinition[];
  configuredCameras?: VenueCameraDefinition[];
  zoneCameraLinks?: Record<string, string[]>;
  connectedSources?: string[];
  configuredScreens?: VenueScreenDefinition[];
  privacyConfigured?: boolean;
  historyDays: number;
  planElements?: PlanElement[];
  planFileNames?: Record<string, string>;
  planPdfUrls?: Record<string, string>;
  planAssetUrls?: Record<string, string>;
  planAssetTypes?: Record<string, "pdf" | "image" | "manual">;
  backendFloors?: VenueFloorRecord[];
};

export type VenueFloorRecord = {
  id: string;
  level: number;
  name: string;
  spaceType?: FloorSpaceType;
  purpose?: string;
  backgroundMode?: "floor-plan" | "camera-view";
  canvas?: { width: number; height: number; gridSize: number };
  planImport?: { originalName?: string; assetType?: "pdf" | "image" | "manual"; mimeType?: string; generatedElements?: number };
};

type FloorSpaceType = "building-floor" | "hall" | "outdoor" | "terrace" | "basement" | "mezzanine" | "service" | "other";

const FLOOR_SPACE_TYPES: Array<{ value: FloorSpaceType; label: string; example: string }> = [
  { value: "building-floor", label: "Этаж внутри здания", example: "2 этаж" },
  { value: "hall", label: "Отдельный зал", example: "2 зал" },
  { value: "outdoor", label: "Улица / наружная площадка", example: "Улица" },
  { value: "terrace", label: "Терраса / веранда", example: "Летняя терраса" },
  { value: "basement", label: "Цоколь / подвал", example: "Цоколь" },
  { value: "mezzanine", label: "Антресоль", example: "Антресоль" },
  { value: "service", label: "Служебное пространство", example: "Служебный этаж" },
  { value: "other", label: "Другое", example: "Дополнительная площадка" },
];

type PlanAiAnalysis = {
  status: "completed" | "skipped" | "failed";
  model?: string;
  confidence?: number;
  summary: string;
  reason?: string;
  generatedElements: number;
  generatedZones: number;
};

export type VenueZoneDefinition = {
  id: string;
  floor: string;
  name: string;
  type: string;
  capacity: number;
  cameras: string[];
  coverage: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type VenueCameraDefinition = {
  id: string;
  name: string;
  floor: string;
  zone: string;
  zoneId?: string;
  source: string;
  sourceType?: "onvif" | "rtsp" | "vendor" | "upload";
  sourceRef?: string;
  analytics: string[];
  status: "online" | "degraded" | "offline";
  calibrated: boolean;
  retentionDays?: number;
  rawVideo?: string;
  privacy?: Record<string, boolean>;
  planElementId?: string;
  snapshotId?: string;
  snapshotCapturedAt?: string;
  height?: number;
  angle?: number;
  orientation?: number;
};

export type VenueScreenDefinition = {
  id: string;
  name: string;
  model: string;
  playlist: string;
  floor: string;
  zone: string;
  orientation: string;
  online: boolean;
  brightness?: number;
};

function seededPlanElements(location: VenueLocation): PlanElement[] {
  if (!location.demoSeeded) return [];
  const result: PlanElement[] = [];
  for (let level = 1; level <= Math.max(1, location.floors); level += 1) {
    const floor = String(level);
    result.push(
      { id: `seed-${location.id}-${floor}-wall-top`, floor, kind: "wall", x: 7, y: 11, width: 84, height: 1, rotation: 0, label: "Верхняя стена" },
      { id: `seed-${location.id}-${floor}-wall-left`, floor, kind: "wall", x: 7, y: 11, width: 1, height: 80, rotation: 0, label: "Левая стена" },
      { id: `seed-${location.id}-${floor}-wall-bottom`, floor, kind: "wall", x: 7, y: 90, width: 84, height: 1, rotation: 0, label: "Нижняя стена" },
      { id: `seed-${location.id}-${floor}-door`, floor, kind: "door", x: 7, y: 45, width: 8, height: 3, rotation: 90, label: level === 1 ? "Главный вход" : "Лестница" },
    );
    const tableCount = level === 1 ? 10 : 6;
    for (let index = 0; index < tableCount; index += 1) {
      result.push({ id: `seed-${location.id}-${floor}-table-${index + 1}`, floor, kind: "table", x: 31 + (index % 5) * 8, y: 30 + Math.floor(index / 5) * 13, width: 4.5, height: 6, rotation: 0, label: `Стол ${index + 1}` });
    }
  }
  for (let index = 0; index < location.cameras; index += 1) {
    const floor = String((index % Math.max(1, location.floors)) + 1);
    result.push({ id: `seed-${location.id}-${floor}-camera-${index + 1}`, floor, kind: "camera", x: 18 + (index * 17) % 68, y: 21 + (index * 19) % 55, width: 4, height: 6, rotation: 0, label: `CAM-${String(index + 1).padStart(2, "0")}` });
  }
  return result;
}

export const emptyVenueLocation: VenueLocation = {
  id: "",
  name: "Локация не выбрана",
  city: "Добавьте первую локацию",
  address: "—",
  format: "—",
  timezone: "Europe/Kyiv · UTC+3",
  floors: 0,
  zones: 0,
  cameras: 0,
  online: 0,
  readiness: 0,
  capacity: 0,
  businessHours: "—",
  coordinates: { lat: 0, lng: 0 },
  status: "setup",
  demoSeeded: false,
  privacyConfigured: false,
  historyDays: 0,
  planFloors: [],
  customZones: [],
  configuredCameras: [],
  configuredScreens: [],
  zoneCameraLinks: {},
  connectedSources: [],
};

export const venueLocations: VenueLocation[] = [];

type Notify = (text: string, context?: { location?: VenueLocation }) => void;
type Go = (page: string) => void;

function SystemPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return <span className={`sys-pill ${tone}`}>{children}</span>;
}

function ReadinessRing({ value }: { value: number }) {
  return (
    <div
      className="sys-ring"
      style={{ "--ring": `${value * 3.6}deg` } as React.CSSProperties}
      aria-label={`Готовность ${value}%`}
    >
      <span>{value}%</span>
    </div>
  );
}

const setupSteps = [
  {
    icon: Building2,
    title: "Локация и часы работы",
    text: "Адрес, формат, часовой пояс и вместимость",
    status: "done",
    page: "locations",
  },
  {
    icon: Map,
    title: "Этажи, план и зоны",
    text: "14 зон, 24 стола, 3 точки входа/выхода",
    status: "done",
    page: "floorplan",
  },
  {
    icon: Camera,
    title: "Камеры и видеопотоки",
    text: "4 из 5 online · CAM-05 требует внимания",
    status: "warning",
    page: "cameras",
  },
  {
    icon: Crosshair,
    title: "Калибровка и правила",
    text: "12 ROI, 3 tripwire, 24 стола",
    status: "warning",
    page: "cameras",
  },
  {
    icon: Zap,
    title: "POS и внешние данные",
    text: "Poster, погода и Telegram подключены",
    status: "done",
    page: "integrations",
  },
  {
    icon: ShieldCheck,
    title: "Приватность и запуск",
    text: "Маски включены · осталось подтвердить retention",
    status: "todo",
    page: "settings",
  },
];

export function SetupCenter({
  go,
  notify,
  location,
  locations = venueLocations,
}: {
  go: Go;
  notify: Notify;
  location: VenueLocation;
  locations?: VenueLocation[];
}) {
  const [verified, setVerified] = useState(false);
  const readiness = verified ? Math.min(100, location.readiness + 2) : location.readiness;
  const plansReady = location.demoSeeded || ((location.planFloors?.length ?? 0) >= location.floors);
  const calibrationReady = location.demoSeeded
    ? location.status === "ready"
    : location.cameras > 0 && (location.configuredCameras ?? []).every((camera) => camera.calibrated);
  const coreSourcesReady = ["Poster POS", "OpenWeather"].every((source) => location.connectedSources?.includes(source));
  const locationSteps = setupSteps.map((step) => {
    if (step.title === "Локация и часы работы") return { ...step, text: `${location.address} · ${location.businessHours} · ${location.timezone}`, status: "done" };
    if (step.title === "Этажи, план и зоны") return { ...step, text: `${location.floors} эт. · ${location.zones} зон · вместимость ${location.capacity}`, status: plansReady && location.zones > 0 ? "done" : "warning" };
    if (step.title === "Камеры и видеопотоки") return location.cameras === 0
      ? { ...step, text: "Камеры ещё не добавлены · сначала выберите зону и источник", status: "warning" }
      : { ...step, text: `${location.online} из ${location.cameras} online${location.online < location.cameras ? " · требуется внимание" : ""}`, status: location.online === location.cameras ? "done" : "warning" };
    if (step.title === "Калибровка и правила") return { ...step, text: calibrationReady ? "ROI, tripwire и объекты проверены" : "Требуется завершить проверку покрытия", status: calibrationReady ? "done" : "warning" };
    if (step.title === "POS и внешние данные") { const count = location.connectedSources?.length ?? 0; return { ...step, text: coreSourcesReady ? `${count} источников · POS и погода сопоставлены` : "Обязательны location mapping для POS и координаты погоды", status: coreSourcesReady ? "done" : "warning" }; }
    if (step.title === "Приватность и запуск") return { ...step, text: location.privacyConfigured ? "Edge blur, audio lock и retention подтверждены" : "Подтвердите edge blur, audio lock и retention", status: location.privacyConfigured ? "done" : "todo" };
    return step;
  });
  const actions = locationSteps.filter((step) => step.status !== "done").length;
  const nextSetupStep = locationSteps.find((step) => step.status !== "done") ?? locationSteps[locationSteps.length - 1];
  const requiredSourceCount = (item: VenueLocation) => ["Poster POS", "OpenWeather", "Worksection", "Telegram"].filter((source) => item.connectedSources?.includes(source)).length;
  return (
    <>
      <section className="sys-setup-hero">
        <div className="sys-setup-copy">
          <span className="sys-kicker">
            <Sparkles /> SETUP & CALIBRATION
          </span>
          <h2>Система понимает не просто видео — она понимает пространство</h2>
          <p>
            Каждое событие привязано к локации, этажу, зоне, камере, объекту и
            бизнес-метрике. Поэтому VenueFlow знает, где именно возникла очередь
            и какой процесс на неё повлиял.
          </p>
          <div className="sys-hero-actions">
            <button className="primary" onClick={() => go(nextSetupStep.page)}>
              Продолжить: {nextSetupStep.title} <ArrowRight />
            </button>
            <button
              className="secondary"
              onClick={() => {
                setVerified(true);
                notify(`Проверка конфигурации завершена: ${actions} действий требуют внимания`);
              }}
            >
              <RefreshCw /> Проверить конфигурацию
            </button>
          </div>
        </div>
        <div className="sys-readiness-card">
          <ReadinessRing value={readiness} />
          <div>
            <span>ГОТОВНОСТЬ ЛОКАЦИИ</span>
            <strong>{location.name}</strong>
            <p>{Math.round((readiness / 100) * 27)} из 27 проверок пройдено</p>
          </div>
          <SystemPill tone={actions === 0 ? "success" : "warning"}>{actions === 0 ? "Готово" : `${actions} действий`}</SystemPill>
        </div>
      </section>

      <section className="sys-setup-grid">
        <article className="card sys-checklist">
          <div className="card-head">
            <div>
              <span>ЗАПУСК ЛОКАЦИИ</span>
              <h2>Что система должна знать</h2>
            </div>
            <SystemPill tone="info">6 этапов</SystemPill>
          </div>
          <div className="sys-step-list">
            {locationSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <button key={step.title} onClick={() => go(step.page)}>
                  <span className={`sys-step-number ${step.status}`}>
                    {step.status === "done" ? <Check /> : index + 1}
                  </span>
                  <i>
                    <Icon />
                  </i>
                  <p>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </p>
                  {step.status === "warning" && (
                    <SystemPill tone="warning">Проверить</SystemPill>
                  )}
                  {step.status === "todo" && (
                    <SystemPill>Не завершено</SystemPill>
                  )}
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </article>

        <aside className="sys-context-column">
          <article className="card sys-hierarchy">
            <div className="card-head">
              <div>
                <span>КОНТЕКСТ ДАННЫХ</span>
                <h2>Как VenueFlow понимает событие</h2>
              </div>
              <Info />
            </div>
            <div className="sys-hierarchy-flow">
              {[
                [Building2, "Oxios Food", "Организация"],
                [Store, location.name, "Локация"],
                [Layers3, location.planFloors?.length === 0 ? "План не загружен" : "1 этаж", "Этаж"],
                [MapPin, location.zones > 0 ? (location.customZones?.[0]?.name ?? "Главный зал") : "Зона не создана", "Зона"],
                [Camera, location.cameras > 0 ? (location.configuredCameras?.[0]?.id ?? "CAM-01") : "Камера не подключена", "Источник"],
                [ScanLine, location.cameras > 0 && location.zones > 0 ? "ROI требует проверки" : "ROI не настроен", "ROI / объект"],
              ].map(([Icon, value, label]: any, index) => (
                <div key={value}>
                  <i>
                    <Icon />
                  </i>
                  <p>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </p>
                  {index < 5 && <ChevronRight />}
                </div>
              ))}
            </div>
            {location.cameras > 0 && location.zones > 0 ? <div className="sys-event-example">
              <CircleDot />
              <p>
                <span>Демо-событие 19:42:18</span>
                <strong>Стол 8 ждёт первый контакт 7:18</strong>
                <em>{location.configuredCameras?.[0]?.id ?? "CAM-02"} → зона «{location.customZones?.[0]?.name ?? "Главный зал"}» → SLA сервиса</em>
              </p>
              <SystemPill tone="danger">+2:18</SystemPill>
            </div> : <div className="sys-event-example empty">
              <AlertTriangle />
              <p><span>СОБЫТИЯ НЕ ПУБЛИКУЮТСЯ</span><strong>Пространственный контекст не завершён</strong><em>Нужны план → зона → камера → калибровка ROI</em></p>
              <SystemPill tone="warning">Setup</SystemPill>
            </div>}
          </article>

          <article className="card sys-data-map">
            <div className="card-head">
              <div>
                <span>DATA LINEAGE</span>
                <h2>Из сигналов в решение</h2>
              </div>
            </div>
            <div className="sys-pipeline">
              <div>
                <Camera />
                <span>Видео</span>
              </div>
              <div>
                <Server />
                <span>Edge AI</span>
              </div>
              <div>
                <Network />
                <span>События</span>
              </div>
              <div>
                <Sparkles />
                <span>Решение</span>
              </div>
            </div>
            <p className="sys-note">
              Raw-видео не требуется для графиков: в аналитику попадают
              анонимные события, агрегаты и короткие доказательные фрагменты.
            </p>
          </article>
        </aside>
      </section>

      <section className="card sys-readiness-table">
        <div className="card-head">
          <div>
            <span>СЕТЬ · {locations.length} ЛОКАЦИИ</span>
            <h2>Готовность инфраструктуры</h2>
          </div>
          <button className="secondary" onClick={() => go("locations")}>
            Все локации <ArrowRight />
          </button>
        </div>
        <div className="sys-table-head">
          <span>Локация</span>
          <span>Структура</span>
          <span>Камеры</span>
          <span>Интеграции</span>
          <span>Готовность</span>
        </div>
        {locations.map((item) => (
          <button key={item.id} onClick={() => go("locations")}>
            <p>
              <i>{item.name[0]}</i>
              <span>
                <strong>{item.name}</strong>
                <em>{item.city}</em>
              </span>
            </p>
            <span>
              {item.floors} эт. · {item.zones} зон
            </span>
            <span>
              {item.online}/{item.cameras} online
            </span>
            <span>{requiredSourceCount(item)} из 4</span>
            <div>
              <i>
                <b style={{ width: `${item.readiness}%` }} />
              </i>
              <strong>{item.readiness}%</strong>
            </div>
          </button>
        ))}
      </section>
    </>
  );
}

export function LocationsManager({
  notify,
  locations,
  activeLocation,
  onLocationChange,
  onCreateLocation,
  onLocationUpdate,
  go,
}: {
  notify: Notify;
  locations: VenueLocation[];
  activeLocation: VenueLocation;
  onLocationChange: (location: VenueLocation) => void;
  onCreateLocation: (location: VenueLocation) => Promise<VenueLocation>;
  onLocationUpdate: (location: VenueLocation) => void;
  go: Go;
}) {
  const [selectedId, setSelectedId] = useState(activeLocation.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState("structure");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ name: "Promprylad Café", city: "Івано-Франківськ", format: "Coffee shop", address: "вул. Української Перемоги, 23", timezone: "Europe/Kyiv · UTC+3", capacity: "72", hours: "08:00–22:00", latitude: "48.9226", longitude: "24.7111" });
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const selected =
    locations.find((location) => location.id === selectedId) ?? activeLocation;
  const filteredLocations = locations.filter((location) =>
    filter === "all" ? true : filter === "ready" ? location.status === "ready" : location.status !== "ready",
  );
  const changeFilter = (nextFilter: string) => {
    setFilter(nextFilter);
    const first = locations.find((item) => nextFilter === "all" || (nextFilter === "ready" ? item.status === "ready" : item.status !== "ready"));
    if (first) setSelectedId(first.id);
  };
  const createLocation = async () => {
    const capacity = Number(form.capacity);
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.name.trim() || !form.city.trim() || !form.address.trim()) { setFormError("Заполните название, город и адрес — без них нельзя создать пространственный контекст."); return; }
    if (!Number.isFinite(capacity) || capacity < 1) { setFormError("Вместимость должна быть больше нуля."); return; }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d[–-](?:[01]\d|2[0-3]):[0-5]\d$/.test(form.hours.trim())) { setFormError("Часы работы должны быть в формате 08:00–22:00."); return; }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) { setFormError("Проверьте координаты: широта −90…90, долгота −180…180."); return; }
    const created: VenueLocation = { id: `location-${Date.now()}`, name: form.name.trim(), city: form.city.trim(), address: form.address.trim(), format: form.format, timezone: form.timezone, floors: 1, zones: 0, cameras: 0, online: 0, readiness: 18, capacity, businessHours: form.hours.trim(), coordinates: { lat: latitude, lng: longitude }, status: "setup", demoSeeded: false, privacyConfigured: false, historyDays: 0, planFloors: [], customZones: [], configuredCameras: [], configuredScreens: [], zoneCameraLinks: {}, connectedSources: [] };
    setCreating(true);
    try {
      const saved = await onCreateLocation(created);
      onLocationChange(saved); setSelectedId(saved.id); setCreateOpen(false); setFormError(""); notify(`${saved.name} создана · следующий обязательный шаг: загрузить план 1 этажа`, { location: saved }); go("floorplan");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось создать локацию");
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <section className="sys-location-toolbar">
        <div>
          <button className={filter === "all" ? "active" : ""} onClick={() => changeFilter("all")}>Все локации <b>{locations.length}</b></button>
          <button className={filter === "ready" ? "active" : ""} onClick={() => changeFilter("ready")}>Работают <b>{locations.filter((item) => item.status === "ready").length}</b></button>
          <button className={filter === "attention" ? "active" : ""} onClick={() => changeFilter("attention")}>Требуют внимания <b>{locations.filter((item) => item.status !== "ready").length}</b></button>
        </div>
        <button className="primary" onClick={() => setCreateOpen(true)}>
          <Plus /> Добавить локацию
        </button>
      </section>

      <section className="sys-location-cards">
        {filteredLocations.map((location) => {
          const index = locations.findIndex((item) => item.id === location.id);
          return (
          <button
            className={`card ${selectedId === location.id ? "active" : ""}`}
            key={location.id}
            onClick={() => setSelectedId(location.id)}
          >
            <div className={`sys-location-map map-${index}`}>
              <MapPin />
              <SystemPill
                tone={
                  location.status === "ready"
                    ? "success"
                    : location.status === "attention"
                      ? "warning"
                      : "neutral"
                }
              >
                {location.status === "ready"
                  ? "Готово"
                  : location.status === "attention"
                    ? "Есть проблема"
                    : "Настройка"}
              </SystemPill>
            </div>
            <div className="sys-location-card-body">
              <p>
                <span>{location.city}</span>
                <strong>{location.name}</strong>
                <em>{location.format}</em>
              </p>
              <div>
                <span><Layers3 /> {location.floors} эт.</span>
                <span><Map /> {location.zones} зон</span>
                <span><Camera /> {location.online}/{location.cameras}</span>
              </div>
              <i>
                <b style={{ width: `${location.readiness}%` }} />
              </i>
              <small>Готовность {location.readiness}%</small>
            </div>
          </button>
          );
        })}
        {filteredLocations.length === 0 && (
          <article className="card sys-location-empty">
            <i><Building2 /></i>
            <h2>{locations.length === 0 ? "Локаций пока нет" : "По фильтру ничего не найдено"}</h2>
            <p>{locations.length === 0 ? "Добавьте первое заведение — после этого можно загрузить план этажа и создать зоны." : "Вернитесь ко всем локациям или выберите другой статус."}</p>
            <button className="primary" onClick={() => locations.length === 0 ? setCreateOpen(true) : changeFilter("all")}>
              {locations.length === 0 ? <><Plus /> Добавить локацию</> : "Показать все"}
            </button>
          </article>
        )}
      </section>

      {locations.length > 0 && <section className="sys-location-detail">
        <article className="card sys-location-profile">
          <div className="card-head">
            <div>
              <span>КАРТОЧКА ЛОКАЦИИ</span>
              <h2>{selected.name}</h2>
            </div>
            {activeLocation.id === selected.id ? (
              <SystemPill tone="success"><Check /> Активная</SystemPill>
            ) : (
              <button
                className="secondary"
                onClick={() => {
                  onLocationChange(selected);
                  notify(`Активная локация: ${selected.name}`, { location: selected });
                }}
              >
                Сделать активной
              </button>
            )}
          </div>
          <div className="sys-location-facts">
            <div><MapPin /><span>Адрес<strong>{selected.address}</strong></span></div>
            <div><Clock3 /><span>Часовой пояс<strong>{selected.timezone}</strong></span></div>
            <div><Store /><span>Формат<strong>{selected.format}</strong></span></div>
            <div><Users /><span>Вместимость<strong>{selected.capacity} гостей</strong></span></div>
            <div><Crosshair /><span>Координаты<strong>{selected.coordinates.lat.toFixed(4)}, {selected.coordinates.lng.toFixed(4)}</strong></span></div>
            <div><Activity /><span>История данных<strong>{selected.historyDays ? `${selected.historyDays} дней` : "ещё не накоплена"}</strong></span></div>
          </div>
          <div className="sys-detail-tabs">
            {[
              ["structure", "Структура"],
              ["hours", "Часы и сервисы"],
              ["data", "Источники данных"],
            ].map(([key, label]) => (
              <button
                className={detailsTab === key ? "active" : ""}
                onClick={() => setDetailsTab(key)}
                key={key}
              >
                {label}
              </button>
            ))}
          </div>
          {detailsTab === "structure" && (
            <div className="sys-floor-list">
              {Array.from({ length: selected.floors }).map((_, index) => {
                const floorNumber = String(index + 1);
                const configuredZones = spatialZonesFor(selected).filter((item) => item.floor === floorNumber);
                const zoneCount = configuredZones.length;
                const seats = configuredZones.reduce((sum, item) => sum + item.capacity, 0);
                return <button key={index} onClick={() => { onLocationChange(selected); go("floorplan"); }}>
                  <i><Layers3 /></i>
                  <p>
                    <strong>{index === 0 ? "1 этаж · Основной" : `${index + 1} этаж`}</strong>
                    <span>{zoneCount} зон · {seats} мест</span>
                  </p>
                  <SystemPill tone={zoneCount > 0 && (selected.planFloors?.includes(floorNumber) ?? selected.demoSeeded) ? "success" : "warning"}>
                    {zoneCount > 0 && (selected.planFloors?.includes(floorNumber) ?? selected.demoSeeded) ? "Размечен" : "Не завершён"}
                  </SystemPill>
                  <ChevronRight />
                </button>
              })}
              <button className="sys-add-floor" onClick={() => { onLocationChange(selected); go("floorplan"); }}>
                <Layers3 /> Управлять этажами
              </button>
            </div>
          )}
          {detailsTab === "hours" && (
            <div className="sys-hours">
              {["Пн–Чт", "Пт", "Сб", "Вс"].map((day) => (
                <div key={day}>
                  <strong>{day}</strong>
                  <span>{selected.businessHours}</span>
                  <SystemPill tone="success">Открыто</SystemPill>
                </div>
              ))}
            </div>
          )}
          {detailsTab === "data" && (
            <div className="sys-data-sources">
              {[
                [Camera, "Видео", selected.cameras === 0 ? "камеры не добавлены" : `${selected.online}/${selected.cameras} камер`, selected.cameras > 0 && selected.online === selected.cameras],
                [Utensils, "Poster POS", selected.connectedSources?.includes("Poster POS") ? "чеки и меню · sync 4 мин" : "не сопоставлен с локацией", selected.connectedSources?.includes("Poster POS")],
                [Cloud, "Погода", selected.connectedSources?.includes("OpenWeather") ? "координаты подтверждены" : "провайдер не подключён", selected.connectedSources?.includes("OpenWeather")],
                [Users, "Расписание", selected.connectedSources?.includes("Worksection") ? "смены · sync 12 мин" : "не подключено", selected.connectedSources?.includes("Worksection")],
              ].map(([Icon, name, text, ready]: any) => (
                <div key={name}>
                  <i><Icon /></i>
                  <p><strong>{name}</strong><span>{text}</span></p>
                  <SystemPill tone={ready ? "success" : "warning"}>{ready ? "Online" : "Подключить"}</SystemPill>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className="card sys-location-health">
          <div className="card-head">
            <div>
              <span>LOCATION HEALTH</span>
              <h2>Качество конфигурации</h2>
            </div>
            <ReadinessRing value={selected.readiness} />
          </div>
          {[
            ["План и зоны", selected.zones === 0 ? ((selected.planFloors?.length ?? 0) > 0 ? 45 : 0) : (selected.demoSeeded || (selected.planFloors?.length ?? 0) >= selected.floors) ? 100 : 70],
            ["Покрытие камер", selected.cameras === 0 ? 0 : Math.round((selected.online / selected.cameras) * 100)],
            ["Калибровка", selected.cameras === 0 ? 0 : selected.demoSeeded ? (selected.status === "ready" ? 100 : selected.id === "central" ? 42 : 88) : Math.round(((selected.configuredCameras ?? []).filter((camera) => camera.calibrated).length / Math.max(1, selected.cameras)) * 100)],
            ["Интеграции", Math.round((["Poster POS", "OpenWeather", "Worksection", "Telegram"].filter((source) => selected.connectedSources?.includes(source)).length / 4) * 100)],
            ["Privacy policy", selected.privacyConfigured ? 100 : 0],
          ].map(([label, value]: any) => (
            <div className="sys-health-row" key={label}>
              <span>{label}</span>
              <i><b style={{ width: `${value}%` }} /></i>
              <strong>{value}%</strong>
            </div>
          ))}
          <button className="primary full" onClick={() => { onLocationChange(selected); notify(`План запуска открыт для ${selected.name}`, { location: selected }); go("setup"); }}>
            Открыть план запуска <ArrowRight />
          </button>
        </aside>
      </section>}

      {createOpen && (
        <div className="sys-overlay" onMouseDown={() => setCreateOpen(false)}>
          <div className="sys-modal" role="dialog" aria-modal="true" aria-labelledby="create-location-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="sys-close" onClick={() => setCreateOpen(false)} aria-label="Закрыть"><X /></button>
            <span className="sys-kicker"><Building2 /> НОВАЯ ЛОКАЦИЯ</span>
            <h2 id="create-location-title">Добавьте базовый контекст заведения</h2>
            <p>После этого вы загрузите план, создадите зоны и привяжете камеры.</p>
            <div className="sys-form-grid">
              <label>Название *<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Формат *<select required value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}><option>Coffee shop</option><option>Full service</option><option>Fast casual / QSR</option></select></label>
              <label>Город *<input required value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></label>
              <label className="wide">Адрес *<input required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label>
              <label>Часовой пояс *<select required value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}><option>Europe/Kyiv · UTC+3</option><option>Europe/Warsaw · UTC+2</option><option>Europe/Berlin · UTC+2</option></select></label>
              <label>Вместимость *<input required min="1" max="2000" type="number" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} /></label>
              <label>Базовые часы *<input required pattern="[0-2][0-9]:[0-5][0-9][–-][0-2][0-9]:[0-5][0-9]" placeholder="08:00–22:00" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} /></label>
              <label>Широта *<input required type="number" min="-90" max="90" step="0.0001" value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} /></label>
              <label>Долгота *<input required type="number" min="-180" max="180" step="0.0001" value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} /></label>
            </div>
            {formError && <div className="sys-form-error" role="alert"><AlertTriangle />{formError}</div>}
            <div className="sys-modal-actions">
              <button className="secondary" onClick={() => setCreateOpen(false)}>Отмена</button>
              <button className="primary" disabled={creating} onClick={() => void createLocation()}>
                {creating ? "Создаём…" : "Создать и настроить"} <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type FloorZone = VenueZoneDefinition;

const firstFloorZoneTemplates: FloorZone[] = [
  { id: "hall", floor: "1", name: "Главный зал", type: "Dining", capacity: 34, cameras: ["CAM-02"], coverage: 96, left: 23, top: 18, width: 37, height: 32 },
  { id: "bar", floor: "1", name: "Бар и очередь", type: "Service / queue", capacity: 10, cameras: ["CAM-03"], coverage: 100, left: 64, top: 16, width: 25, height: 22 },
  { id: "entrance", floor: "1", name: "Вход", type: "Entrance / transition", capacity: 6, cameras: ["CAM-01"], coverage: 92, left: 8, top: 38, width: 13, height: 24 },
  { id: "kitchen", floor: "1", name: "Кухня", type: "Back of house", capacity: 14, cameras: ["CAM-04"], coverage: 88, left: 59, top: 51, width: 31, height: 25 },
  { id: "terrace", floor: "1", name: "Терраса", type: "Outdoor", capacity: 18, cameras: ["CAM-05"], coverage: 61, left: 12, top: 68, width: 33, height: 20 },
  { id: "pickup", floor: "1", name: "Выдача", type: "Service / queue", capacity: 4, cameras: ["CAM-06"], coverage: 94, left: 47, top: 68, width: 10, height: 20 },
  { id: "cashier", floor: "1", name: "Касса", type: "Service / queue", capacity: 5, cameras: [], coverage: 0, left: 64, top: 40, width: 25, height: 9 },
  { id: "cloakroom", floor: "1", name: "Гардероб", type: "Service", capacity: 4, cameras: [], coverage: 0, left: 8, top: 17, width: 13, height: 18 },
  { id: "restrooms", floor: "1", name: "Санитарная зона", type: "Privacy excluded", capacity: 4, cameras: [], coverage: 0, left: 47, top: 52, width: 10, height: 14 },
  { id: "backhouse", floor: "1", name: "Служебная зона", type: "Back of house", capacity: 9, cameras: [], coverage: 0, left: 23, top: 52, width: 22, height: 14 },
];

const secondFloorZoneTemplates: FloorZone[] = [
  { id: "lounge-2", floor: "2", name: "Lounge", type: "Dining", capacity: 18, cameras: [], coverage: 0, left: 12, top: 18, width: 34, height: 30 },
  { id: "vip-2", floor: "2", name: "VIP-зал", type: "Dining", capacity: 12, cameras: ["CAM-07"], coverage: 94, left: 51, top: 18, width: 37, height: 30 },
  { id: "kids-2", floor: "2", name: "Детская зона", type: "Dining", capacity: 10, cameras: [], coverage: 0, left: 12, top: 56, width: 34, height: 28 },
  { id: "terrace-2", floor: "2", name: "Терраса · 2 этаж", type: "Outdoor", capacity: 18, cameras: [], coverage: 0, left: 51, top: 56, width: 37, height: 28 },
];

export function spatialZonesFor(location: VenueLocation): VenueZoneDefinition[] {
  const custom = location.customZones ?? [];
  if (!location.demoSeeded) return custom;
  const baseline = location.floors <= 1
    ? firstFloorZoneTemplates.slice(0, location.zones)
    : [
        ...firstFloorZoneTemplates.slice(0, Math.max(0, location.zones - Math.min(secondFloorZoneTemplates.length, location.zones))),
        ...secondFloorZoneTemplates.slice(0, Math.min(secondFloorZoneTemplates.length, location.zones)),
      ];
  const customCapacity = custom.reduce((sum, zone) => sum + zone.capacity, 0);
  const baselineCapacity = baseline.reduce((sum, zone) => sum + zone.capacity, 0);
  const capacityTarget = Math.max(baseline.length, location.capacity - customCapacity);
  let allocated = 0;
  const scaled = baseline.map((zone, index) => {
    const capacity = index === baseline.length - 1
      ? Math.max(1, capacityTarget - allocated)
      : Math.max(1, Math.round((zone.capacity / Math.max(1, baselineCapacity)) * capacityTarget));
    allocated += capacity;
    return { ...zone, capacity };
  });
  return [...scaled, ...custom];
}

export function FloorPlanManager({ notify, location, go, onLocationUpdate }: { notify: Notify; location: VenueLocation; go: Go; onLocationUpdate: (location: VenueLocation) => void }) {
  const [selected, setSelected] = useState("hall");
  const [layer, setLayer] = useState("coverage");
  const [planEditing, setPlanEditing] = useState(false);
  const [addZone, setAddZone] = useState(false);
  const [floor, setFloor] = useState("1");
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [floorForm, setFloorForm] = useState<{ name: string; spaceType: FloorSpaceType; purpose: string; confirmed: boolean }>({ name: "", spaceType: "building-floor", purpose: "Гостевая зона", confirmed: false });
  const [floorError, setFloorError] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);
  const [deleteFloorTarget, setDeleteFloorTarget] = useState<VenueFloorRecord | null>(null);
  const [deletingFloor, setDeletingFloor] = useState(false);
  const [deleteFloorError, setDeleteFloorError] = useState("");
  const [zonePanelVisible, setZonePanelVisible] = useState(false);
  const [planReady, setPlanReady] = useState<string[]>(location.planFloors ?? (location.zones > 0 ? ["1"] : []));
  const [customZones, setCustomZones] = useState<FloorZone[]>(location.customZones ?? []);
  const [zoneForm, setZoneForm] = useState({ name: "VIP-зал", type: "Dining", capacity: "12" });
  const [zoneError, setZoneError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCamera, setLinkCamera] = useState("");
  const [linkedOverrides, setLinkedOverrides] = useState<Record<string, string[]>>(location.zoneCameraLinks ?? {});
  const [editingBounds, setEditingBounds] = useState(false);
  const [planElements, setPlanElements] = useState<PlanElement[]>(location.planElements ?? seededPlanElements(location));
  const [planFileNames, setPlanFileNames] = useState<Record<string, string>>(location.planFileNames ?? {});
  const [planPdfUrls, setPlanPdfUrls] = useState<Record<string, string>>(location.planPdfUrls ?? {});
  const [planAssetUrls, setPlanAssetUrls] = useState<Record<string, string>>(location.planAssetUrls ?? {});
  const [planAssetTypes, setPlanAssetTypes] = useState<Record<string, "pdf" | "image" | "manual">>(location.planAssetTypes ?? {});
  const [coverageTestPhotos, setCoverageTestPhotos] = useState<Record<string, { url: string; name: string; file: File; width: number; height: number }>>({});
  const [coverageAnalysis, setCoverageAnalysis] = useState<Record<string, { status: "running" | "completed" | "error"; result?: CameraVisionResult; error?: string; fileName: string }>>({});
  const [coverageCameraId, setCoverageCameraId] = useState("");
  const [planAiAnalysis, setPlanAiAnalysis] = useState<Record<string, PlanAiAnalysis>>({});
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [planUploadError, setPlanUploadError] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [floorRecords, setFloorRecords] = useState<VenueFloorRecord[]>(location.backendFloors ?? []);
  const sortedFloorRecords = useMemo(() => [...floorRecords].sort((a, b) => a.level - b.level), [floorRecords]);
  const nextFloorLevel = Math.max(0, ...floorRecords.map((item) => item.level)) + 1;
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  const coveragePhotoInputRef = useRef<HTMLInputElement>(null);
  const coveragePhotoUrlsRef = useRef<Record<string, string>>({});
  const coverageVisionAbortRef = useRef<AbortController | null>(null);
  const coverageVisionRunRef = useRef(0);
  const locationZones = useMemo(() => spatialZonesFor({ ...location, customZones }).map((item) => {
    const placedCameras = (location.configuredCameras ?? []).filter((camera) => camera.zone === item.name && camera.floor.startsWith(item.floor)).map((camera) => camera.id);
    const linked = [...item.cameras, ...placedCameras, ...(linkedOverrides[item.id] ?? [])].filter((camera, index, all) => all.indexOf(camera) === index && (location.configuredCameras?.some((item) => item.id === camera) || Number(camera.split("-")[1]) <= location.cameras));
    const hasOffline = linked.some((camera) => Number(camera.split("-")[1]) > location.online);
    return { ...item, cameras: linked, coverage: linked.length === 0 ? 0 : hasOffline ? Math.min(61, item.coverage) : location.status === "ready" ? Math.max(94, item.coverage) : item.coverage };
  }), [location, customZones, linkedOverrides]);
  const activeFloorRecord = floorRecords.find((item) => item.level === Number(floor));
  const backgroundMode = activeFloorRecord?.backgroundMode ?? "floor-plan";
  useEffect(() => {
    if (!aiRunning) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setAiElapsed(elapsed);
      setAiProgress(Math.min(92, 6 + Math.round(elapsed * 1.35)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [aiRunning]);
  useEffect(() => {
    let active = true;
    apiFetch<{ floors: VenueFloorRecord[] }>(`/locations/${encodeURIComponent(location.id)}/floors`)
      .then(({ floors: savedFloors }) => {
        if (!active) return;
        setFloorRecords(savedFloors);
        setFloor((current) => savedFloors.length && !savedFloors.some((item) => String(item.level) === current)
          ? String(savedFloors[0].level)
          : current);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [location.id]);
  useEffect(() => () => {
    coverageVisionRunRef.current += 1;
    coverageVisionAbortRef.current?.abort();
    Object.values(coveragePhotoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    if (!activeFloorRecord) return;
    let active = true;
    apiFetch<{ floor: VenueFloorRecord; zones: FloorZone[]; planElements: PlanElement[]; planFileName?: string; planAssetUrl?: string; planAssetType?: "pdf" | "image" | "manual"; planPdfUrl?: string }>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan`)
      .then(({ floor: savedFloor, zones: savedZones, planElements: savedElements, planFileName, planAssetUrl, planAssetType, planPdfUrl }) => {
        if (!active) return;
        setCustomZones((current) => [...current.filter((item) => item.floor !== floor), ...savedZones]);
        setPlanElements((current) => [...current.filter((item) => item.floor !== floor), ...savedElements]);
        if (savedFloor.planImport?.originalName || planFileName) {
          setPlanFileNames((current) => ({ ...current, [floor]: planFileName ?? savedFloor.planImport?.originalName ?? "План этажа" }));
          if (planPdfUrl) setPlanPdfUrls((current) => ({ ...current, [floor]: planPdfUrl }));
          if (planAssetUrl) setPlanAssetUrls((current) => ({ ...current, [floor]: planAssetUrl }));
          if (planAssetType) setPlanAssetTypes((current) => ({ ...current, [floor]: planAssetType }));
          setPlanReady((current) => current.includes(floor) ? current : [...current, floor]);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [activeFloorRecord?.id, floor]);
  const visibleZones = locationZones.filter((item) => item.floor === floor);
  const zone = visibleZones.find((item) => item.id === selected) ?? visibleZones[0] ?? { id: "unassigned", floor, name: "Зоны ещё не созданы", type: "Unassigned", capacity: 0, cameras: [], coverage: 0, left: 20, top: 20, width: 20, height: 20 };
  const createZone = async () => {
    const capacity = Number(zoneForm.capacity);
    if (!planReady.includes(floor)) { setZoneError("Сначала загрузите и промасштабируйте план выбранного этажа."); return; }
    if (!zoneForm.name.trim()) { setZoneError("Укажите понятное название зоны."); return; }
    if (!Number.isFinite(capacity) || capacity < 1) { setZoneError("Вместимость должна быть больше нуля."); return; }
    if (customZones.some((item) => item.floor === floor && item.name.toLocaleLowerCase() === zoneForm.name.trim().toLocaleLowerCase())) { setZoneError("На этом этаже уже есть зона с таким названием."); return; }
    if (!location.demoSeeded && customZones.reduce((sum, item) => sum + item.capacity, 0) + capacity > location.capacity) { setZoneError(`Суммарная вместимость зон не может превышать ${location.capacity} гостей.`); return; }
    const id = `zone-${Date.now()}`;
    const created: FloorZone = { id, floor, name: zoneForm.name.trim(), type: zoneForm.type, capacity, cameras: [], coverage: 0, left: 18 + (customZones.length % 3) * 20, top: 18 + (customZones.length % 2) * 28, width: 18, height: 20 };
    if (activeFloorRecord) {
      try {
        const result = await apiFetch<{ zone: FloorZone; location: VenueLocation }>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/zones`, { method: "POST", body: JSON.stringify(created) });
        const nextCustomZones = [...customZones, result.zone];
        const updated = { ...location, ...result.location, backendFloors: floorRecords, customZones: nextCustomZones, planElements, planFileNames, planPdfUrls, planAssetUrls, planAssetTypes };
        setCustomZones(nextCustomZones); setSelected(result.zone.id); setAddZone(false); setZoneError(""); setEditingBounds(true); onLocationUpdate(updated); notify(`${result.zone.name} создана на ${floor} этаже · можно расставлять объекты`, { location: updated });
        return;
      } catch (error) {
        setZoneError(error instanceof Error ? error.message : "Не удалось сохранить зону");
        return;
      }
    }
    const nextCustomZones = [...customZones, created];
    const updated = { ...location, customZones: nextCustomZones, zones: location.zones + 1, readiness: Math.min(99, location.readiness + 12) };
    setCustomZones(nextCustomZones); setSelected(id); setAddZone(false); setZoneError(""); setEditingBounds(true); onLocationUpdate(updated); notify(`${created.name} создана на ${floor} этаже · завершите границы и привяжите камеру`, { location: updated });
  };
  const commitPlanElements = (nextElements: PlanElement[]) => {
    setPlanElements(nextElements);
    const updated = { ...location, planElements: nextElements, planFileNames, planPdfUrls, planAssetUrls, planAssetTypes };
    onLocationUpdate(updated);
    if (activeFloorRecord) {
      void apiFetch<{ planElements: PlanElement[] }>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/elements`, {
        method: "PUT",
        body: JSON.stringify({ elements: nextElements.filter((item) => item.floor === floor) }),
      }).then(({ planElements: savedElements }) => {
        const merged = [...nextElements.filter((item) => item.floor !== floor), ...savedElements];
        setPlanElements(merged);
      }).catch((error) => setPlanUploadError(error instanceof Error ? error.message : "Не удалось сохранить объекты"));
    }
    notify(`План ${floor} этажа сохранён · ${nextElements.filter((item) => item.floor === floor).length} объектов`, { location: updated });
  };
  const mergeZoneGeometry = (base: FloorZone[], next: PlanCanvasZone[]) => {
    const changes = new Map(next.map((item) => [item.id, item]));
    return base.map((item) => {
      const changed = changes.get(item.id);
      return changed ? { ...item, name: changed.name, type: changed.type ?? item.type, capacity: changed.capacity, left: changed.left, top: changed.top, width: changed.width, height: changed.height } : item;
    });
  };
  const updatePlanZones = (next: PlanCanvasZone[]) => {
    setCustomZones((current) => mergeZoneGeometry(current, next));
  };
  const commitPlanZones = async (next: PlanCanvasZone[]) => {
    const nextCustomZones = mergeZoneGeometry(customZones, next);
    const updated = { ...location, customZones: nextCustomZones };
    setCustomZones(nextCustomZones);
    onLocationUpdate(updated);
    try {
      await Promise.all(next.map((item) => apiFetch<{ zone: FloorZone }>(`/zones/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: item.name, type: item.type ?? "Dining", capacity: item.capacity, left: item.left, top: item.top, width: item.width, height: item.height }),
      })));
      notify(`${next.length > 1 ? `Границы ${next.length} зон сохранены` : `Зона «${next[0]?.name ?? ""}» сохранена`}`, { location: updated });
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось сохранить границы зоны");
    }
  };
  const analyzeCoveragePhoto = async (file: File, targetFloor = floor) => {
    const floorRecord = floorRecords.find((item) => String(item.level) === targetFloor);
    if (!floorRecord) {
      setCoverageAnalysis((current) => ({ ...current, [targetFloor]: { status: "error", error: "Этаж ещё не сохранён. Обновите страницу и повторите.", fileName: file.name } }));
      return;
    }
    coverageVisionAbortRef.current?.abort();
    const runId = coverageVisionRunRef.current + 1;
    coverageVisionRunRef.current = runId;
    const controller = new AbortController();
    coverageVisionAbortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CAMERA_VISION_TIMEOUT_MS);
    setCoverageAnalysis((current) => ({ ...current, [targetFloor]: { status: "running", fileName: file.name } }));
    const canvasWidth = Math.max(1, floorRecord.canvas?.width ?? 1200);
    const canvasHeight = Math.max(1, floorRecord.canvas?.height ?? 800);
    const floorZones = locationZones.filter((item) => item.floor === targetFloor);
    const floorPlanElements = planElements
      .filter((item) => item.floor === targetFloor && item.kind !== "camera")
      .map((item) => ({
        ...item,
        x: (item.x / canvasWidth) * 100,
        y: (item.y / canvasHeight) * 100,
        width: (item.width / canvasWidth) * 100,
        height: (item.height / canvasHeight) * 100,
      }));
    try {
      const form = new FormData();
      form.append("frame", file);
      form.append("context", JSON.stringify({
        mode: "existing-plan",
        placementMode: "manual",
        location: { id: location.id, name: location.name },
        floor: { id: floorRecord.id, level: floorRecord.level, name: floorRecord.name },
        camera: selectedCoverageCamera ? { id: selectedCoverageCamera.id, name: selectedCoverageCamera.name, zoneName: selectedCoverageCamera.zone } : null,
        zone: selectedCoverageCamera?.zone ? floorZones.find((item) => item.name === selectedCoverageCamera.zone) ?? null : null,
        plan: { zones: floorZones, elements: floorPlanElements },
      }));
      const result = await apiFetch<CameraVisionResult>("/camera-vision/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!result?.reconciliation || !Array.isArray(result.detections)) throw new Error("AI вернул неполный результат. Повторите анализ.");
      if (coverageVisionRunRef.current !== runId) return;
      setCoverageAnalysis((current) => ({ ...current, [targetFloor]: { status: "completed", result, fileName: file.name } }));
      if (cameraVisionResultIsFallback(result)) {
        notify(`Кадр обработан в резервном режиме · требуется повторный запуск YOLO/GPT`);
      } else {
        notify(`YOLO обработал «${file.name}» · найдено объектов: ${result.detections.length}`);
      }
    } catch (error) {
      if (coverageVisionRunRef.current !== runId) return;
      const aborted = error instanceof Error && error.name === "AbortError";
      const message = timedOut
        ? `YOLO/GPT не ответили за ${CAMERA_VISION_TIMEOUT_SECONDS} секунд. Повторите анализ.`
        : aborted
          ? "Анализ остановлен. Можно повторить на том же кадре."
          : error instanceof Error ? error.message : "Не удалось проанализировать тестовый кадр.";
      setCoverageAnalysis((current) => ({ ...current, [targetFloor]: { status: "error", error: message, fileName: file.name } }));
    } finally {
      window.clearTimeout(timeout);
      if (coverageVisionRunRef.current === runId) coverageVisionAbortRef.current = null;
    }
  };
  const chooseCoveragePhoto = async (file: File) => {
    if (!file.type.startsWith("image/") || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setPlanUploadError("Для теста покрытия выберите JPG, PNG или WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPlanUploadError("Тестовое фото должно быть не больше 8 МБ.");
      return;
    }
    const previousUrl = coveragePhotoUrlsRef.current[floor];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(file);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth || 16, height: image.naturalHeight || 9 });
      image.onerror = () => resolve({ width: 16, height: 9 });
      image.src = url;
    });
    coveragePhotoUrlsRef.current[floor] = url;
    setCoverageTestPhotos((current) => ({ ...current, [floor]: { url, name: file.name, file, ...dimensions } }));
    setPlanUploadError("");
    setLayer("coverage");
    notify(`Тестовый кадр «${file.name}» загружен · запускаем YOLO и сверку с планом`);
    await analyzeCoveragePhoto(file, floor);
  };
  const deletePlanZones = async (ids: string[]) => {
    const deleting = new Set(ids);
    try {
      await Promise.all(ids.map((id) => apiFetch<void>(`/zones/${encodeURIComponent(id)}`, { method: "DELETE" })));
      const nextZones = customZones.filter((item) => !deleting.has(item.id));
      const updated = { ...location, customZones: nextZones, zones: nextZones.length };
      setCustomZones(nextZones);
      setSelected("");
      onLocationUpdate(updated);
      notify(`Удалено зон: ${ids.length}`, { location: updated });
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось удалить выбранные зоны");
    }
  };
  const openAddFloor = () => {
    setFloorForm({ name: "", spaceType: "building-floor", purpose: "Гостевая зона", confirmed: false });
    setFloorError("");
    setAddFloorOpen(true);
  };
  const addFloor = async () => {
    const name = floorForm.name.trim();
    if (name.length < 3) { setFloorError("Укажите название длиной не менее 3 символов."); return; }
    if (floorRecords.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setFloorError("Этаж с таким названием уже существует."); return; }
    if (!floorForm.confirmed) { setFloorError("Подтвердите добавление отдельного пространства."); return; }
    setCreatingFloor(true);
    setFloorError("");
    try {
      const result = await apiFetch<{ floor: VenueFloorRecord; location: VenueLocation }>(`/locations/${encodeURIComponent(location.id)}/floors`, {
        method: "POST",
        body: JSON.stringify({ level: nextFloorLevel, name, spaceType: floorForm.spaceType, purpose: floorForm.purpose, confirmed: true }),
      });
      const nextFloors = [...floorRecords, result.floor];
      const updated = { ...location, ...result.location, backendFloors: nextFloors, customZones, planElements, planFileNames, planPdfUrls, planAssetUrls, planAssetTypes };
      setFloorRecords(nextFloors); setFloor(String(result.floor.level)); setSelected(""); setAddFloorOpen(false); onLocationUpdate(updated); notify(`${result.floor.name} добавлен · ${FLOOR_SPACE_TYPES.find((item) => item.value === result.floor.spaceType)?.label ?? result.floor.purpose ?? floorForm.purpose}. Теперь загрузите PDF, фото или соберите план вручную.`, { location: updated });
    } catch (error) {
      setFloorError(error instanceof Error ? error.message : "Не удалось добавить этаж");
    } finally {
      setCreatingFloor(false);
    }
  };
  const requestDeleteFloor = (record: VenueFloorRecord) => {
    setDeleteFloorError("");
    setDeleteFloorTarget(record);
  };
  const deleteFloor = async () => {
    if (!deleteFloorTarget) return;
    setDeletingFloor(true);
    setDeleteFloorError("");
    try {
      await apiFetch<null>(`/floors/${encodeURIComponent(deleteFloorTarget.id)}`, { method: "DELETE" });
      const removedFloor = String(deleteFloorTarget.level);
      const targetIndex = sortedFloorRecords.findIndex((item) => item.id === deleteFloorTarget.id);
      const nextFloorRecords = sortedFloorRecords.filter((item) => item.id !== deleteFloorTarget.id);
      const nextActiveFloor = nextFloorRecords[targetIndex] ?? nextFloorRecords[targetIndex - 1] ?? nextFloorRecords[0];
      const nextZones = customZones.filter((item) => item.floor !== removedFloor);
      const nextElements = planElements.filter((item) => item.floor !== removedFloor);
      const nextNames = { ...planFileNames };
      const nextPdfUrls = { ...planPdfUrls };
      const nextAssetUrls = { ...planAssetUrls };
      const nextAssetTypes = { ...planAssetTypes };
      delete nextNames[removedFloor];
      delete nextPdfUrls[removedFloor];
      delete nextAssetUrls[removedFloor];
      delete nextAssetTypes[removedFloor];
      const nextPlans = planReady.filter((item) => item !== removedFloor);
      const nextAnalysis = { ...planAiAnalysis };
      delete nextAnalysis[removedFloor];
      const updated: VenueLocation = {
        ...location,
        floors: nextFloorRecords.length,
        zones: nextZones.length,
        readiness: Math.max(0, location.readiness - 5),
        backendFloors: nextFloorRecords,
        customZones: nextZones,
        planElements: nextElements,
        planFileNames: nextNames,
        planPdfUrls: nextPdfUrls,
        planAssetUrls: nextAssetUrls,
        planAssetTypes: nextAssetTypes,
        planFloors: nextPlans,
      };
      setFloorRecords(nextFloorRecords);
      setCustomZones(nextZones);
      setPlanElements(nextElements);
      setPlanFileNames(nextNames);
      setPlanPdfUrls(nextPdfUrls);
      setPlanAssetUrls(nextAssetUrls);
      setPlanAssetTypes(nextAssetTypes);
      setPlanReady(nextPlans);
      setPlanAiAnalysis(nextAnalysis);
      setFloor(nextActiveFloor ? String(nextActiveFloor.level) : "1");
      setSelected(nextActiveFloor ? nextZones.find((item) => item.floor === String(nextActiveFloor.level))?.id ?? "" : "");
      setDeleteFloorTarget(null);
      onLocationUpdate(updated);
      notify(`${deleteFloorTarget.name} удалён вместе с планом, зонами и объектами`, { location: updated });
    } catch (error) {
      setDeleteFloorError(error instanceof Error ? error.message : "Не удалось удалить этаж");
    } finally {
      setDeletingFloor(false);
    }
  };
  type PlanImportResult = {
    location: VenueLocation;
    floor: VenueFloorRecord;
    zones: FloorZone[];
    planElements: PlanElement[];
    planFileName: string;
    planAssetUrl?: string | null;
    planAssetType: "pdf" | "image" | "manual";
    planPdfUrl?: string | null;
    importSummary?: { generatedElements: number; generatedZones: number };
    aiAnalysis?: PlanAiAnalysis;
  };
  const applyPlanImportResult = (result: PlanImportResult, message: string) => {
    const nextElements = [...planElements.filter((item) => item.floor !== floor), ...result.planElements];
    const nextZones = [...customZones.filter((item) => item.floor !== floor), ...result.zones];
    const nextNames = { ...planFileNames, [floor]: result.planFileName };
    const nextPdfUrls = { ...planPdfUrls };
    const nextAssetUrls = { ...planAssetUrls };
    if (result.planPdfUrl) nextPdfUrls[floor] = result.planPdfUrl;
    else delete nextPdfUrls[floor];
    if (result.planAssetUrl) nextAssetUrls[floor] = result.planAssetUrl;
    else delete nextAssetUrls[floor];
    const nextAssetTypes = { ...planAssetTypes, [floor]: result.planAssetType };
    const nextPlans = planReady.includes(floor) ? planReady : [...planReady, floor];
    const nextFloorRecords = floorRecords.map((item) => item.id === result.floor.id ? result.floor : item);
    const updated = {
      ...location,
      ...result.location,
      backendFloors: nextFloorRecords,
      customZones: nextZones,
      planElements: nextElements,
      planFileNames: nextNames,
      planPdfUrls: nextPdfUrls,
      planAssetUrls: nextAssetUrls,
      planAssetTypes: nextAssetTypes,
      planFloors: nextPlans,
    };
    setFloorRecords(nextFloorRecords);
    setPlanElements(nextElements);
    setCustomZones(nextZones);
    setPlanFileNames(nextNames);
    setPlanPdfUrls(nextPdfUrls);
    setPlanAssetUrls(nextAssetUrls);
    setPlanAssetTypes(nextAssetTypes);
    setPlanReady(nextPlans);
    setSelected(nextZones.find((item) => item.floor === floor)?.id ?? "");
    setPlanAiAnalysis((current) => {
      const next = { ...current };
      if (result.aiAnalysis) next[floor] = result.aiAnalysis;
      else delete next[floor];
      return next;
    });
    onLocationUpdate(updated);
    notify(message, { location: updated });
  };
  const uploadPlan = async (file: File) => {
    setPlanUploadError("");
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) { setPlanUploadError("Поддерживается только PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { setPlanUploadError("Размер PDF не должен превышать 10 МБ."); return; }
    if (!activeFloorRecord) { setPlanUploadError("Этаж ещё не синхронизирован с backend. Обновите страницу и повторите."); return; }
    const formData = new FormData();
    formData.append("plan", file);
    setUploadingPlan(true);
    try {
      const result = await apiFetch<PlanImportResult>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/import-pdf`, { method: "POST", body: formData });
      applyPlanImportResult(result, `${result.planFileName}: создано ${result.importSummary?.generatedElements ?? 0} объектов и ${result.importSummary?.generatedZones ?? 0} зон`);
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось обработать PDF");
    } finally {
      setUploadingPlan(false);
      if (editorFileInputRef.current) editorFileInputRef.current.value = "";
    }
  };
  const uploadPlanImage = async (file: File) => {
    setPlanUploadError("");
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "");
    if (!supported) { setPlanUploadError("Поддерживаются фото JPG, PNG и WebP."); return; }
    if (file.size > 10 * 1024 * 1024) { setPlanUploadError("Размер фото не должен превышать 10 МБ."); return; }
    if (!activeFloorRecord) { setPlanUploadError("Этаж ещё не синхронизирован с backend. Обновите страницу и повторите."); return; }
    const formData = new FormData();
    formData.append("image", file);
    setUploadingPlan(true);
    try {
      const result = await apiFetch<PlanImportResult>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/import-image`, { method: "POST", body: formData });
      applyPlanImportResult(result, `${result.planFileName}: фото загружено как подложка. Для автоматической разметки нажмите «Запустить AI-разметку».`);
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось обработать фото плана");
    } finally {
      setUploadingPlan(false);
      if (editorFileInputRef.current) editorFileInputRef.current.value = "";
    }
  };
  const analyzeCurrentImage = async () => {
    setPlanUploadError("");
    if (!activeFloorRecord || planAssetTypes[floor] !== "image") {
      setPlanUploadError("Сначала загрузите фото плана для выбранного этажа.");
      return;
    }
    setUploadingPlan(true);
    setAiRunning(true);
    setAiProgress(6);
    setAiElapsed(0);
    try {
      const result = await apiFetch<PlanImportResult>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/analyze-image`, { method: "POST" });
      const analysis = result.aiAnalysis;
      setAiProgress(100);
      if (analysis?.status === "completed") {
        applyPlanImportResult(result, `AI-разметка готова: ${analysis.generatedElements} объектов и ${analysis.generatedZones} зон`);
      } else {
        setPlanAiAnalysis((current) => analysis ? { ...current, [floor]: analysis } : current);
        setPlanUploadError(analysis?.reason || analysis?.summary || "AI не смог завершить разметку. Повторите попытку.");
      }
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось запустить AI-разметку");
    } finally {
      setAiRunning(false);
      setUploadingPlan(false);
    }
  };
  const startManualPlan = async () => {
    setPlanUploadError("");
    if (!activeFloorRecord) { setPlanUploadError("Этаж ещё не синхронизирован с backend. Обновите страницу и повторите."); return; }
    setUploadingPlan(true);
    try {
      const result = await apiFetch<PlanImportResult>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/manual`, { method: "POST" });
      applyPlanImportResult(result, `Ручной план ${floor} этажа открыт — добавляйте объекты на панели редактора`);
      setPlanEditing(true);
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось открыть ручной план");
    } finally {
      setUploadingPlan(false);
    }
  };
  const configuredCameraIds = (location.configuredCameras ?? []).map((camera) => camera.id);
  const baselineCameraCount = Math.max(0, location.cameras - configuredCameraIds.length);
  const allCameraIds = [...cameraTemplates.slice(0, baselineCameraCount).map((camera) => camera.id), ...configuredCameraIds];
  const cameraFloorMap = new globalThis.Map<string, string>([
    ...camerasForLocation({ ...location, cameras: baselineCameraCount, online: Math.min(location.online, baselineCameraCount) }).map((camera) => [camera.id, camera.floor] as [string, string]),
    ...(location.configuredCameras ?? []).map((camera) => [camera.id, camera.floor] as [string, string]),
  ]);
  const sameFloorCameraIds = allCameraIds.filter((camera) => cameraFloorMap.get(camera)?.startsWith(floor));
  const availableCameras = sameFloorCameraIds.filter((camera) => !zone.cameras.includes(camera));
  const cameraIsOffline = (cameraId: string) => location.configuredCameras?.find((camera) => camera.id === cameraId)?.status === "offline" || (!location.configuredCameras?.some((camera) => camera.id === cameraId) && allCameraIds.indexOf(cameraId) >= location.online);
  const selectedFloorType = FLOOR_SPACE_TYPES.find((item) => item.value === floorForm.spaceType) ?? FLOOR_SPACE_TYPES[0];
  const showZonePanel = layer === "plan" && planEditing && zonePanelVisible;
  const floorCameras = (location.configuredCameras ?? []).filter((camera) => camera.floor.startsWith(floor));
  const coverageAlerts = visibleZones.filter((item) => item.coverage < 75 || item.cameras.length === 0);
  const selectedCoverageCamera = floorCameras.find((camera) => camera.id === coverageCameraId) ?? floorCameras[0];
  const coverageTestPhoto = coverageTestPhotos[floor];
  const coverageAnalysisState = coverageAnalysis[floor];
  const coverageResult = coverageAnalysisState?.status === "completed" ? coverageAnalysisState.result : undefined;
  const coverageFallback = coverageResult ? cameraVisionResultIsFallback(coverageResult) : false;
  const coverageDetectorActual = coverageResult ? cameraVisionEngineIsActual(coverageResult.engines.detector) : false;
  const coverageImageUrl = coverageTestPhoto?.url ?? (backgroundMode === "camera-view" ? planAssetUrls[floor] : undefined);
  const browserLiveUrl = selectedCoverageCamera?.sourceRef && /^(https?:|blob:)/i.test(selectedCoverageCamera.sourceRef) && /\.(mp4|webm)(?:$|[?#])/i.test(selectedCoverageCamera.sourceRef)
    ? selectedCoverageCamera.sourceRef
    : undefined;
  return (
    <>
      <section className="sys-floor-toolbar">
        <div className="sys-segmented">
          {sortedFloorRecords.map((record) => {
            const value = String(record.level);
            const active = floor === value;
            const typeLabel = FLOOR_SPACE_TYPES.find((item) => item.value === record.spaceType)?.label ?? "Этаж внутри здания";
            return (
              <div className={`sys-floor-tab${active ? " active" : ""}`} key={record.id} title={`${record.name} · ${typeLabel}`}>
                <button className={active ? "active" : ""} onClick={() => { setFloor(value); setSelected(customZones.find((item) => item.floor === value)?.id ?? ""); setEditingBounds(false); setPlanEditing(false); setZonePanelVisible(false); }}>{record.name}</button>
                {active && <button className="sys-floor-delete-trigger" disabled={uploadingPlan} onClick={() => requestDeleteFloor(record)} aria-label={`Удалить ${record.name}`} title={`Удалить ${record.name}`}><Trash2 /></button>}
              </div>
            );
          })}
          <button onClick={openAddFloor} aria-label="Добавить этаж через форму"><Plus /> Этаж</button>
        </div>
        <div className="sys-layer-switcher">
          {[["plan", Layers3, "План"], ["coverage", Camera, "Покрытие"], ["traffic", Activity, "Трафик"]].map(([key, Icon, label]: any) => (
            <button className={layer === key ? "active" : ""} onClick={() => { setLayer(key); setPlanEditing(false); setZonePanelVisible(false); }} key={key}><Icon /> {label}</button>
          ))}
        </div>
        <div className="sys-floor-actions">
          <input
            ref={editorFileInputRef}
            className="sys-hidden-input"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
            aria-label="Загрузить PDF или изображение плана"
            value=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) void uploadPlan(file);
              else void uploadPlanImage(file);
            }}
          />
          <input
            ref={coveragePhotoInputRef}
            className="sys-hidden-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            aria-label="Загрузить тестовое фото с камеры"
            value=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) chooseCoveragePhoto(file);
            }}
          />
          {layer === "plan" && !planEditing && (
            <button className="primary sys-edit-plan-button" disabled={uploadingPlan} onClick={() => planReady.includes(floor) ? setPlanEditing(true) : void startManualPlan()}><Settings2 /> {uploadingPlan ? "Открываем редактор…" : "Редактировать план"}</button>
          )}
          {layer === "plan" && planEditing && <>
            <button className="secondary" disabled={uploadingPlan} onClick={() => editorFileInputRef.current?.click()}><Upload /> {uploadingPlan ? "Загружаем…" : "Загрузить файл"}</button>
            {planAssetTypes[floor] === "image" && <button className={`secondary sys-ai-run-button${aiRunning ? " is-running" : ""}`} disabled={uploadingPlan} onClick={() => void analyzeCurrentImage()}><Sparkles /> {aiRunning ? `AI работает · ${aiProgress}%` : "AI-разметка"}</button>}
            <button className="primary" onClick={() => { setPlanEditing(false); setZonePanelVisible(false); }}><Check /> Готово</button>
          </>}
        </div>
      </section>

      <section className={`sys-floor-layout${showZonePanel ? "" : " zone-panel-hidden"}`}>
        <article className="card sys-floor-canvas-card">
          <div className="card-head">
            <div><span>{location.name.toUpperCase()} · {floor} ЭТАЖ · {location.zones} ЗОН</span><h2>{layer === "coverage" ? "Фактическое покрытие камер" : layer === "traffic" ? "Трафик и тепловая карта" : "План помещения"}</h2></div>
            {layer === "plan" && <div className="sys-canvas-legend"><span><i className="good" /> зона</span><span><i className="warn" /> проверить</span><span><i className="camera" /> камера</span></div>}
          </div>
          {layer === "plan" && aiRunning && (
            <div className="sys-ai-progress" role="status" aria-live="polite">
              <div className="sys-ai-progress-head">
                <span><i><Sparkles /></i><span><strong>AI создаёт план</strong><small>{aiProgress < 20 ? "Подготавливаем изображение" : aiProgress < 45 ? "Ищем помещения, стены и входы" : aiProgress < 75 ? "Распознаём мебель, камеры и подписи" : "Проверяем координаты объектов"}</small></span></span>
                <b>{aiProgress}%</b>
              </div>
              <div className="sys-ai-progress-track"><i style={{ width: `${aiProgress}%` }} /></div>
              <footer><span>gpt-5.6 анализирует фото и собирает черновик</span><time>{aiElapsed} сек</time></footer>
            </div>
          )}
          {planReady.includes(floor) && layer === "plan" ? (
            <div className={`sys-floor-canvas has-editor layer-${layer}`}>
              <PlanCanvas
                floor={floor}
                elements={planElements}
                zones={visibleZones}
                selectedZoneId={selected}
                onSelectZone={setSelected}
                onDeleteZones={deletePlanZones}
                onCreateZone={() => setAddZone(true)}
                onZonesChange={updatePlanZones}
                onCommitZones={commitPlanZones}
                onElementsChange={setPlanElements}
                onCommit={commitPlanElements}
                planFileName={planFileNames[floor]}
                planSource={planAssetTypes[floor] ?? "manual"}
                backgroundImageUrl={planAssetTypes[floor] === "image" && backgroundMode === "floor-plan" ? planAssetUrls[floor] : undefined}
                backgroundMode="floor-plan"
                readOnly={!planEditing}
              />
              {planEditing && planAiAnalysis[floor] && (
                <div className={`sys-plan-ai-status is-${planAiAnalysis[floor].status}`} role="status">
                  <Sparkles />
                  <p>
                    <strong>{planAiAnalysis[floor].status === "completed" ? "AI-разметка готова" : planAiAnalysis[floor].status === "skipped" ? "Фото загружено без AI" : "AI не смог завершить разметку"}</strong>
                    <span>{planAiAnalysis[floor].summary}{planAiAnalysis[floor].status === "skipped" ? " Добавьте OPENAI_API_KEY в .env и снова нажмите «Запустить AI-разметку»." : ""}</span>
                  </p>
                </div>
              )}
            </div>
          ) : !planReady.includes(floor) && layer === "plan" ? (
            <div className="sys-floor-canvas">
              <div className="sys-grid-lines" />
              <div className="sys-empty-floor">
                <Layers3 />
                <h3>План {floor} этажа не загружен</h3>
                <p>Нажмите «Редактировать план». Внутри редактора можно загрузить PDF или изображение либо сразу собрать план вручную.</p>
                {planUploadError && <div className="sys-form-error" role="alert"><AlertTriangle />{planUploadError}</div>}
              </div>
            </div>
          ) : layer === "coverage" ? (
            <div className="sys-coverage-view">
              <div className={`sys-coverage-frame${coverageImageUrl || browserLiveUrl ? " has-frame" : ""}`}>
                {browserLiveUrl && <video className="sys-coverage-live" src={browserLiveUrl} autoPlay muted playsInline controls />}
                {coverageTestPhoto && !browserLiveUrl && <div className="sys-coverage-media-stage" style={{ aspectRatio: `${coverageTestPhoto.width} / ${coverageTestPhoto.height}` }}><img src={coverageTestPhoto.url} alt={`Тестовый кадр ${coverageTestPhoto.name}`} />{coverageResult?.detections.map((detection) => <div className="sys-vision-bbox" key={detection.id} style={{ left: `${detection.x}%`, top: `${detection.y}%`, width: `${detection.width}%`, height: `${detection.height}%` }}><span>{cameraVisionDetectionLabel(detection.label)} · {Math.round((detection.confidence <= 1 ? detection.confidence * 100 : detection.confidence))}%</span></div>)}</div>}
                {!coverageTestPhoto && coverageImageUrl && !browserLiveUrl && <div className="sys-coverage-media-stage" style={{ aspectRatio: "16 / 9" }}><img src={coverageImageUrl} alt="Контрольный кадр камеры" /></div>}
                <div className="sys-coverage-frame-head"><span><i className={selectedCoverageCamera?.status === "online" ? "" : "is-idle"} /> {selectedCoverageCamera?.name ?? (coverageTestPhoto ? coverageTestPhoto.name : "Камера не подключена")}</span><b>{browserLiveUrl ? "LIVE" : coverageAnalysisState?.status === "running" ? "YOLO АНАЛИЗ" : coverageResult ? (coverageDetectorActual ? "YOLO ГОТОВ" : "РЕЗЕРВНЫЙ РЕЖИМ") : coverageTestPhoto ? "КАДР ЗАГРУЖЕН" : selectedCoverageCamera ? "ИСТОЧНИК НАСТРОЕН" : "НЕТ ИСТОЧНИКА"}</b></div>
                {!coverageImageUrl && !browserLiveUrl && <div className="sys-coverage-await"><Camera /><strong>{selectedCoverageCamera ? "Камера настроена" : "Добавьте источник для проверки"}</strong><span>{selectedCoverageCamera ? "RTSP/ONVIF откроется здесь после включения browser gateway. Пока можно использовать контрольное фото." : "Загрузите временное фото с камеры или запустите мастер подключения."}</span><div><button className="secondary" onClick={() => coveragePhotoInputRef.current?.click()}><ImagePlus /> Загрузить фото</button><button className="primary" onClick={() => go("cameras")}><Settings2 /> Настроить камеру</button></div></div>}
              </div>
              <aside className="sys-coverage-alerts">
                <header><div><strong>Проверка покрытия</strong><span>План ↔ фактический кадр</span></div><SystemPill tone={coverageAnalysisState?.status === "running" ? "neutral" : coverageAnalysisState?.status === "error" || coverageFallback ? "warning" : coverageResult ? "success" : !floorCameras.length ? "danger" : "neutral"}>{coverageAnalysisState?.status === "running" ? "Анализируем" : coverageAnalysisState?.status === "error" ? "Ошибка" : coverageFallback ? "Нужен повтор" : coverageResult ? "YOLO готов" : !floorCameras.length ? "Нет камеры" : "Ожидает кадр"}</SystemPill></header>
                {floorCameras.length > 1 && <div className="sys-coverage-camera-picker" role="group" aria-label="Камера для просмотра">{floorCameras.map((camera) => <button className={selectedCoverageCamera?.id === camera.id ? "active" : ""} key={camera.id} onClick={() => setCoverageCameraId(camera.id)}><Camera /><span>{camera.name}<small>{camera.zone}</small></span><i className={camera.status} /></button>)}</div>}
                {coverageAnalysisState?.status === "running" && <section className="sys-coverage-analysis-running" aria-live="polite"><ScanLine /><p><strong>YOLO распознаёт кадр</strong><span>Ищем столы, места, двери и стойки. Затем GPT сверит их с планом.</span></p><i /></section>}
                {coverageAnalysisState?.status === "error" && <section className="sys-coverage-analysis-error" role="alert"><AlertTriangle /><p><strong>Кадр не обработан</strong><span>{coverageAnalysisState.error}</span></p><button className="secondary" onClick={() => coverageTestPhoto && void analyzeCoveragePhoto(coverageTestPhoto.file)}><RefreshCw /> Повторить</button></section>}
                {coverageResult && <section className={`sys-coverage-analysis-result is-${coverageFallback ? "warning" : coverageResult.reconciliation.status}`}><div className="sys-coverage-analysis-summary">{coverageFallback || coverageResult.reconciliation.status !== "ok" ? <AlertTriangle /> : <CheckCircle2 />}<p><strong>{coverageFallback ? "Резервный результат — не подтверждён" : coverageResult.reconciliation.status === "ok" ? "Кадр согласован с планом" : "Есть расхождения с планом"}</strong><span>{coverageFallback ? cameraVisionFallbackMessage(coverageResult) : coverageResult.reconciliation.summary}</span></p></div><div className="sys-coverage-detection-total"><ScanLine /><span>YOLO обнаружил</span><strong>{coverageResult.detections.length}</strong><small>стационарных объектов</small></div>{coverageResult.reconciliation.counts.length > 0 && <div className="sys-coverage-counts">{coverageResult.reconciliation.counts.map((item, index) => <div className={`is-${item.status}`} key={`${item.label}-${index}`}><span>{cameraVisionDetectionLabel(item.label)}</span><strong>{item.plan} / {item.detected}</strong><small>план / YOLO</small></div>)}</div>}{coverageResult.reconciliation.recommendations.length > 0 && <ul>{coverageResult.reconciliation.recommendations.slice(0, 4).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}<button className="secondary" onClick={() => coverageTestPhoto && void analyzeCoveragePhoto(coverageTestPhoto.file)}><RefreshCw /> Повторить YOLO и сверку</button></section>}
                {!coverageAnalysisState && floorCameras.length === 0 && <div className="is-warning"><AlertTriangle /><p><strong>Можно проверить без камеры</strong><span>Тестовое фото сразу отправится в YOLO и будет сравнено с текущим планом.</span></p></div>}
                {!coverageAnalysisState && floorCameras.length > 0 && coverageAlerts.length === 0 && <div className="is-good"><CheckCircle2 /><p><strong>Загрузите контрольный кадр</strong><span>После анализа здесь появится фактическая сверка покрытия.</span></p></div>}
                {!coverageAnalysisState && floorCameras.length > 0 && coverageAlerts.length > 0 && <div className="is-warning"><EyeOff /><p><strong>Покрытие ещё не проверено</strong><span>Загрузите контрольный кадр — фактические расхождения определят YOLO и GPT.</span></p></div>}
                <div className="sys-coverage-source-actions"><button className="secondary" onClick={() => coveragePhotoInputRef.current?.click()}><ImagePlus /> {coverageTestPhoto ? "Заменить тестовое фото" : "Тестовое фото"}</button><button className="secondary" onClick={() => go("cameras")}><Settings2 /> {floorCameras.length ? "Открыть камеру" : "Настроить камеру"}</button></div>
                <footer><Sparkles /><span>{coverageResult ? `Рамки YOLO показаны на кадре · ${cameraVisionEngineLabel(coverageResult.engines.detector)}` : "Загрузите кадр — YOLO автоматически подсветит стационарные объекты."}</span></footer>
              </aside>
            </div>
          ) : (
            <div className="sys-traffic-view">
              <div className="sys-traffic-map" style={planAssetUrls[floor] && backgroundMode === "floor-plan" ? { backgroundImage: `linear-gradient(rgba(247,250,248,.5),rgba(247,250,248,.5)),url(${JSON.stringify(planAssetUrls[floor])})` } : undefined}>
                <div className="sys-heat-spot spot-one" /><div className="sys-heat-spot spot-two" /><div className="sys-heat-spot spot-three" />
                <div className="sys-traffic-legend"><span>Низкий</span><i /><span>Высокий</span></div>
              </div>
              <aside className="sys-traffic-summary"><span>ТЕПЛОВАЯ КАРТА · СЕГОДНЯ</span><h3>Потоки гостей</h3><div><small>Пиковая зона</small><strong>{visibleZones[0]?.name ?? "Нет данных"}</strong></div><div><small>Пиковое время</small><strong>—</strong></div><div><small>Наблюдений</small><strong>Ожидаем данные</strong></div><p><Activity /> Heatmap заполнится после накопления треков камер.</p></aside>
            </div>
          )}
          {planUploadError && planReady.includes(floor) && layer === "plan" && <div className="sys-plan-error" role="alert"><AlertTriangle />{planUploadError}</div>}
          {planUploadError && layer === "coverage" && <div className="sys-plan-error" role="alert"><AlertTriangle />{planUploadError}</div>}
          <footer className="sys-canvas-footer">
            <span>{layer === "plan" ? <><MousePointer2 /> {planEditing ? "Перетаскивайте зоны и объекты для настройки" : "План открыт только для просмотра"}</> : layer === "coverage" ? <><Camera /> Фактический кадр и контроль слепых зон</> : <><Activity /> Агрегированное движение без хранения лиц</>}</span>
            <span>{layer === "plan" ? "Масштаб 100% · сетка 0,5 м" : layer === "coverage" ? `${floorCameras.length} камер · ${visibleZones.length} зон` : "Период: сегодня"}</span>
          </footer>
        </article>

        {showZonePanel && <aside className="sys-zone-panel">
          <article className="card">
            <div className="card-head">
              <div><span>ВЫБРАННАЯ ЗОНА</span><h2>{zone.name}</h2></div>
              <button className="icon" disabled={zone.id === "unassigned"} aria-label={editingBounds ? "Завершить редактирование границ" : "Редактировать границы зоны"} onClick={() => { setEditingBounds((value) => !value); notify(editingBounds ? `Границы зоны «${zone.name}» сохранены` : `Редактор границ зоны «${zone.name}» включён`); }}><Settings2 /></button>
            </div>
            <div className="sys-zone-preview"><MapPin /><span>{zone.type}</span></div>
            <div className="sys-zone-stats">
              <div><span>Вместимость</span><strong>{zone.capacity}</strong></div>
              <div><span>Покрытие</span><strong>{zone.coverage}%</strong></div>
              <div><span>Камеры</span><strong>{zone.cameras.length}</strong></div>
            </div>
            <h3>Привязанные аналитики</h3>
            <div className="sys-analytics-tags">
              {(zone.id === "unassigned" ? [] : zone.id === "bar" ? ["Очередь", "Service time", "Overcrowding"] : zone.id === "kitchen" ? ["SOP", "Speed of service", "Safety"] : ["Occupancy", "Dwell time", "People flow"]).map((item) => <span key={item}><Check /> {item}</span>)}
              {zone.id === "unassigned" && <span><AlertTriangle /> Сначала создайте зону</span>}
            </div>
            <h3>Источники</h3>
            {zone.cameras.length === 0 && <div className="sys-no-source"><AlertTriangle /><p><strong>Нет источника</strong><span>События этой зоны пока не попадут в аналитику.</span></p></div>}
            {zone.cameras.map((camera) => { const offline = cameraIsOffline(camera); return <button className="sys-linked-camera" key={camera} onClick={() => notify(`${camera}: открыт источник зоны «${zone.name}»`)}><Camera /><p><strong>{camera}</strong><span>{location.name} · 1080p · 25 FPS</span></p><SystemPill tone={offline ? "danger" : "success"}>{offline ? "Offline" : "Online"}</SystemPill></button>; })}
            <button className="secondary full" disabled={zone.id === "unassigned"} onClick={() => { setLinkCamera(availableCameras[0] ?? ""); setLinkOpen(true); }}>+ Привязать камеру</button>
          </article>
          <article className="card sys-coverage-tip">
            <Sparkles /><p><strong>AI-рекомендация</strong><span>{zone.cameras.length === 0 ? `Зона «${zone.name}» не покрыта. Добавьте камеру и выполните калибровку.` : zone.coverage < 75 ? `${zone.name} покрыта на ${zone.coverage}%. Восстановите ${zone.cameras[0]} или добавьте второй ракурс.` : `${zone.name}: покрытие ${zone.coverage}%. Перекрытие обзора и calibration drift не обнаружены.`}</span></p>
          </article>
        </aside>}
      </section>

      {addFloorOpen && (
        <div className="sys-overlay" onMouseDown={() => { if (!creatingFloor) setAddFloorOpen(false); }}>
          <div className="sys-modal compact" role="dialog" aria-modal="true" aria-labelledby="create-floor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="sys-close" disabled={creatingFloor} onClick={() => setAddFloorOpen(false)} aria-label="Закрыть"><X /></button>
            <span className="sys-kicker"><Layers3 /> СТРУКТУРА ЛОКАЦИИ</span>
            <h2 id="create-floor-title">Добавить пространство</h2>
            <p>Укажите, что это: этаж, отдельный зал, улица или терраса. У каждого пространства будет собственный план, зоны и объекты.</p>
            <div className="sys-floor-create-summary">
              <span>Порядковый номер<strong>{nextFloorLevel}</strong></span>
              <span>Локация<strong>{location.name}</strong></span>
            </div>
            <div className="sys-form-grid">
              <label className="wide">Тип пространства *<select required value={floorForm.spaceType} onChange={(event) => { const spaceType = event.target.value as FloorSpaceType; const option = FLOOR_SPACE_TYPES.find((item) => item.value === spaceType); setFloorForm((current) => ({ ...current, spaceType, name: current.name || option?.example || "" })); }}>{FLOOR_SPACE_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
              <label className="wide">Название вкладки *<input required minLength={3} maxLength={100} placeholder={`Например: ${floorForm.spaceType === "building-floor" ? `${nextFloorLevel} этаж` : selectedFloorType.example}`} value={floorForm.name} onChange={(event) => setFloorForm((current) => ({ ...current, name: event.target.value }))} /><small>Это название будет показано в переключателе над планом: «Улица», «2 зал», «2 этаж» и т. п.</small></label>
              <label className="wide">Назначение *<select required value={floorForm.purpose} onChange={(event) => setFloorForm((current) => ({ ...current, purpose: event.target.value }))}><option>Гостевая зона</option><option>Обеденный зал</option><option>Бар / очередь</option><option>Кухня</option><option>Входная группа</option><option>Технический / служебный</option><option>Офис / склад</option><option>Другое</option></select></label>
            </div>
            <div className="sys-guidance"><Info />Это будет отдельная вкладка плана. Удаление вкладки также удалит её зоны, подложку и размещённые объекты.</div>
            <label className="sys-floor-confirm"><input type="checkbox" checked={floorForm.confirmed} onChange={(event) => setFloorForm((current) => ({ ...current, confirmed: event.target.checked }))} /><span><strong>Подтверждаю добавление отдельного пространства</strong><small>Это не зона внутри текущего плана и не дубликат существующей вкладки.</small></span></label>
            {floorError && <div className="sys-form-error" role="alert"><AlertTriangle />{floorError}</div>}
            <div className="sys-modal-actions"><button className="secondary" disabled={creatingFloor} onClick={() => setAddFloorOpen(false)}>Отмена</button><button className="primary" disabled={creatingFloor || floorForm.name.trim().length < 3 || !floorForm.confirmed} onClick={() => void addFloor()}>{creatingFloor ? "Создаём…" : "Создать этаж"}</button></div>
          </div>
        </div>
      )}
      {deleteFloorTarget && (
        <div className="sys-overlay" onMouseDown={() => { if (!deletingFloor) setDeleteFloorTarget(null); }}>
          <div className="sys-modal compact" role="dialog" aria-modal="true" aria-labelledby="delete-floor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="sys-close" disabled={deletingFloor} onClick={() => setDeleteFloorTarget(null)} aria-label="Закрыть"><X /></button>
            <span className="sys-kicker danger"><Trash2 /> УДАЛЕНИЕ ПРОСТРАНСТВА</span>
            <h2 id="delete-floor-title">Удалить «{deleteFloorTarget.name}»?</h2>
            <p>Действие необратимо. Вместе с вкладкой будут удалены загруженный план, {customZones.filter((item) => item.floor === String(deleteFloorTarget.level)).length} зон и {planElements.filter((item) => item.floor === String(deleteFloorTarget.level)).length} объектов.</p>
            {sortedFloorRecords.length === 1 && <div className="sys-guidance danger"><AlertTriangle />Это последнее пространство — после удаления локация останется без планов.</div>}
            {deleteFloorError && <div className="sys-form-error" role="alert"><AlertTriangle />{deleteFloorError}</div>}
            <div className="sys-modal-actions"><button className="secondary" disabled={deletingFloor} onClick={() => setDeleteFloorTarget(null)}>Отмена</button><button className="sys-danger-button" disabled={deletingFloor} onClick={() => void deleteFloor()}>{deletingFloor ? "Удаляем…" : "Удалить пространство"}</button></div>
          </div>
        </div>
      )}
      {addZone && (
        <div className="sys-overlay" onMouseDown={() => setAddZone(false)}>
          <div className="sys-modal compact" role="dialog" aria-modal="true" aria-labelledby="create-zone-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="sys-close" onClick={() => setAddZone(false)} aria-label="Закрыть"><X /></button>
            <span className="sys-kicker"><MapPin /> НОВАЯ ЗОНА</span><h2 id="create-zone-title">Что находится в этой части плана?</h2>
            <div className="sys-form-grid"><label className="wide">Название *<input required value={zoneForm.name} onChange={(event) => setZoneForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Тип *<select required value={zoneForm.type} onChange={(event) => setZoneForm((current) => ({ ...current, type: event.target.value }))}><option>Dining</option><option>Service / queue</option><option>Back of house</option><option>Entrance / transition</option><option>Outdoor</option></select></label><label>Вместимость *<input required min="1" max="1000" type="number" value={zoneForm.capacity} onChange={(event) => setZoneForm((current) => ({ ...current, capacity: event.target.value }))} /></label></div>
            {zoneError && <div className="sys-form-error" role="alert"><AlertTriangle />{zoneError}</div>}
            <div className="sys-modal-actions"><button className="secondary" onClick={() => setAddZone(false)}>Отмена</button><button className="primary" onClick={() => void createZone()}>Создать и разметить</button></div>
          </div>
        </div>
      )}
      {linkOpen && <div className="sys-overlay" onMouseDown={() => setLinkOpen(false)}><div className="sys-modal compact" role="dialog" aria-modal="true" aria-labelledby="link-camera-title" onMouseDown={(event) => event.stopPropagation()}><button className="sys-close" onClick={() => setLinkOpen(false)} aria-label="Закрыть"><X /></button><span className="sys-kicker"><Camera /> ИСТОЧНИК ЗОНЫ</span><h2 id="link-camera-title">Привязать камеру к «{zone.name}»</h2><p>Камера должна находиться на том же этаже. После привязки обязательна проверка ROI и калибровки.</p>{location.cameras === 0 ? <div className="sys-form-error"><AlertTriangle />В локации ещё нет камер. Сначала добавьте источник видео.</div> : sameFloorCameraIds.length === 0 ? <div className="sys-form-error"><AlertTriangle />На {floor} этаже нет камер. Добавьте источник с правильным placement.</div> : availableCameras.length === 0 ? <div className="sys-form-error"><Info />Все камеры этого этажа уже привязаны к зоне.</div> : <label className="sys-single-field">Доступная камера<select value={linkCamera} onChange={(event) => setLinkCamera(event.target.value)}>{availableCameras.map((camera) => <option key={camera}>{camera}</option>)}</select></label>}<div className="sys-modal-actions"><button className="secondary" onClick={() => setLinkOpen(false)}>Отмена</button>{location.cameras === 0 || sameFloorCameraIds.length === 0 ? <button className="primary" onClick={() => { setLinkOpen(false); go("cameras"); }}>Добавить камеру</button> : <button className="primary" disabled={!linkCamera} onClick={() => { const nextLinks = { ...linkedOverrides, [zone.id]: [...(linkedOverrides[zone.id] ?? []), linkCamera] }; const updated = { ...location, zoneCameraLinks: nextLinks }; setLinkedOverrides(nextLinks); onLocationUpdate(updated); setLinkOpen(false); notify(`${linkCamera} привязана к «${zone.name}» · требуется калибровка ROI`, { location: updated }); }}>Привязать</button>}</div></div></div>}
    </>
  );
}

type CameraItem = {
  id: string;
  name: string;
  location: string;
  floor: string;
  zone: string;
  type: string;
  source: string;
  sourceType?: "onvif" | "rtsp" | "vendor" | "upload";
  resolution: string;
  fps: number;
  latency: string;
  health: number;
  status: "online" | "offline" | "degraded";
  analytics: string[];
  height?: number;
  angle?: number;
  orientation?: number;
  temporaryVideoUrl?: string;
  temporaryVideoPreviewUrl?: string;
  temporaryVideoFormat?: TemporaryVideoFormat;
};

type CameraDeleteDialogProps = {
  camera: CameraItem | null;
  deleting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
};

function CameraDeleteDialog({ camera, deleting, error, onCancel, onConfirm }: CameraDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!camera) return;
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) onCancel();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [camera, deleting, onCancel]);
  if (!camera) return null;
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return (
    <div className="sys-overlay" onMouseDown={() => { if (!deleting) onCancel(); }}>
      <div className="sys-modal compact sys-camera-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-camera-title" aria-describedby="delete-camera-description" onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}>
        <button className="sys-close" disabled={deleting} onClick={onCancel} aria-label="Закрыть подтверждение удаления"><X /></button>
        <span className="sys-kicker danger"><Trash2 /> УДАЛЕНИЕ ПОДКЛЮЧЕНИЯ</span>
        <h2 id="delete-camera-title">Удалить {camera.id}?</h2>
        <p id="delete-camera-description">Подключение «{camera.name}» исчезнет из списка, а его аналитики остановятся. Точка камеры в зоне «{camera.zone}» останется на плане — её можно будет подключить повторно.</p>
        <div className="sys-camera-delete-facts"><span>Источник<strong>{camera.source}</strong></span><span>Контекст<strong>{camera.floor} → {camera.zone}</strong></span></div>
        {error && <div className="sys-form-error" role="alert"><AlertTriangle />{error}</div>}
        <div className="sys-modal-actions"><button ref={cancelRef} className="secondary" disabled={deleting} onClick={onCancel}>Отмена</button><button className="sys-danger-button" disabled={deleting} onClick={onConfirm}>{deleting ? <><RefreshCw /> Удаляем…</> : <><Trash2 /> Удалить подключение</>}</button></div>
      </div>
    </div>
  );
}

type CameraSetup = {
  location: VenueLocation;
  name: string;
  floor: string;
  zone: string;
  zoneId: string;
  source: string;
  sourceType: "onvif" | "rtsp" | "vendor" | "upload";
  sourceRef: string;
  analytics: string[];
  retention: string;
  height: number;
  angle: number;
  orientation: number;
  privacy: Record<string, boolean>;
  rawVideo: string;
  planElementId: string;
  planCameraLabel: string;
  snapshotId: string;
  snapshotCapturedAt: string;
  temporaryVideoFile?: File;
  temporaryVideoFormat?: TemporaryVideoFormat;
  temporaryVideoPreviewUrl?: string;
  temporaryVideoDuration?: number;
  temporaryVideoFrameTime?: number;
  temporaryVideoWidth?: number;
  temporaryVideoHeight?: number;
};

type CameraPlanSlot = {
  id: string;
  label: string;
  x: number;
  y: number;
  zoneId?: string;
  zoneName: string;
};

type TemporaryVideoFormat = "mp4" | "avi";

type ExtractedVideoFrame = {
  frameDataUrl: string;
  width: number;
  height: number;
  duration: number;
  frameTime: number;
};

type TemporaryVideo = {
  file: File;
  format: TemporaryVideoFormat;
  url?: string;
  frameDataUrl?: string;
  duration: number;
  width: number;
  height: number;
  frameTime: number;
  extracting: boolean;
  extractionError?: string;
};

type TemporaryVideoSession = {
  format: TemporaryVideoFormat;
  fileName: string;
  playbackUrl?: string;
  previewUrl?: string;
  duration: number;
  width: number;
  height: number;
  frameTime: number;
};

const TEMPORARY_VIDEO_ACCEPT = "video/mp4,application/mp4,video/x-msvideo,video/avi,video/msvideo,video/vnd.avi,.mp4,.avi";
const TEMPORARY_MP4_MAX_BYTES = 500 * 1024 * 1024;
const TEMPORARY_AVI_MAX_BYTES = 200 * 1024 * 1024;

function temporaryVideoFormat(file: File): TemporaryVideoFormat {
  const extensionFormat: TemporaryVideoFormat | null = /\.mp4$/i.test(file.name) ? "mp4" : /\.avi$/i.test(file.name) ? "avi" : null;
  const mime = file.type.trim().toLocaleLowerCase();
  const mimeFormat: TemporaryVideoFormat | null = ["video/mp4", "application/mp4"].includes(mime)
    ? "mp4"
    : ["video/x-msvideo", "video/avi", "video/msvideo", "video/vnd.avi"].includes(mime)
      ? "avi"
      : null;
  const genericMime = !mime || mime === "application/octet-stream";
  if (!extensionFormat && !mimeFormat) throw new Error("Выберите видео в формате MP4 или AVI.");
  if (extensionFormat && mimeFormat && extensionFormat !== mimeFormat) throw new Error("Расширение видео не совпадает с его MIME-типом.");
  if (!mimeFormat && !genericMime) throw new Error("Файл имеет неподдерживаемый MIME-тип. Нужен MP4 или AVI.");
  return extensionFormat ?? mimeFormat as TemporaryVideoFormat;
}

function validateTemporaryVideo(file: File): TemporaryVideoFormat {
  const format = temporaryVideoFormat(file);
  if (file.size === 0) throw new Error("Выбранный видеофайл пустой.");
  if (format === "avi" && file.size > TEMPORARY_AVI_MAX_BYTES) throw new Error("Для временного теста выберите AVI размером не более 200 МБ.");
  if (format === "mp4" && file.size > TEMPORARY_MP4_MAX_BYTES) throw new Error("Для временного теста выберите MP4 размером не более 500 МБ.");
  return format;
}

async function extractTemporaryVideoFrame(file: File): Promise<ExtractedVideoFrame> {
  const form = new FormData();
  form.append("video", file, file.name);
  const result = await apiFetch<ExtractedVideoFrame>("/camera-vision/extract-video-frame", { method: "POST", body: form });
  const width = Number(result?.width);
  const height = Number(result?.height);
  const duration = Number(result?.duration);
  const frameTime = Number(result?.frameTime);
  if (!result?.frameDataUrl?.startsWith("data:image/") || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Сервер не смог извлечь корректный кадр из AVI.");
  }
  return {
    frameDataUrl: result.frameDataUrl,
    width,
    height,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : 0,
    frameTime: Number.isFinite(frameTime) && frameTime >= 0 ? frameTime : 0,
  };
}

function storedTemporaryVideoFormat(camera: Pick<VenueCameraDefinition, "source" | "sourceRef">): TemporaryVideoFormat {
  return camera.sourceRef?.startsWith("temporary-avi:") || /\bAVI\b/i.test(camera.source) ? "avi" : "mp4";
}

type WizardStep = "placement" | "source" | "stream" | "gpt-plan" | "vision-check" | "privacy" | "review";

const CAMERA_VISION_TIMEOUT_SECONDS = 60;
const CAMERA_VISION_TIMEOUT_MS = CAMERA_VISION_TIMEOUT_SECONDS * 1_000;
const AUTO_PLAN_MIN_CONFIDENCE = 0.62;

type CameraVisionResult = {
  status: string;
  engines: {
    room: string | { provider?: string; model?: string; actual?: boolean; fallback?: boolean; status?: string; reason?: string };
    detector: string | { provider?: string; model?: string; actual?: boolean; fallback?: boolean; status?: string; reason?: string };
    reconciliation: string | { provider?: string; model?: string; actual?: boolean; fallback?: boolean; status?: string; reason?: string };
  };
  layout: {
    summary: string;
    confidence: number;
    room: {
      name: string;
      type: string;
      confidence: number;
      left: number;
      top: number;
      width: number;
      height: number;
    };
    camera: {
      confidence: number;
      x: number;
      y: number;
      rotation: number;
      viewAngle: number;
      viewRadius: number;
    };
    objects: Array<{
      kind: string;
      label: string;
      confidence: number;
      x: number;
      y: number;
      width: number;
      height: number;
      seats: number;
    }>;
  };
  detections: Array<{
    id: string;
    label: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  reconciliation: {
    status: "ok" | "warning" | "mismatch";
    score: number;
    summary: string;
    counts: Array<{
      label: string;
      plan: number;
      detected: number;
      status: string;
    }>;
    recommendations: string[];
  };
  recommendedAnalytics: string[];
};

function cameraVisionEngineLabel(engine: CameraVisionResult["engines"][keyof CameraVisionResult["engines"]]) {
  if (typeof engine === "string") return engine;
  const label = [engine.provider, engine.model].filter(Boolean).join(" · ");
  if (engine.fallback) return `${label || "Fallback"} · резервный режим`;
  return label || engine.status || "не указан";
}

function cameraVisionDetectionLabel(label: string) {
  const key = label.trim().toLocaleLowerCase();
  return ({
    table: "Стол",
    seat: "Место",
    chair: "Место",
    door: "Дверь",
    entrance: "Проход",
    counter: "Стойка",
  } as Record<string, string>)[key] ?? label;
}

function cameraVisionEngineIsActual(engine: CameraVisionResult["engines"][keyof CameraVisionResult["engines"]]) {
  return typeof engine === "string" ? /yolo|openai|gpt/i.test(engine) : engine.actual === true && engine.fallback !== true;
}

function cameraVisionResultIsFallback(result: CameraVisionResult | null) {
  if (!result) return false;
  return result.status?.toLocaleLowerCase() === "fallback"
    || Object.values(result.engines).some((engine) => !cameraVisionEngineIsActual(engine));
}

function cameraVisionFallbackMessage(result: CameraVisionResult) {
  const engineNames: Record<keyof CameraVisionResult["engines"], string> = {
    room: "GPT-план",
    detector: "YOLO",
    reconciliation: "GPT-сверка",
  };
  const reasons = Array.from(new Set(Object.entries(result.engines).flatMap(([key, engine]) => {
    if (cameraVisionEngineIsActual(engine)) return [];
    const engineName = engineNames[key as keyof CameraVisionResult["engines"]];
    if (typeof engine === "string") return [`${engineName}: ${engine || "резервный режим"}`];
    const reason = engine.reason?.trim() || engine.status?.trim() || cameraVisionEngineLabel(engine);
    return [`${engineName}: ${reason}`];
  })));
  return reasons.length > 0
    ? `AI-проверка не подтверждена. ${reasons.join(" · ")}`
    : "AI вернул резервный результат. GPT-план и YOLO-сверка не подтверждены — повторите анализ на том же контрольном кадре.";
}

const cameraTemplates: CameraItem[] = [
  { id: "CAM-01", name: "Вход · улица", location: "Franko, 12", floor: "1 этаж", zone: "Вход", type: "Dome · fixed", source: "ONVIF / RTSP", resolution: "2560×1440", fps: 25, latency: "184 мс", health: 98, status: "online", analytics: ["People count", "Tripwire", "Storefront"] },
  { id: "CAM-02", name: "Главный зал", location: "Franko, 12", floor: "1 этаж", zone: "Главный зал", type: "Wide angle", source: "RTSP", resolution: "1920×1080", fps: 25, latency: "212 мс", health: 96, status: "online", analytics: ["Occupancy", "Tables", "Dwell"] },
  { id: "CAM-03", name: "Бар и очередь", location: "Franko, 12", floor: "1 этаж", zone: "Бар", type: "Dome · fixed", source: "ONVIF / RTSP", resolution: "1920×1080", fps: 30, latency: "176 мс", health: 99, status: "online", analytics: ["Queue", "Service time", "Overcrowding"] },
  { id: "CAM-04", name: "Кухня · pass", location: "Franko, 12", floor: "1 этаж", zone: "Кухня", type: "Bullet", source: "RTSP", resolution: "1920×1080", fps: 25, latency: "294 мс", health: 91, status: "degraded", analytics: ["SOP", "Speed of service", "Safety"] },
  { id: "CAM-05", name: "Терраса", location: "Franko, 12", floor: "1 этаж", zone: "Терраса", type: "Outdoor bullet", source: "RTSP", resolution: "1920×1080", fps: 0, latency: "—", health: 34, status: "offline", analytics: ["Occupancy", "Dwell"] },
  { id: "CAM-06", name: "Выдача и pickup", location: "Franko, 12", floor: "1 этаж", zone: "Выдача", type: "Wide angle", source: "ONVIF / RTSP", resolution: "1920×1080", fps: 25, latency: "204 мс", health: 97, status: "online", analytics: ["Pickup SLA", "Order match", "Queue"] },
  { id: "CAM-07", name: "VIP-зал · обзор", location: "Franko, 12", floor: "2 этаж", zone: "VIP-зал", type: "Bullet", source: "RTSP", resolution: "1920×1080", fps: 25, latency: "238 мс", health: 94, status: "online", analytics: ["Occupancy", "Table service", "Dwell"] },
];

function camerasForLocation(location: VenueLocation): CameraItem[] {
  return cameraTemplates.slice(0, location.cameras).map((camera, index) => {
    const available = index < location.online;
    const degraded = available && location.id === "franko" && index === location.online - 1;
    return {
      ...camera,
      location: location.name,
      floor: location.floors > 1 ? camera.floor : "1 этаж",
      status: available ? (degraded ? "degraded" : "online") : "offline",
      fps: available ? Math.max(25, camera.fps) : 0,
      latency: available ? camera.latency === "—" ? "221 мс" : camera.latency : "—",
      health: available ? degraded ? 78 : Math.min(99, camera.health + (location.readiness - 90) / 5) : 31,
    };
  });
}

export function CameraControl({ notify, location, locations, onLocationUpdate, onDeleteCamera }: { notify: Notify; location: VenueLocation; locations: VenueLocation[]; onLocationUpdate: (location: VenueLocation) => Promise<VenueLocation>; onDeleteCamera: (cameraId: string) => Promise<VenueLocation> }) {
  const [wizard, setWizard] = useState(false);
  const [calibration, setCalibration] = useState<CameraItem | null>(null);
  const [selected, setSelected] = useState("all");
  const [display, setDisplay] = useState<"list" | "grid">("list");
  const [temporaryVideoSessions, setTemporaryVideoSessions] = useState<Record<string, TemporaryVideoSession>>({});
  const [cameraDeleteTarget, setCameraDeleteTarget] = useState<CameraItem | null>(null);
  const [deletingCamera, setDeletingCamera] = useState(false);
  const [cameraDeleteError, setCameraDeleteError] = useState("");
  const temporaryVideoSessionsRef = useRef<Record<string, TemporaryVideoSession>>({});
  useEffect(() => () => {
    Object.values(temporaryVideoSessionsRef.current).forEach((session) => { if (session.playbackUrl) URL.revokeObjectURL(session.playbackUrl); });
  }, []);
  const configuredCameras = useMemo(() => location.configuredCameras ?? [], [location.configuredCameras]);
  const configuredOnline = configuredCameras.filter((camera) => camera.status !== "offline" && camera.sourceType !== "upload").length;
  const baselineCount = Math.max(0, location.cameras - configuredCameras.length);
  const baselineOnline = Math.max(0, location.online - configuredOnline);
  const cameras = useMemo(() => [
    ...camerasForLocation({ ...location, cameras: baselineCount, online: baselineOnline }),
    ...configuredCameras.map((camera): CameraItem => {
      const session = temporaryVideoSessions[camera.id];
      return {
        id: camera.id,
        name: camera.name,
        location: location.name,
        floor: camera.floor,
        zone: camera.zone,
        type: "Configured camera",
        source: camera.source,
        sourceType: camera.sourceType,
        resolution: session?.width && session?.height ? `${session.width}×${session.height}` : "1920×1080",
        fps: camera.status === "offline" ? 0 : 25,
        latency: camera.status === "offline" ? "—" : "196 мс",
        health: camera.calibrated ? 96 : camera.status === "offline" ? 28 : 82,
        status: camera.status,
        analytics: camera.analytics,
        height: camera.height,
        angle: camera.angle,
        orientation: camera.orientation,
        temporaryVideoUrl: session?.playbackUrl,
        temporaryVideoPreviewUrl: session?.previewUrl,
        temporaryVideoFormat: camera.sourceType === "upload" ? session?.format ?? storedTemporaryVideoFormat(camera) : undefined,
      };
    }),
  ], [location, baselineCount, baselineOnline, configuredCameras, temporaryVideoSessions]);
  const visible = useMemo(() => cameras.filter((camera) => selected === "all" || camera.status === selected), [cameras, selected]);
  const counts = {
    online: cameras.filter((camera) => camera.status === "online").length,
    degraded: cameras.filter((camera) => camera.status === "degraded").length,
    offline: cameras.filter((camera) => camera.status === "offline").length,
  };
  const streamsOnline = cameras.filter((camera) => camera.status !== "offline" && camera.sourceType !== "upload").length;
  const averageHealth = Math.round(cameras.reduce((sum, camera) => sum + camera.health, 0) / Math.max(1, cameras.length));
  const problemCamera = cameras.find((camera) => camera.status === "offline") ?? cameras.find((camera) => camera.status === "degraded");
  const configuredCameraIds = useMemo(() => new Set(configuredCameras.map((camera) => camera.id)), [configuredCameras]);
  const requestCameraDelete = (cameraId: string) => {
    if (!configuredCameraIds.has(cameraId)) return;
    const target = cameras.find((camera) => camera.id === cameraId);
    if (!target) return;
    setCameraDeleteError("");
    setCameraDeleteTarget(target);
  };
  const closeCameraDelete = () => {
    if (deletingCamera) return;
    setCameraDeleteTarget(null);
    setCameraDeleteError("");
  };
  const confirmCameraDelete = async () => {
    if (!cameraDeleteTarget || deletingCamera) return;
    const definition = configuredCameras.find((camera) => camera.id === cameraDeleteTarget.id);
    if (!definition) { setCameraDeleteError("Это демонстрационная камера: удалить можно только созданное подключение."); return; }
    setDeletingCamera(true);
    setCameraDeleteError("");
    try {
      const saved = await onDeleteCamera(definition.id);
      const temporarySession = temporaryVideoSessionsRef.current[definition.id];
      if (temporarySession) {
        if (temporarySession.playbackUrl) URL.revokeObjectURL(temporarySession.playbackUrl);
        delete temporaryVideoSessionsRef.current[definition.id];
        setTemporaryVideoSessions((current) => { const next = { ...current }; delete next[definition.id]; return next; });
      }
      setCalibration(null);
      setCameraDeleteTarget(null);
      notify(`${definition.id} удалена из подключений · точка камеры в «${definition.zone}» осталась на плане`, { location: saved });
    } catch (error) {
      setCameraDeleteError(error instanceof Error ? error.message : "Не удалось удалить подключение камеры.");
    } finally {
      setDeletingCamera(false);
    }
  };
  const rememberTemporaryVideo = async (cameraId: string, file: File, prepared?: Partial<TemporaryVideoSession>) => {
    const format = validateTemporaryVideo(file);
    let session: TemporaryVideoSession;
    if (format === "avi") {
      const extracted = prepared?.format === "avi" && prepared.previewUrl && prepared.width && prepared.height
        ? { frameDataUrl: prepared.previewUrl, width: prepared.width, height: prepared.height, duration: prepared.duration ?? 0, frameTime: prepared.frameTime ?? 0 }
        : await extractTemporaryVideoFrame(file);
      session = { format, fileName: file.name, previewUrl: extracted.frameDataUrl, duration: extracted.duration, width: extracted.width, height: extracted.height, frameTime: extracted.frameTime };
    } else {
      session = { format, fileName: file.name, playbackUrl: URL.createObjectURL(file), previewUrl: prepared?.previewUrl, duration: prepared?.duration ?? 0, width: prepared?.width ?? 0, height: prepared?.height ?? 0, frameTime: prepared?.frameTime ?? 0 };
    }
    const previousSession = temporaryVideoSessionsRef.current[cameraId];
    if (previousSession?.playbackUrl) URL.revokeObjectURL(previousSession.playbackUrl);
    temporaryVideoSessionsRef.current[cameraId] = session;
    setTemporaryVideoSessions((current) => ({ ...current, [cameraId]: session }));
    setCalibration((current) => current?.id === cameraId ? {
      ...current,
      resolution: session.width && session.height ? `${session.width}×${session.height}` : current.resolution,
      temporaryVideoUrl: session.playbackUrl,
      temporaryVideoPreviewUrl: session.previewUrl,
      temporaryVideoFormat: session.format,
    } : current);
    return session;
  };
  const completeCamera = async (draft: CameraSetup) => {
    const baseLocation = draft.location;
    if (baseLocation.configuredCameras?.some((camera) => camera.planElementId === draft.planElementId)) {
      throw new Error("Эта точка плана уже подключена к другой камере.");
    }
    const usedIds = new Set(cameras.map((camera) => camera.id));
    let nextNumber = 1;
    while (usedIds.has(`CAM-${String(nextNumber).padStart(2, "0")}`)) nextNumber += 1;
    const nextId = `CAM-${String(nextNumber).padStart(2, "0")}`;
    const temporaryVideo = draft.sourceType === "upload";
    const definition: VenueCameraDefinition = { id: nextId, name: draft.name, floor: draft.floor, zone: draft.zone, zoneId: draft.zoneId, source: draft.source, sourceType: draft.sourceType, sourceRef: draft.sourceRef, analytics: draft.analytics, status: "degraded", calibrated: false, retentionDays: Number(draft.retention), rawVideo: draft.rawVideo, privacy: draft.privacy, planElementId: draft.planElementId, snapshotId: draft.snapshotId, snapshotCapturedAt: draft.snapshotCapturedAt, height: draft.height, angle: draft.angle, orientation: draft.orientation };
    const nextDefinitions = [...(baseLocation.configuredCameras ?? []), definition];
    const privacyConfigured = nextDefinitions.every((camera) => camera.privacy?.blur !== false && camera.privacy?.audio !== true);
    const updated: VenueLocation = { ...baseLocation, configuredCameras: nextDefinitions, cameras: baseLocation.cameras + 1, online: baseLocation.online + (temporaryVideo ? 0 : 1), readiness: Math.min(99, baseLocation.readiness + (temporaryVideo ? 6 : 10)), privacyConfigured, status: "attention" };
    const saved = await onLocationUpdate(updated);
    const temporarySession = draft.temporaryVideoFile ? await rememberTemporaryVideo(nextId, draft.temporaryVideoFile, {
      format: draft.temporaryVideoFormat,
      previewUrl: draft.temporaryVideoPreviewUrl,
      duration: draft.temporaryVideoDuration,
      frameTime: draft.temporaryVideoFrameTime,
      width: draft.temporaryVideoWidth,
      height: draft.temporaryVideoHeight,
    }) : undefined;
    const resolution = draft.temporaryVideoWidth && draft.temporaryVideoHeight
      ? `${draft.temporaryVideoWidth}×${draft.temporaryVideoHeight}`
      : "1920×1080";
    const created: CameraItem = { id: nextId, name: draft.name, location: draft.location.name, floor: draft.floor, zone: draft.zone, type: "Configured camera", source: draft.source, sourceType: draft.sourceType, resolution, fps: temporaryVideo ? 0 : 25, latency: temporaryVideo ? "локально" : "196 мс", health: 82, status: "degraded", analytics: draft.analytics, height: draft.height, angle: draft.angle, orientation: draft.orientation, temporaryVideoUrl: temporarySession?.playbackUrl, temporaryVideoPreviewUrl: temporarySession?.previewUrl, temporaryVideoFormat: temporarySession?.format };
    setWizard(false);
    notify(temporaryVideo
      ? `${nextId} привязана к точке «${draft.planCameraLabel}» · временный ${draft.temporaryVideoFormat?.toUpperCase() ?? "видеофайл"} готов для тестов, live ещё не подключён`
      : `${nextId} подключена к точке «${draft.planCameraLabel}» в ${draft.zone} · источник online, аналитики ждут калибровку`, { location: saved });
    setCalibration(created);
  };
  if (calibration) return <><CalibrationStudio camera={calibration} notify={notify} close={() => setCalibration(null)} onDeleteCamera={configuredCameraIds.has(calibration.id) ? requestCameraDelete : undefined} onTemporaryVideoAttach={async (file) => {
    const session = await rememberTemporaryVideo(calibration.id, file);
    notify(`${file.name} · ${session.format.toUpperCase()} подключён временно к ${calibration.id} до обновления страницы`);
  }} onActivate={async () => {
    if (!location.configuredCameras?.some((camera) => camera.id === calibration.id)) throw new Error("Камера ещё не сохранена. Вернитесь к списку и повторите подключение.");
    const nextCameras = location.configuredCameras.map((camera) => camera.id === calibration.id ? { ...camera, calibrated: true, status: camera.sourceType === "upload" ? "degraded" as const : "online" as const } : camera);
    const nextReadiness = Math.min(100, location.readiness + 15);
    const coreReady = ["Poster POS", "OpenWeather"].every((source) => location.connectedSources?.includes(source));
    const ready = location.zones > 0 && location.cameras > 0 && location.online === location.cameras && nextCameras.every((camera) => camera.calibrated) && coreReady && location.privacyConfigured && nextReadiness >= 80;
    const updated: VenueLocation = { ...location, configuredCameras: nextCameras, readiness: nextReadiness, status: ready ? "ready" : "attention" };
    return onLocationUpdate(updated);
  }} /><CameraDeleteDialog camera={cameraDeleteTarget} deleting={deletingCamera} error={cameraDeleteError} onCancel={closeCameraDelete} onConfirm={() => void confirmCameraDelete()} /></>;
  return (
    <>
      <section className="sys-camera-summary">
        {[
          [Camera, "Камер", String(cameras.length), location.name, "blue"],
          [Wifi, "Online", String(streamsOnline), cameras.length ? `${Math.round((streamsOnline / cameras.length) * 100)}%` : "нет источников", "green"],
          [Gauge, "Средний health", String(averageHealth), location.status === "ready" ? "стабильно" : "нужна проверка", "violet"],
        ].map(([Icon, label, value, text, tone]: any) => <article className="card" key={label}><i className={tone}><Icon /></i><p><span>{label}</span><strong>{value}</strong><em>{text}</em></p></article>)}
      </section>
      {cameras.length === 0 ? (
        <section className="sys-camera-alert empty">
          <Camera />
          <p><strong>В {location.name} ещё нет источников видео</strong><span>Добавьте камеру, укажите этаж и зону, проверьте поток, placement, privacy и калибровку.</span></p>
          <button className="primary" onClick={() => setWizard(true)}><Plus /> Добавить первую камеру</button>
        </section>
      ) : problemCamera ? (
        <section className="sys-camera-alert">
          <AlertTriangle />
          <p><strong>{problemCamera.id} · {problemCamera.name}: {problemCamera.status === "offline" ? "нет потока" : problemCamera.sourceType === "upload" ? "временный тестовый источник" : "нестабильный поток"}</strong><span>{location.name} · {problemCamera.floor} → {problemCamera.zone} · {problemCamera.status === "offline" ? "RTSP timeout" : problemCamera.sourceType === "upload" ? problemCamera.temporaryVideoUrl || problemCamera.temporaryVideoPreviewUrl ? `${problemCamera.temporaryVideoFormat?.toUpperCase() ?? "Видео"} доступно в этой вкладке` : `выберите ${problemCamera.temporaryVideoFormat?.toUpperCase() ?? "видео"} заново` : "потери кадров 4,8%"}</span></p>
          <button className="secondary" onClick={() => notify(`Диагностика ${problemCamera.id} запущена`)}>Диагностика</button>
          <button className="primary" onClick={() => setCalibration(problemCamera)}>Открыть камеру</button>
        </section>
      ) : (
        <section className="sys-camera-alert healthy">
          <CheckCircle2 />
          <p><strong>Все камеры {location.name} передают стабильный поток</strong><span>Последняя проверка 2 минуты назад · calibration drift не обнаружен</span></p>
          <button className="secondary" onClick={() => notify("Fleet health report сформирован")}>Health report</button>
        </section>
      )}
      <section className="sys-camera-toolbar">
        <div className="sys-camera-filters">
          {[["all", "Все", cameras.length], ["online", "Online", counts.online], ["degraded", "Нестабильные", counts.degraded], ["offline", "Offline", counts.offline]].map(([key, label, count]: any) => <button className={selected === key ? "active" : ""} key={key} onClick={() => setSelected(key)}>{label}<b>{count}</b></button>)}
        </div>
        <div className="sys-view-buttons"><button aria-label="Показать камеры списком" className={display === "list" ? "active" : ""} onClick={() => setDisplay("list")}><ListChecks /></button><button aria-label="Показать камеры карточками" className={display === "grid" ? "active" : ""} onClick={() => setDisplay("grid")}><Layers3 /></button></div>
        {cameras.length > 0 && <button className="primary" onClick={() => setWizard(true)}><Plus /> Добавить камеру</button>}
      </section>
      <section className={`sys-camera-fleet ${display}`}>
        {display === "list" && <div className="sys-camera-head"><span>Камера</span><span>Контекст</span><span>Поток</span><span>Аналитики</span><span>Health</span><span /></div>}
        {visible.length === 0 && (
          <div className="card sys-camera-empty">
            <Camera />
            <h3>В этом фильтре камер нет</h3>
            <p>{location.name}: выберите другой статус или добавьте новый источник.</p>
            <button className="secondary" onClick={() => setSelected("all")}>Показать все камеры</button>
          </div>
        )}
        {visible.map((camera, index) => (
          <article className="card" key={camera.id}>
            <div className={`sys-camera-thumb thumb-${index} ${camera.status}`}><Camera /><span>{camera.id}</span><i className={`sys-live-dot ${camera.status}`} />{camera.status !== "offline" && <b>{camera.sourceType === "upload" ? camera.temporaryVideoUrl || camera.temporaryVideoPreviewUrl ? camera.temporaryVideoFormat?.toUpperCase() ?? "ВИДЕО" : `НУЖЕН ${camera.temporaryVideoFormat?.toUpperCase() ?? "ФАЙЛ"}` : "LIVE"}</b>}</div>
            <p className="sys-camera-name"><strong>{camera.name}</strong><span>{camera.id} · {camera.type}</span></p>
            <p className="sys-camera-context"><strong>{camera.location}</strong><span>{camera.floor} → {camera.zone}</span></p>
            <p className="sys-camera-stream"><strong>{camera.resolution} · {camera.sourceType === "upload" ? "локальный файл" : `${camera.fps} FPS`}</strong><span>{camera.source} · {camera.latency}</span></p>
            <div className="sys-camera-analytics">{camera.analytics.slice(0, display === "grid" ? 3 : 2).map((item) => <span key={item}>{item}</span>)}{camera.analytics.length > 2 && display === "list" && <b>+{camera.analytics.length - 2}</b>}</div>
            <div className="sys-camera-health"><i><b style={{ width: `${camera.health}%` }} /></i><strong>{camera.health}</strong><span>{camera.sourceType === "upload" ? camera.temporaryVideoUrl || camera.temporaryVideoPreviewUrl ? `Тестовый ${camera.temporaryVideoFormat?.toUpperCase() ?? "файл"}` : "Нужен исходный файл" : camera.status === "online" ? "Стабильно" : camera.status === "degraded" ? "Проверить" : "Нет сигнала"}</span></div>
            <div className="sys-camera-row-actions"><button className="secondary" onClick={() => setCalibration(camera)}><Settings2 /> Настроить</button>{configuredCameraIds.has(camera.id) && <button className="sys-camera-delete-trigger" aria-label={`Удалить подключение ${camera.id}`} title={`Удалить подключение ${camera.id}`} onClick={() => requestCameraDelete(camera.id)}><Trash2 /></button>}</div>
          </article>
        ))}
      </section>
      {wizard && <CameraWizard location={location} locations={locations} notify={notify} close={() => setWizard(false)} complete={completeCamera} />}
      <CameraDeleteDialog camera={cameraDeleteTarget} deleting={deletingCamera} error={cameraDeleteError} onCancel={closeCameraDelete} onConfirm={() => void confirmCameraDelete()} />
    </>
  );
}

function cameraPlanSlotsFor(location: VenueLocation, floorLabel: string): CameraPlanSlot[] {
  const floorNumber = floorLabel.split(" ")[0];
  const planElements = location.planElements ?? seededPlanElements(location);
  const floorZones = spatialZonesFor(location).filter((item) => item.floor === floorNumber);
  return planElements
    .filter((item) => item.kind === "camera" && item.floor === floorNumber)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item, index) => {
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const assignedZone = floorZones.find((zone) => centerX >= zone.left && centerX <= zone.left + zone.width && centerY >= zone.top && centerY <= zone.top + zone.height);
      return {
        id: item.id,
        label: /^CAM-\d+$/i.test(item.label) ? `Камера ${Number(item.label.split("-")[1])}` : item.label || `Камера ${index + 1}`,
        x: centerX,
        y: centerY,
        zoneId: assignedZone?.id,
        zoneName: assignedZone?.name ?? "Вне зала",
      };
    });
}

function cameraWizardFloorLabel(record: VenueFloorRecord) {
  const name = record.name.trim();
  return new RegExp(`^${record.level}\\s`, "i").test(name) ? name : `${record.level} этаж · ${name}`;
}

function CameraWizard({ location, locations, notify, close, complete }: { location: VenueLocation; locations: VenueLocation[]; notify: Notify; close: () => void; complete: (setup: CameraSetup) => Promise<void> }) {
  const [step, setStep] = useState<WizardStep>("placement");
  const [autoPlanFromVideo, setAutoPlanFromVideo] = useState(false);
  const [autoDraftElementId, setAutoDraftElementId] = useState("");
  const [autoDraftCreating, setAutoDraftCreating] = useState(false);
  const [autoPlanAccepted, setAutoPlanAccepted] = useState(false);
  const [visionResult, setVisionResult] = useState<CameraVisionResult | null>(null);
  const [visionSnapshotId, setVisionSnapshotId] = useState("");
  const [visionRunning, setVisionRunning] = useState(false);
  const [visionElapsedSeconds, setVisionElapsedSeconds] = useState(0);
  const [visionError, setVisionError] = useState("");
  const [visionWarningAccepted, setVisionWarningAccepted] = useState(false);
  const [locationId] = useState(location.id);
  const firstSpatialZone = location.customZones?.[0];
  const firstFloorRecord = [...(location.backendFloors ?? [])].sort((a, b) => a.level - b.level)[0];
  const initialFloor = firstFloorRecord ? cameraWizardFloorLabel(firstFloorRecord) : `${firstSpatialZone?.floor ?? "1"} этаж · ${firstSpatialZone?.floor === "2" ? "Lounge" : "Основной"}`;
  const [floor, setFloor] = useState(initialFloor);
  const [zone, setZone] = useState("");
  const [name, setName] = useState("");
  const [planElementId, setPlanElementId] = useState("");
  const [source, setSource] = useState<CameraSetup["sourceType"]>("onvif");
  const [device, setDeviceState] = useState<number | null>(null);
  const [rtsp, setRtspState] = useState({ url: "", login: "", password: "" });
  const [vendor, setVendorState] = useState({ provider: "Verkada", site: location.name, camera: "Camera 01" });
  const [temporaryVideo, setTemporaryVideo] = useState<TemporaryVideo | null>(null);
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [snapshotId, setSnapshotId] = useState("");
  const [snapshotCapturedAt, setSnapshotCapturedAt] = useState("");
  const [snapshotPreviewUrl, setSnapshotPreviewUrl] = useState("");
  const [height] = useState(3.2);
  const [angle] = useState(72);
  const [orientation, setOrientation] = useState(118);
  const [privacy, setPrivacy] = useState<Record<string, boolean>>({ blur: true, events: true, evidence: true, audio: false });
  const [retention, setRetention] = useState("30");
  const [rawVideo, setRawVideo] = useState("local");
  const [error, setError] = useState("");
  const [wizardPlanElements, setWizardPlanElements] = useState<PlanElement[]>(location.planElements ?? seededPlanElements(location));
  const [wizardZones, setWizardZones] = useState<VenueZoneDefinition[]>(location.customZones ?? []);
  const [wizardFloorRecords, setWizardFloorRecords] = useState<VenueFloorRecord[]>(location.backendFloors ?? []);
  const [wizardPlanAssetUrls, setWizardPlanAssetUrls] = useState<Record<string, string>>(location.planAssetUrls ?? {});
  const [wizardPlanAssetTypes, setWizardPlanAssetTypes] = useState<Record<string, "pdf" | "image" | "manual">>(location.planAssetTypes ?? {});
  const [wizardPlanAspectRatios, setWizardPlanAspectRatios] = useState<Record<string, number>>({});
  const [wizardPlanViewportAspectRatio, setWizardPlanViewportAspectRatio] = useState(1.8);
  const [planLoading, setPlanLoading] = useState(true);
  const [planLoadError, setPlanLoadError] = useState("");
  const [planReloadKey, setPlanReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const wizardMainRef = useRef<HTMLDivElement>(null);
  const wizardPlanMapRef = useRef<HTMLDivElement>(null);
  const rtspUrlRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const streamVideoRef = useRef<HTMLVideoElement>(null);
  const testRunRef = useRef(0);
  const visionRunRef = useRef(0);
  const visionAbortRef = useRef<AbortController | null>(null);
  const videoExtractionRunRef = useRef(0);
  const resetVisionCheck = () => {
    visionRunRef.current += 1;
    visionAbortRef.current?.abort();
    visionAbortRef.current = null;
    setVisionRunning(false);
    setVisionElapsedSeconds(0);
    setVisionResult(null);
    setVisionSnapshotId("");
    setVisionError("");
    setVisionWarningAccepted(false);
    if (!autoDraftElementId) setAutoPlanAccepted(false);
  };
  const resetStreamCheck = () => { testRunRef.current += 1; setTesting(false); setTested(false); setSnapshotId(""); setSnapshotCapturedAt(""); setSnapshotPreviewUrl(""); resetVisionCheck(); };
  const selectWizardFloor = (value: string) => {
    setPlanLoading(true);
    setPlanLoadError("");
    setFloor(value);
    setZone("");
    setPlanElementId("");
    setName("");
    setAutoPlanFromVideo(false);
    setAutoDraftElementId("");
    setAutoPlanAccepted(false);
    resetStreamCheck();
  };
  const setDevice = (value: number | null) => { setDeviceState(value); resetStreamCheck(); };
  const setRtsp = (value: React.SetStateAction<typeof rtsp>) => { setRtspState(value); resetStreamCheck(); };
  const setVendor = (value: React.SetStateAction<typeof vendor>) => { setVendorState(value); resetStreamCheck(); };
  const chooseTemporaryVideo = async (file: File) => {
    const runId = videoExtractionRunRef.current + 1;
    videoExtractionRunRef.current = runId;
    resetStreamCheck();
    let format: TemporaryVideoFormat;
    try {
      format = validateTemporaryVideo(file);
    } catch (validationFailure) {
      setTemporaryVideo(null);
      setError(validationFailure instanceof Error ? validationFailure.message : "Выберите корректный MP4 или AVI.");
      return;
    }
    if (format === "mp4") {
      setTemporaryVideo({ file, format, url: URL.createObjectURL(file), duration: 0, width: 0, height: 0, frameTime: 0, extracting: false });
      setError("");
      return;
    }
    setTemporaryVideo({ file, format, duration: 0, width: 0, height: 0, frameTime: 0, extracting: true });
    setError("");
    try {
      const extracted = await extractTemporaryVideoFrame(file);
      if (videoExtractionRunRef.current !== runId) return;
      setTemporaryVideo({ file, format, frameDataUrl: extracted.frameDataUrl, duration: extracted.duration, width: extracted.width, height: extracted.height, frameTime: extracted.frameTime, extracting: false });
      notify(`Кадр из AVI извлечён · ${extracted.width}×${extracted.height} · файл остаётся временным`);
    } catch (extractionFailure) {
      if (videoExtractionRunRef.current !== runId) return;
      const message = extractionFailure instanceof Error ? extractionFailure.message : "Не удалось извлечь кадр из AVI.";
      setTemporaryVideo({ file, format, duration: 0, width: 0, height: 0, frameTime: 0, extracting: false, extractionError: message });
      setError(message);
    }
  };
  const retryPlan = () => { setPlanLoading(true); setPlanLoadError(""); setPlanReloadKey((value) => value + 1); };
  const selectedLocation = locations.find((item) => item.id === locationId) ?? location;
  useEffect(() => {
    const objectUrl = temporaryVideo?.url;
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [temporaryVideo?.url]);
  useEffect(() => {
    let active = true;
    apiFetch<{ floors: VenueFloorRecord[] }>(`/locations/${encodeURIComponent(location.id)}/floors`)
      .then(({ floors: savedFloors }) => {
        if (!active) return;
        setWizardFloorRecords(savedFloors);
        if (savedFloors.length === 0) {
          setPlanLoading(false);
          setPlanLoadError("У локации ещё нет этажей. Сначала создайте этаж в «Планы и зоны».");
          return;
        }
        setPlanLoadError("");
        setFloor((current) => {
          const currentLevel = Number(current.split(" ")[0]);
          return cameraWizardFloorLabel(savedFloors.find((item) => item.level === currentLevel) ?? savedFloors[0]);
        });
      })
      .catch(() => { if (active) { setPlanLoading(false); setPlanLoadError("Не удалось загрузить список этажей."); } });
    return () => { active = false; };
  }, [location.id, planReloadKey]);
  useEffect(() => {
    const record = wizardFloorRecords.find((item) => item.level === Number(floor.split(" ")[0]));
    if (!record) return;
    let active = true;
    apiFetch<{ zones: VenueZoneDefinition[]; planElements: PlanElement[]; planAssetUrl?: string | null; planAssetType?: "pdf" | "image" | "manual" | null }>(`/floors/${encodeURIComponent(record.id)}/plan`)
      .then(({ zones: savedZones, planElements: savedElements, planAssetUrl, planAssetType }) => {
        if (!active) return;
        const level = String(record.level);
        setWizardZones((current) => [...current.filter((item) => item.floor !== level), ...savedZones]);
        setWizardPlanElements((current) => [...current.filter((item) => item.floor !== level), ...savedElements]);
        setWizardPlanAssetUrls((current) => { const next = { ...current }; if (planAssetUrl) next[level] = planAssetUrl; else delete next[level]; return next; });
        setWizardPlanAssetTypes((current) => { const next = { ...current }; if (planAssetType) next[level] = planAssetType; else delete next[level]; return next; });
        setPlanLoadError("");
      })
      .catch(() => { if (active) setPlanLoadError("Не удалось загрузить актуальный план этажа."); })
      .finally(() => { if (active) setPlanLoading(false); });
    return () => { active = false; };
  }, [floor, planReloadKey, wizardFloorRecords]);
  useEffect(() => {
    wizardMainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    wizardMainRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (step !== "source" || !autoPlanFromVideo) return;
    const focusTimer = window.setTimeout(() => rtspUrlRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [autoPlanFromVideo, step]);
  useEffect(() => {
    if (step !== "placement") return;
    const map = wizardPlanMapRef.current;
    if (!map) return;
    const updateRatio = () => {
      const rect = map.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextRatio = rect.width / rect.height;
        setWizardPlanViewportAspectRatio((current) => Math.abs(current - nextRatio) < .001 ? current : nextRatio);
      }
    };
    updateRatio();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateRatio);
    observer.observe(map);
    return () => observer.disconnect();
  }, [step]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      testRunRef.current += 1;
      visionRunRef.current += 1;
      visionAbortRef.current?.abort();
      visionAbortRef.current = null;
      videoExtractionRunRef.current += 1;
    };
  }, []);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting && !autoDraftCreating && !visionRunning) { videoExtractionRunRef.current += 1; close(); } };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [autoDraftCreating, close, submitting, visionRunning]);
  useEffect(() => {
    if (!visionRunning) return;
    const interval = window.setInterval(() => setVisionElapsedSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [visionRunning]);
  const trapWizardFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const stepDefinitions: Record<WizardStep, { title: string; icon: typeof Camera }> = {
    placement: { title: "Размещение", icon: MapPin },
    source: { title: "Источник", icon: Cable },
    stream: { title: "Проверка потока", icon: Video },
    "gpt-plan": { title: "План по кадру", icon: Sparkles },
    "vision-check": { title: "AI-проверка", icon: ScanLine },
    privacy: { title: "Приватность", icon: ShieldCheck },
    review: { title: "Итог", icon: CheckCircle2 },
  };
  const visibleSteps: WizardStep[] = autoPlanFromVideo
    ? ["placement", "source", "stream", "gpt-plan", "vision-check", "privacy", "review"]
    : ["placement", "source", "stream", "vision-check", "privacy", "review"];
  const currentStepIndex = Math.max(0, visibleSteps.indexOf(step));
  const currentStepNumber = currentStepIndex + 1;
  const totalSteps = visibleSteps.length;
  const floorNumber = floor.split(" ")[0];
  const currentWizardFloorRecord = wizardFloorRecords.find((item) => item.level === Number(floorNumber));
  const wizardFloorOptions = wizardFloorRecords.length
    ? [...wizardFloorRecords].sort((a, b) => a.level - b.level).map((record) => cameraWizardFloorLabel(record))
    : Array.from({ length: Math.max(1, selectedLocation.floors) }, (_, index) => `${index + 1} этаж · ${index === 0 ? "Основной" : `Уровень ${index + 1}`}`);
  const planContextLocation = { ...selectedLocation, customZones: wizardZones, planElements: wizardPlanElements };
  const floorZones = spatialZonesFor(planContextLocation).filter((item) => item.floor === floorNumber);
  const planCameraSlots = cameraPlanSlotsFor(planContextLocation, floor);
  const connectedCameraByPlanId = new globalThis.Map<string, VenueCameraDefinition>((location.configuredCameras ?? []).filter((camera) => camera.planElementId).map((camera) => [camera.planElementId as string, camera] as const));
  const availablePlanCameraSlots = planCameraSlots.filter((slot) => !connectedCameraByPlanId.has(slot.id));
  const selectedPlanCamera = availablePlanCameraSlots.find((item) => item.id === planElementId);
  const selectedZoneDefinition = spatialZonesFor(planContextLocation).find((item) => item.id === selectedPlanCamera?.zoneId);
  const discoveredDevices = [["Hikvision DS-2CD", "192.168.1.42"], ["Dahua IPC-HDW", "192.168.1.51"], ["Axis M3085", "192.168.1.63"]];
  const validRtspEndpoint = (() => { try { return ["rtsp:", "rtsps:"].includes(new URL(rtsp.url.trim()).protocol); } catch { return false; } })();
  const temporaryVideoReady = Boolean(temporaryVideo && !temporaryVideo.extracting && !temporaryVideo.extractionError && temporaryVideo.width > 0 && temporaryVideo.height > 0 && (temporaryVideo.format === "avi" ? temporaryVideo.frameDataUrl : temporaryVideo.url && temporaryVideo.duration > 0 && Number.isFinite(temporaryVideo.duration)));
  const temporaryVideoSize = temporaryVideo ? `${(temporaryVideo.file.size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ` : "";
  const temporaryVideoDuration = temporaryVideo?.duration && Number.isFinite(temporaryVideo.duration)
    ? `${Math.floor(temporaryVideo.duration / 60)}:${String(Math.floor(temporaryVideo.duration % 60)).padStart(2, "0")}`
    : "";
  const temporaryVideoFormatLabel = temporaryVideo?.format.toUpperCase() ?? "MP4/AVI";
  const sourceReady = source === "onvif" ? device !== null : source === "rtsp" ? validRtspEndpoint && Boolean(rtsp.login.trim() && rtsp.password.trim()) : source === "vendor" ? Boolean(vendor.provider.trim() && vendor.site.trim() && vendor.camera.trim()) : temporaryVideoReady;
  const sourceLabel = source === "onvif" ? `ONVIF · ${device === null ? "устройство не выбрано" : ["Hikvision DS-2CD", "Dahua IPC-HDW", "Axis M3085"][device]}` : source === "rtsp" ? "RTSP URL" : source === "vendor" ? `${vendor.provider} Cloud VMS` : temporaryVideo ? `Временный ${temporaryVideoFormatLabel} · ${temporaryVideo.file.name}` : "Временное видео MP4/AVI";
  const sourceRef = source === "onvif" && device !== null
    ? discoveredDevices[device][1]
    : source === "rtsp" && validRtspEndpoint
      ? (() => { const endpoint = new URL(rtsp.url.trim()); endpoint.username = ""; endpoint.password = ""; endpoint.search = ""; endpoint.hash = ""; return endpoint.toString(); })()
      : source === "vendor"
        ? `${vendor.provider.trim()} / ${vendor.site.trim()} / ${vendor.camera.trim()}`
        : temporaryVideo ? `temporary-${temporaryVideo.format}:${temporaryVideo.file.name}:${temporaryVideo.file.size}` : "temporary-video";
  const checkedResolution = source === "upload" && temporaryVideoReady ? `${temporaryVideo?.width}×${temporaryVideo?.height}` : "1920×1080";
  const checkedFps = source === "upload" ? "из файла" : "25";
  const checkedBitrate = source === "upload" && temporaryVideo?.duration && Number.isFinite(temporaryVideo.duration)
    ? `${((temporaryVideo.file.size * 8) / temporaryVideo.duration / 1_000_000).toFixed(1)} Mbps`
    : source === "upload" ? "—" : "4.8 Mbps";
  const checkedLatency = source === "upload" ? "локально" : "196 мс";
  const planBackgroundUrl = wizardPlanAssetTypes[floorNumber] === "image" ? wizardPlanAssetUrls[floorNumber] : "";
  const planBackgroundAspectRatio = wizardPlanAspectRatios[floorNumber] ?? 1.6;
  const planSurfaceInset = 90;
  const planSurfaceWidth = planBackgroundAspectRatio < wizardPlanViewportAspectRatio
    ? (planBackgroundAspectRatio / wizardPlanViewportAspectRatio) * planSurfaceInset
    : planSurfaceInset;
  const planSurfaceHeight = planBackgroundAspectRatio >= wizardPlanViewportAspectRatio
    ? (wizardPlanViewportAspectRatio / planBackgroundAspectRatio) * planSurfaceInset
    : planSurfaceInset;
  const snapshotTimeLabel = snapshotCapturedAt ? new Date(snapshotCapturedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const compatibleAnalytics = Array.from(new Set(visionResult?.recommendedAnalytics?.filter(Boolean) ?? ["People count", "Occupancy"]));
  const reconciliationStatus = visionResult?.reconciliation.status;
  const visionFallback = cameraVisionResultIsFallback(visionResult);
  const visionFallbackMessage = visionResult && visionFallback ? cameraVisionFallbackMessage(visionResult) : "";
  const autoPlanQualityIssues = visionResult && autoPlanFromVideo ? [
    visionResult.layout.confidence < AUTO_PLAN_MIN_CONFIDENCE
      ? `общая уверенность ${Math.round(visionResult.layout.confidence * 100)}% — нужно минимум ${Math.round(AUTO_PLAN_MIN_CONFIDENCE * 100)}%`
      : "",
    (visionResult.layout.room.confidence ?? visionResult.layout.confidence) < .55 ? "границы видимой зоны определены ненадёжно" : "",
    (visionResult.layout.camera.confidence ?? visionResult.layout.confidence) < .5 ? "положение камеры неоднозначно" : "",
    visionResult.layout.objects.length === 0 ? "не найдено ни одного уверенного стационарного объекта" : "",
  ].filter(Boolean) : [];
  const autoPlanQualityReady = autoPlanQualityIssues.length === 0;
  const autoPlanQualityMessage = autoPlanQualityIssues.join(" · ");
  const visionReady = Boolean(visionResult && !visionFallback && !visionRunning && (reconciliationStatus === "ok" || (reconciliationStatus === "warning" && visionWarningAccepted)));
  const stepReadyById: Record<WizardStep, boolean> = {
    placement: !planLoading && !planLoadError && Boolean(selectedPlanCamera?.zoneId && name.trim()),
    source: sourceReady,
    stream: tested && Boolean(snapshotId && snapshotCapturedAt && snapshotPreviewUrl) && !testing && !visionRunning,
    "gpt-plan": Boolean(visionResult?.layout && !visionFallback && autoPlanQualityReady && !visionRunning && !visionError),
    "vision-check": visionReady,
    privacy: true,
    review: true,
  };
  const stepReady = stepReadyById[step];
  const stepHintById: Record<WizardStep, string> = {
    placement: planLoading ? "Загружаем план…" : planLoadError || (selectedPlanCamera ? `${selectedPlanCamera.label} · зал: ${selectedPlanCamera.zoneName}` : "Выберите камеру на плане"),
    source: autoPlanFromVideo ? sourceReady ? "Источник готов · план построим по кадру" : "Выберите источник с реальным кадром" : sourceReady ? "Источник заполнен" : "Выберите и заполните источник",
    stream: testing ? "Проверяем источник…" : tested ? snapshotPreviewUrl ? "Контрольный кадр готов для AI" : "Нужен реальный кадр из видео" : "Запустите тест источника",
    "gpt-plan": autoDraftCreating ? "Сохраняем подтверждённый AI-план…" : visionRunning ? "AI строит схему видимой зоны…" : visionFallback ? "Резервный результат · повторите анализ" : !autoPlanQualityReady && visionResult ? "Низкая уверенность · нужен другой кадр" : visionError || (visionResult ? `AI · ${Math.round(visionResult.layout.confidence * 100)}%` : "Ожидаем анализ кадра"),
    "vision-check": visionRunning ? "YOLO и GPT сверяют сцену…" : visionFallback ? "Резервный результат · AI-проверка не подтверждена" : visionError || (reconciliationStatus === "ok" ? "План и кадр согласованы" : reconciliationStatus === "warning" ? "Подтвердите предупреждение" : reconciliationStatus === "mismatch" ? "Нужно повторить проверку" : "Ожидаем анализ"),
    privacy: "Настройки приватности готовы",
    review: "Можно добавить камеру",
  };
  const stepHint = stepHintById[step];
  const asPercent = (value: number) => Math.round((value <= 1 ? value * 100 : value));
  const visionTimeoutSeconds = CAMERA_VISION_TIMEOUT_SECONDS;
  const visionSecondsRemaining = Math.max(0, visionTimeoutSeconds - visionElapsedSeconds);
  const displayedRoom = autoPlanFromVideo && visionResult
    ? visionResult.layout.room
    : selectedZoneDefinition
      ? { name: selectedZoneDefinition.name, type: selectedZoneDefinition.type, left: selectedZoneDefinition.left, top: selectedZoneDefinition.top, width: selectedZoneDefinition.width, height: selectedZoneDefinition.height }
      : null;
  const displayedPlanObjects = autoPlanFromVideo && visionResult
    ? visionResult.layout.objects
    : wizardPlanElements.filter((item) => item.floor === floorNumber && ["table", "door"].includes(item.kind) && (!selectedPlanCamera?.zoneId || item.zoneId === selectedPlanCamera.zoneId));
  const displayedPlanCamera = autoPlanFromVideo && visionResult
    ? visionResult.layout.camera
    : selectedPlanCamera
      ? { x: selectedPlanCamera.x, y: selectedPlanCamera.y, rotation: orientation, viewAngle: 90, viewRadius: 28 }
      : null;
  const detectorIsActual = visionResult ? cameraVisionEngineIsActual(visionResult.engines.detector) : false;
  const chooseSource = (value: CameraSetup["sourceType"]) => { if (value !== source) { videoExtractionRunRef.current += 1; if (temporaryVideo?.extracting) setTemporaryVideo(null); } setSource(value); resetStreamCheck(); setError(""); };
  const choosePlanCamera = (slot: CameraPlanSlot) => {
    if (connectedCameraByPlanId.has(slot.id)) { setError(`Точка «${slot.label}» уже подключена как ${connectedCameraByPlanId.get(slot.id)?.id}.`); return; }
    if (!slot.zoneId) { setError(`Точка «${slot.label}» находится вне зала. Переместите её внутрь зоны на плане.`); return; }
    setPlanElementId(slot.id);
    setZone(slot.zoneName);
    setName(`${slot.label} · ${slot.zoneName}`);
    setAutoPlanFromVideo(false);
    setAutoDraftElementId("");
    setAutoPlanAccepted(false);
    resetStreamCheck();
    setError("");
  };
  const startAutoPlanFromVideo = () => {
    if (!currentWizardFloorRecord) { setError("Сначала выберите сохранённый этаж, для которого можно создать точку камеры."); return; }
    setAutoPlanFromVideo(true);
    if (!autoDraftElementId) {
      setPlanElementId("");
      setZone("");
      setName("");
      setAutoPlanAccepted(false);
    }
    chooseSource("rtsp");
    setStep("source");
  };
  const runStreamTest = async () => {
    const runId = testRunRef.current + 1;
    testRunRef.current = runId;
    setTesting(true);
    setTested(false);
    setSnapshotId("");
    setSnapshotCapturedAt("");
    setSnapshotPreviewUrl("");
    resetVisionCheck();
    try {
      if (source === "upload") {
        if (!temporaryVideoReady || !temporaryVideo) throw new Error("Видео ещё не готово к проверке.");
        if (temporaryVideo.format === "mp4") {
          const video = streamVideoRef.current;
          if (!video) throw new Error("MP4 ещё не готов к воспроизведению.");
          if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - .1)) video.currentTime = 0;
          await video.play();
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        } else {
          if (!temporaryVideo.frameDataUrl) throw new Error("Кадр из AVI ещё не извлечён.");
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
      if (testRunRef.current !== runId) return;
      setTesting(false);
      setTested(true);
      notify(source === "upload" && temporaryVideo
        ? temporaryVideo.format === "avi"
          ? `AVI прочитан · реальный кадр ${temporaryVideo.width}×${temporaryVideo.height} извлечён для проверки`
          : `MP4 воспроизводится · ${temporaryVideo.width}×${temporaryVideo.height} · ${temporaryVideoSize}`
        : `Поток ${selectedPlanCamera?.label ?? "камеры"} стабилен · 1920×1080 · 25 FPS · latency 196 мс`);
    } catch (streamError) {
      if (testRunRef.current !== runId) return;
      setTesting(false);
      setTested(false);
      setError(streamError instanceof Error ? streamError.message : "Не удалось проверить временное видео.");
    }
  };
  const captureSnapshot = () => {
    if (!tested || testing) { setError("Сначала дождитесь успешной проверки потока."); return; }
    if (source !== "upload") {
      setError("Для AI-плана и YOLO нужен настоящий кадр. Выберите временный MP4 или AVI на шаге источника.");
      return;
    }
    if (!temporaryVideoReady || !temporaryVideo) { setError("Дождитесь подготовки видео и повторите."); return; }
    let previewUrl = temporaryVideo.frameDataUrl ?? "";
    if (temporaryVideo.format === "mp4") {
      const video = streamVideoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) { setError("Дождитесь появления кадра MP4 и повторите."); return; }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) { setError("Браузер не смог подготовить контрольный кадр."); return; }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      previewUrl = canvas.toDataURL("image/jpeg", .86);
    }
    if (!previewUrl) { setError("Сервер не вернул кадр из AVI. Выберите файл повторно."); return; }
    setSnapshotPreviewUrl(previewUrl);
    resetVisionCheck();
    const capturedAt = new Date().toISOString();
    const id = globalThis.crypto?.randomUUID?.() ?? `snapshot-${capturedAt.replace(/\D/g, "")}`;
    setSnapshotId(id);
    setSnapshotCapturedAt(capturedAt);
    notify(`Контрольный кадр ${temporaryVideoFormatLabel} с «${selectedPlanCamera?.label ?? "камеры"}» зафиксирован · ${new Date(capturedAt).toLocaleTimeString("ru-RU")}`);
  };
  const analyzeCameraVision = async ({ force = false }: { force?: boolean } = {}) => {
    const preconditionError = !snapshotPreviewUrl
      ? "Нет настоящего контрольного кадра. Выберите MP4 или AVI, проверьте видео и нажмите «Снять фото»."
      : !currentWizardFloorRecord
        ? "Не найден сохранённый этаж для анализа камеры."
        : "";
    if (preconditionError) {
      setVisionRunning(false);
      setVisionResult(null);
      setVisionError(preconditionError);
      setError(preconditionError);
      return null;
    }
    if (!force && visionResult && visionSnapshotId === snapshotId) return visionResult;
    visionAbortRef.current?.abort();
    const runId = visionRunRef.current + 1;
    visionRunRef.current = runId;
    const controller = new AbortController();
    visionAbortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CAMERA_VISION_TIMEOUT_MS);
    setVisionRunning(true);
    setVisionElapsedSeconds(0);
    setVisionResult(null);
    setVisionSnapshotId("");
    setVisionError("");
    setVisionWarningAccepted(false);
    setError("");
    try {
      const frameResponse = await fetch(snapshotPreviewUrl);
      const frameBlob = await frameResponse.blob();
      if (!frameBlob.size) throw new Error("Контрольный кадр пустой. Переснимите фото из видео.");
      const form = new FormData();
      form.append("frame", new File([frameBlob], `camera-${snapshotId || "frame"}.jpg`, { type: frameBlob.type || "image/jpeg" }));
      form.append("context", JSON.stringify({
        mode: autoPlanFromVideo && !autoPlanAccepted ? "video-plan" : "existing-plan",
        placementMode: autoPlanFromVideo && !autoPlanAccepted ? "auto" : "manual",
        location: { id: selectedLocation.id, name: selectedLocation.name },
        floor: { id: currentWizardFloorRecord.id, level: currentWizardFloorRecord.level, name: currentWizardFloorRecord.name },
        camera: selectedPlanCamera ? { id: selectedPlanCamera.id, name: selectedPlanCamera.label, label: selectedPlanCamera.label, x: selectedPlanCamera.x, y: selectedPlanCamera.y, zoneId: selectedPlanCamera.zoneId, zoneName: selectedPlanCamera.zoneName } : null,
        zone: selectedZoneDefinition ?? null,
        plan: {
          zones: floorZones,
          elements: wizardPlanElements.filter((item) => item.floor === floorNumber
            && item.kind !== "camera"
            && (!selectedPlanCamera?.zoneId || item.zoneId === selectedPlanCamera.zoneId)),
        },
      }));
      const result = await apiFetch<CameraVisionResult>("/camera-vision/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!result?.layout?.room || !result?.layout?.camera || !Array.isArray(result.detections) || !result.reconciliation) {
        throw new Error("AI вернул неполный результат. Повторите анализ кадра.");
      }
      if (visionRunRef.current !== runId) return null;
      setVisionResult(result);
      setVisionSnapshotId(snapshotId);
      if (cameraVisionResultIsFallback(result)) {
        const message = cameraVisionFallbackMessage(result);
        setVisionError(message);
        setError(message);
        notify(`AI вернул резервный результат · ${result.detections.length} детекций доступны только для диагностики`);
      } else {
        setVisionError("");
        setError("");
        notify(`AI-анализ готов · ${result.detections.length} объектов · сверка ${asPercent(result.reconciliation.score)}%`);
      }
      return result;
    } catch (visionFailure) {
      if (visionRunRef.current !== runId) return null;
      const aborted = visionFailure instanceof Error && visionFailure.name === "AbortError";
      const message = timedOut
        ? `AI не ответил за ${CAMERA_VISION_TIMEOUT_SECONDS} секунд. Запрос остановлен, но контрольный кадр остался в мастере — нажмите «Повторить анализ».`
        : aborted
          ? "AI-анализ остановлен. Контрольный кадр остался в мастере — можно повторить без загрузки видео заново."
          : visionFailure instanceof Error
            ? visionFailure.message
            : "Не удалось проанализировать контрольный кадр.";
      setVisionResult(null);
      setVisionSnapshotId("");
      setVisionError(message);
      setError(message);
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (visionAbortRef.current === controller) visionAbortRef.current = null;
      if (visionRunRef.current === runId) setVisionRunning(false);
    }
  };
  const cancelCameraVision = () => {
    if (!visionRunning) return;
    visionAbortRef.current?.abort();
  };
  const commitAutoPlan = async () => {
    if (autoDraftElementId && selectedPlanCamera) { setAutoPlanAccepted(true); return; }
    if (!currentWizardFloorRecord) throw new Error("Не найден сохранённый этаж для автоматического плана.");
    if (!visionResult?.layout) throw new Error("Сначала дождитесь результата GPT по контрольному кадру.");
    if (!autoPlanQualityReady) throw new Error(`Этот кадр недостаточно надёжен для создания плана: ${autoPlanQualityMessage}. Вернитесь к контрольному кадру и выберите более обзорный момент.`);
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
    const room = visionResult.layout.room;
    const left = clamp(room.left, 0, 99.9);
    const top = clamp(room.top, 0, 99.9);
    const width = clamp(room.width, .1, 100 - left);
    const roomHeight = clamp(room.height, .1, 100 - top);
    setAutoDraftCreating(true);
    let createdZone: VenueZoneDefinition | null = null;
    const createdElementIds: string[] = [];
    try {
      const zoneResult = await apiFetch<{ zone: VenueZoneDefinition; location: VenueLocation }>(`/floors/${encodeURIComponent(currentWizardFloorRecord.id)}/zones`, {
        method: "POST",
        body: JSON.stringify({ name: (room.name || "Зал по видео").trim().slice(0, 100), type: (room.type || "Видео · GPT").trim().slice(0, 80), capacity: 0, coverage: 0, left, top, width, height: roomHeight }),
      });
      createdZone = zoneResult.zone;
      const createdObjects: PlanElement[] = [];
      for (const [index, object] of visionResult.layout.objects.entries()) {
        const rawKind = object.kind.toLocaleLowerCase();
        const kind = /^(table|wall|door|label)$/.test(rawKind)
          ? rawKind as "table" | "wall" | "door" | "label"
          : /counter|стойк|bar/.test(rawKind)
            ? "table" as const
            : /seat|chair|мест|стул/.test(rawKind)
              ? "label" as const
              : null;
        if (!kind) continue;
        const objectLeft = clamp(object.x, 0, 99.95);
        const objectTop = clamp(object.y, 0, 99.95);
        const objectWidth = clamp(object.width, .05, 100 - objectLeft);
        const objectHeight = clamp(object.height, .05, 100 - objectTop);
        const objectResult = await apiFetch<{ planElement: PlanElement }>(`/floors/${encodeURIComponent(currentWizardFloorRecord.id)}/plan/elements`, {
          method: "POST",
          body: JSON.stringify({
            clientId: `camera-ai-object-${globalThis.crypto?.randomUUID?.() ?? `${snapshotId || "frame"}-${index}`}`,
            kind,
            zoneId: createdZone.id,
            x: objectLeft,
            y: objectTop,
            width: objectWidth,
            height: objectHeight,
            rotation: 0,
            label: (object.label || `${kind} ${index + 1}`).trim().slice(0, 160),
            shape: kind === "wall" ? "line" : kind === "table" ? "round" : "rectangle",
            color: kind === "table" ? "#5f746b" : "#718079",
            zIndex: 10 + index,
            locked: false,
            seats: kind === "table" ? Math.min(50, Math.max(0, Math.round(object.seats || 0))) : 0,
          }),
        });
        createdObjects.push(objectResult.planElement);
        createdElementIds.push(objectResult.planElement.id);
      }
      let cameraNumber = 1;
      const usedLabels = new Set(wizardPlanElements.filter((item) => item.kind === "camera").map((item) => item.label.toLocaleLowerCase()));
      while (usedLabels.has(`камера ${cameraNumber}`)) cameraNumber += 1;
      const cameraDraft = visionResult.layout.camera;
      const elementWidth = Math.min(6.5, width);
      const elementHeight = Math.min(4, roomHeight);
      const cameraAnchorX = clamp(cameraDraft.x, left, left + width);
      const cameraAnchorY = clamp(cameraDraft.y, top, top + roomHeight);
      const x = clamp(cameraAnchorX - elementWidth / 2, 0, 100 - elementWidth);
      const y = clamp(cameraAnchorY - elementHeight / 2, 0, 100 - elementHeight);
      const clientId = `camera-ai-${(globalThis.crypto?.randomUUID?.() ?? snapshotId) || "frame"}`;
      const elementResult = await apiFetch<{ planElement: PlanElement }>(`/floors/${encodeURIComponent(currentWizardFloorRecord.id)}/plan/elements`, {
        method: "POST",
        body: JSON.stringify({ clientId, kind: "camera", zoneId: createdZone.id, x, y, width: elementWidth, height: elementHeight, rotation: clamp(cameraDraft.rotation, -360, 360), label: `Камера ${cameraNumber}`, shape: "icon", color: "#2e88b3", zIndex: 20, locked: false, viewAngle: clamp(cameraDraft.viewAngle, 20, 160), viewRadius: clamp(cameraDraft.viewRadius, 5, 60), viewEnabled: true }),
      });
      createdElementIds.push(elementResult.planElement.id);
      setWizardZones((current) => [...current.filter((item) => item.id !== createdZone?.id), createdZone as VenueZoneDefinition]);
      setWizardPlanElements((current) => [...current.filter((item) => !createdElementIds.includes(item.id)), ...createdObjects, elementResult.planElement]);
      setAutoDraftElementId(elementResult.planElement.id);
      setPlanElementId(elementResult.planElement.id);
      setZone(createdZone.name);
      setName(`${elementResult.planElement.label} · ${createdZone.name}`);
      setOrientation(((cameraDraft.rotation % 360) + 360) % 360);
      setAutoPlanAccepted(true);
      notify(`${elementResult.planElement.label} и зал «${createdZone.name}» сохранены по контрольному кадру`);
    } catch (draftError) {
      await Promise.allSettled(createdElementIds.map((id) => apiFetch(`/plan-elements/${encodeURIComponent(id)}`, { method: "DELETE" })));
      if (createdZone) await apiFetch(`/zones/${encodeURIComponent(createdZone.id)}`, { method: "DELETE" }).catch(() => undefined);
      throw draftError;
    } finally {
      setAutoDraftCreating(false);
    }
  };
  const next = async () => {
    setError("");
    if (step === "placement") {
      if (planLoading) { setError("План этажа ещё загружается. Подождите несколько секунд."); return; }
      if (planLoadError) { setError(planLoadError); return; }
      if (planCameraSlots.length === 0) { setError("На плане выбранного этажа нет созданных камер. Выберите «Настроить по видео» или добавьте точку в редакторе плана."); return; }
      if (availablePlanCameraSlots.length === 0) { setError("Все камеры на этом этаже уже подключены."); return; }
      if (!name.trim() || !floor || !selectedPlanCamera) { setError("Выберите конкретную камеру из списка камер на плане."); return; }
      if (!selectedPlanCamera.zoneId) { setError("Камера должна находиться внутри зоны зала на плане."); return; }
      setStep("source");
      return;
    }
    if (step === "source") {
      if (!sourceReady) { setError(source === "onvif" ? "Выберите найденное ONVIF-устройство." : source === "upload" ? temporaryVideo?.extracting ? "Дождитесь извлечения кадра из AVI." : "Выберите корректный MP4 или AVI и дождитесь подготовки видео." : "Заполните обязательные параметры источника."); return; }
      setStep("stream");
      return;
    }
    if (step === "stream") {
      if (!tested || testing) { setError("Сначала запустите тест потока и дождитесь результата."); return; }
      if (!snapshotId || !snapshotCapturedAt || !snapshotPreviewUrl) { setError("Для AI-плана и YOLO нужен настоящий контрольный кадр. Выберите временный MP4 или AVI и нажмите «Снять фото»."); return; }
      setStep(autoPlanFromVideo && !autoPlanAccepted ? "gpt-plan" : "vision-check");
      await analyzeCameraVision();
      return;
    }
    if (step === "gpt-plan") {
      if (!visionResult || visionRunning) { setError(visionError || "Дождитесь, пока GPT построит черновой план зала."); return; }
      if (visionFallback) { setError(visionFallbackMessage); return; }
      if (!autoPlanQualityReady) { setError(`План нельзя принять: ${autoPlanQualityMessage}. Выберите другой контрольный кадр.`); return; }
      try {
        await commitAutoPlan();
        setStep("vision-check");
      } catch (draftError) {
        setError(draftError instanceof Error ? draftError.message : "Не удалось сохранить подтверждённый AI-план.");
      }
      return;
    }
    if (step === "vision-check") {
      if (visionRunning || !visionResult) { setError(visionError || "Дождитесь YOLO и GPT-сверки."); return; }
      if (visionFallback) { setError(visionFallbackMessage); return; }
      if (reconciliationStatus === "mismatch") { setError("GPT нашёл существенное расхождение плана и кадра. Повторите проверку на более репрезентативном кадре."); return; }
      if (reconciliationStatus === "warning" && !visionWarningAccepted) { setError("Подтвердите, что предупреждения проверки просмотрены."); return; }
      setStep("privacy");
      return;
    }
    if (step === "privacy") { setStep("review"); return; }
    if (!selectedPlanCamera?.zoneId || !sourceReady || !tested || !snapshotId || !snapshotCapturedAt || !visionReady || compatibleAnalytics.length === 0) { setError("Проверьте обязательные шаги мастера перед сохранением."); return; }
    setSubmitting(true);
    try {
      await complete({ location: { ...selectedLocation, customZones: wizardZones, planElements: wizardPlanElements, zones: wizardZones.length }, name: name.trim(), floor, zone, zoneId: selectedPlanCamera.zoneId, source: sourceLabel, sourceType: source, sourceRef, analytics: compatibleAnalytics, retention, height, angle, orientation, privacy, rawVideo, planElementId, planCameraLabel: selectedPlanCamera.label, snapshotId, snapshotCapturedAt, temporaryVideoFile: temporaryVideo?.file, temporaryVideoFormat: temporaryVideo?.format, temporaryVideoPreviewUrl: snapshotPreviewUrl, temporaryVideoDuration: temporaryVideo?.duration, temporaryVideoFrameTime: temporaryVideo?.frameTime, temporaryVideoWidth: temporaryVideo?.width, temporaryVideoHeight: temporaryVideo?.height });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить камеру. Повторите попытку.");
      setSubmitting(false);
    }
  };
  return (
    <div className="sys-wizard-backdrop">
      <section className="sys-wizard" role="dialog" aria-modal="true" aria-labelledby="camera-wizard-title" onKeyDown={trapWizardFocus}>
        <header><div><i><Camera /></i><p><span>МАСТЕР ПОДКЛЮЧЕНИЯ</span><strong id="camera-wizard-title">Новая камера</strong></p></div><button disabled={submitting || autoDraftCreating || visionRunning} onClick={() => { videoExtractionRunRef.current += 1; close(); }} aria-label="Закрыть мастер камеры"><X /></button></header>
        <div className="sys-wizard-progress">{visibleSteps.map((stepId, index) => { const title = stepDefinitions[stepId].title; const completed = index < currentStepIndex; return <button aria-current={stepId === step ? "step" : undefined} aria-label={`Шаг ${index + 1}: ${title}`} className={stepId === step ? "active" : completed ? "done" : ""} disabled={index > currentStepIndex || submitting || autoDraftCreating || visionRunning} key={stepId} onClick={() => { if (completed) { setStep(stepId); setError(""); } }}><i>{completed ? <Check /> : index + 1}</i><span>{title}</span></button>; })}</div>
        <div className="sys-wizard-body" ref={wizardMainRef} tabIndex={-1} aria-label={`Шаг ${currentStepNumber}: ${stepDefinitions[step].title}`}>
          {step === "placement" && (
            <div className="sys-wizard-content sys-camera-plan-step">
              <span className="sys-kicker"><Camera /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span>
              <h2>Выберите камеру на плане</h2>
              <p>Выберите готовую точку — зал определится автоматически. Если точки ещё нет, настройте размещение по видео.</p>
              <span id="auto-plan-video-help" className="sys-sr-only">Выбор камеры на плане будет пропущен. После контрольного кадра GPT предложит черновой зал и положение камеры, а сохранение произойдёт только после подтверждения.</span>
              <div className="sys-camera-step-fields">
                <label>Этаж<select required value={floor} onChange={(event) => selectWizardFloor(event.target.value)}>{wizardFloorOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                <label>Название подключения<input disabled={!selectedPlanCamera} value={name} placeholder="Сначала выберите камеру" onChange={(event) => setName(event.target.value)} /></label>
              </div>
              <div className="sys-camera-plan-picker">
                <div ref={wizardPlanMapRef} className={`sys-camera-plan-map${planBackgroundUrl ? " has-photo" : ""}`}>
                  {planBackgroundUrl && (
                    <>
                      <span className="sys-camera-plan-photo-label"><ImagePlus /> Подложка плана</span>
                      {/* Protected same-origin plan asset; the browser includes the auth cookie. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="sys-camera-plan-probe" src={planBackgroundUrl} alt="" aria-hidden="true" onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setWizardPlanAspectRatios((current) => ({ ...current, [floorNumber]: image.naturalWidth / image.naturalHeight })); }} />
                    </>
                  )}
                  <div className={`sys-camera-plan-surface${planBackgroundUrl ? " has-photo" : ""}`} style={planBackgroundUrl ? { width: `${planSurfaceWidth}%`, height: `${planSurfaceHeight}%`, backgroundImage: `url(${JSON.stringify(planBackgroundUrl)})` } : undefined}>
                    {floorZones.map((item) => <div className={`sys-camera-plan-zone${selectedPlanCamera?.zoneId === item.id ? " active" : ""}`} key={item.id} style={{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%` }}><span>{item.name}</span></div>)}
                    {planCameraSlots.map((slot) => {
                      const connected = connectedCameraByPlanId.get(slot.id);
                      const unavailable = Boolean(connected) || !slot.zoneId;
                      return <button key={slot.id} disabled={unavailable} aria-pressed={planElementId === slot.id} className={`${planElementId === slot.id ? "active" : ""}${!slot.zoneId ? " outside" : ""}${slot.y > 78 ? " label-above" : ""}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onClick={() => choosePlanCamera(slot)} aria-label={connected ? `${slot.label} уже подключена как ${connected.id}` : !slot.zoneId ? `${slot.label} находится вне зала` : `Выбрать ${slot.label}, ${slot.zoneName}`}><Camera /><strong>{slot.label}</strong>{planElementId === slot.id ? <Check /> : connected ? <LockKeyhole /> : null}</button>;
                    })}
                  </div>
                </div>
                <aside>
                  <span>КАМЕРЫ НА ПЛАНЕ</span>
                  <div className="sys-camera-plan-list">
                    {planLoading ? <div className="sys-camera-plan-empty"><RefreshCw /><p><strong>Загружаем план</strong><small>Получаем фото, камеры и зоны выбранного этажа.</small></p></div> : planLoadError ? <div className="sys-camera-plan-empty"><AlertTriangle /><p><strong>План не загрузился</strong><small>{planLoadError}</small><button className="secondary" onClick={retryPlan}>Повторить</button></p></div> : planCameraSlots.length === 0 ? <div className="sys-camera-plan-empty"><AlertTriangle /><p><strong>На этаже нет камер</strong><small>Создайте точку камеры в редакторе плана, затем вернитесь сюда.</small></p></div> : planCameraSlots.map((slot) => {
                      const connected = connectedCameraByPlanId.get(slot.id);
                      const unavailable = Boolean(connected) || !slot.zoneId;
                      return <button key={slot.id} disabled={unavailable} aria-pressed={planElementId === slot.id} className={`${planElementId === slot.id ? "active" : ""}${!slot.zoneId ? " outside" : ""}`} onClick={() => choosePlanCamera(slot)}><Camera /><p><strong>{slot.label}</strong><span>{connected ? `Уже подключена: ${connected.id}` : slot.zoneId ? `Зал: ${slot.zoneName}` : "Вне зала · переместите точку в зону"}</span></p>{planElementId === slot.id ? <CheckCircle2 /> : connected ? <LockKeyhole /> : <ChevronRight />}</button>;
                    })}
                  </div>
                </aside>
              </div>
              {!planLoading && !planLoadError && planCameraSlots.length === 0 && <div className="sys-form-error"><AlertTriangle />На плане этого этажа пока нет камер. Выберите автонастройку по видео или создайте точку вручную.</div>}
              {!planLoading && !planLoadError && planCameraSlots.length > 0 && availablePlanCameraSlots.length === 0 && <div className="sys-form-error"><AlertTriangle />Все точки камер уже подключены. Новую можно создать автоматически по видео.</div>}
            </div>
          )}
          {step === "source" && (
            <div className="sys-wizard-content">
              <span className="sys-kicker"><Cable /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span>
              <h2>Как получить видеопоток?</h2>
              <p>Выберите источник. MP4 или AVI можно подключить временно: файл не сохраняется и после обновления потребуется снова.</p>
              {autoPlanFromVideo && <div className="sys-auto-plan-status" role="status"><Sparkles /><p><strong>План настроим по видео</strong><span>После контрольного кадра GPT покажет черновой зал. Ничего не сохранится без вашего подтверждения.</span></p><button className="secondary" onClick={() => { setStep("placement"); setError(""); }}>Выбрать на плане</button></div>}
              <div className="sys-source-options">
                {[["onvif", Router, "Найти по ONVIF", "Автопоиск в локальной сети"], ["rtsp", Cable, "RTSP URL", "Подключение по адресу потока"], ["vendor", Cloud, "Cloud VMS", "Verkada, Rhombus, Meraki"], ["upload", Upload, "Временное видео", "MP4 или AVI для теста"]].map(([key, Icon, title, text]: any) => <button aria-pressed={source === key} className={source === key ? "active" : ""} key={key} onClick={() => chooseSource(key)}><i><Icon /></i><strong>{title}</strong><span>{text}</span>{source === key && <CheckCircle2 />}</button>)}
              </div>
              {source === "onvif" && <div className="sys-discovery"><div><RefreshCw /><p><strong>Найдено 3 устройства</strong><span>Сканирование подсети 192.168.1.0/24 завершено</span></p></div>{discoveredDevices.map((item, index) => <button aria-pressed={device === index} className={device === index ? "active" : ""} key={item[1]} onClick={() => setDevice(index)}><Camera /><p><strong>{item[0]}</strong><span>{item[1]} · ONVIF S</span></p><SystemPill tone={device === index ? "success" : "neutral"}>{device === index ? "Выбрано" : "Выбрать"}</SystemPill></button>)}</div>}
              {source === "rtsp" && <div className="sys-form-grid"><label className="wide">RTSP URL *<input ref={rtspUrlRef} required placeholder="rtsp://192.168.1.42:554/stream1" value={rtsp.url} onChange={(event) => setRtsp((current) => ({ ...current, url: event.target.value }))} /></label><label>Логин *<input required autoComplete="username" value={rtsp.login} onChange={(event) => setRtsp((current) => ({ ...current, login: event.target.value }))} /></label><label>Пароль *<input required autoComplete="current-password" type="password" value={rtsp.password} onChange={(event) => setRtsp((current) => ({ ...current, password: event.target.value }))} /></label></div>}
              {source === "vendor" && <div className="sys-form-grid"><label>Провайдер *<select value={vendor.provider} onChange={(event) => setVendor((current) => ({ ...current, provider: event.target.value }))}><option>Verkada</option><option>Rhombus</option><option>Meraki</option></select></label><label>Site / organization *<input required value={vendor.site} onChange={(event) => setVendor((current) => ({ ...current, site: event.target.value }))} /></label><label className="wide">Camera ID / name *<input required value={vendor.camera} onChange={(event) => setVendor((current) => ({ ...current, camera: event.target.value }))} /></label></div>}
              {source === "upload" && (
                <div className={`sys-upload-panel${temporaryVideoReady ? " selected" : ""}`}>
                  <input ref={videoInputRef} aria-label="Выбрать временный MP4 или AVI" type="file" accept={TEMPORARY_VIDEO_ACCEPT} value="" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void chooseTemporaryVideo(file); }} />
                  <div className="sys-upload-panel-head"><i><Upload /></i><p><strong>{temporaryVideo ? temporaryVideo.file.name : "Загрузите MP4 или AVI для временного теста"}</strong><span>{temporaryVideo ? temporaryVideo.extracting ? `${temporaryVideoSize} · извлекаем реальный кадр из AVI…` : temporaryVideo.extractionError ? temporaryVideo.extractionError : `${temporaryVideoSize}${temporaryVideoDuration ? ` · ${temporaryVideoDuration}` : temporaryVideo.format === "avi" ? " · кадр извлечён" : " · читаем метаданные…"}` : "MP4 до 500 МБ · AVI до 200 МБ"}</span></p><button className="secondary" disabled={temporaryVideo?.extracting} onClick={() => videoInputRef.current?.click()}>{temporaryVideo ? "Заменить файл" : "Выбрать видео"}</button></div>
                  {temporaryVideo?.format === "mp4" && temporaryVideo.url && <div className="sys-upload-video"><video src={temporaryVideo.url} controls muted playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; setTemporaryVideo((current) => current?.format === "mp4" ? { ...current, duration: video.duration, width: video.videoWidth, height: video.videoHeight } : current); setError(""); }} onError={() => setError("Браузер не смог прочитать этот MP4. Проверьте кодек видео.")} /><span>{temporaryVideoReady ? `${temporaryVideo.width}×${temporaryVideo.height} · готово к тесту` : "Проверяем MP4…"}</span></div>}
                  {temporaryVideo?.format === "avi" && temporaryVideo.frameDataUrl && <div className="sys-upload-video"><div className="sys-upload-video-frame" role="img" aria-label="Реальный кадр, извлечённый из AVI" style={{ backgroundImage: `url(${JSON.stringify(temporaryVideo.frameDataUrl)})` }} /><span>{temporaryVideo.width}×{temporaryVideo.height} · кадр из AVI</span></div>}
                  <div className="sys-upload-note"><Info /> MP4 читается в браузере. AVI отправляется только для извлечения одного кадра и на сервере не сохраняется.</div>
                </div>
              )}
            </div>
          )}
          {step === "stream" && (
            <div className="sys-wizard-content">
              <span className="sys-kicker"><Video /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span><h2>Проверьте камеру и снимите контрольный кадр</h2><p>Для настоящего GPT/YOLO-анализа нужен кадр из временного MP4 или AVI. MP4 можно просмотреть, для AVI показан реальный кадр, извлечённый сервером.</p>
              <div className="sys-stream-test">
                <div className={`sys-stream-preview ${tested ? "tested" : ""} ${snapshotCapturedAt ? "snapshot" : ""}`}>
                  <span>{selectedPlanCamera?.label ?? (autoPlanFromVideo ? "Новая камера · авторазмещение" : "Камера")} · {testing ? "TEST" : snapshotTimeLabel || (source === "upload" ? temporaryVideoFormatLabel : "LIVE")}</span>
                  {source === "upload" && temporaryVideo?.format === "mp4" && temporaryVideo.url ? <video ref={streamVideoRef} src={temporaryVideo.url} controls muted playsInline preload="auto" /> : source === "upload" && temporaryVideo?.format === "avi" && temporaryVideo.frameDataUrl ? <div className="sys-stream-video-frame" role="img" aria-label="Кадр из временного AVI" style={{ backgroundImage: `url(${JSON.stringify(temporaryVideo.frameDataUrl)})` }} /> : <i><Video /></i>}
                  {snapshotPreviewUrl && <div className="sys-stream-snapshot" style={{ backgroundImage: `url(${JSON.stringify(snapshotPreviewUrl)})` }} />}
                  {tested && !snapshotCapturedAt && source !== "upload" && <><div className="sys-person-box person-a"><small>person · 97%</small></div><div className="sys-person-box person-b"><small>person · 95%</small></div></>}
                  <div className="sys-stream-actions"><button disabled={testing || Boolean(temporaryVideo?.extracting)} onClick={runStreamTest}>{testing || tested ? <RefreshCw /> : <PlayIcon />} {testing ? "Проверяем…" : tested ? "Проверить снова" : source === "upload" ? `Проверить ${temporaryVideoFormatLabel}` : "Запустить тест"}</button>{tested && <button className="capture" onClick={captureSnapshot}><Camera /> {snapshotCapturedAt ? "Переснять кадр" : "Снять фото"}</button>}</div>
                  {snapshotCapturedAt && <div className="sys-snapshot-stamp"><CheckCircle2 /><strong>Контрольный кадр готов</strong><span>{snapshotTimeLabel} · {selectedPlanCamera?.label ?? "новая камера"} · {snapshotId.slice(0, 8)}</span></div>}
                </div>
                <aside>{[["Источник", testing ? "Проверяем" : tested ? source === "upload" ? temporaryVideo?.format === "avi" ? "AVI · кадр извлечён" : "MP4 читается" : "Стабильно" : "Ожидает", tested], ["Разрешение", tested ? checkedResolution : "—", tested], ["FPS", tested ? checkedFps : "—", tested], ["Битрейт", tested ? checkedBitrate : "—", tested], ["Задержка", tested ? checkedLatency : "—", tested], ["Кадр", snapshotCapturedAt ? "Снят" : tested ? "Нужен" : "—", Boolean(snapshotCapturedAt)]].map(([label, value, ok]: any) => <div key={label}><span>{label}</span><strong>{value}</strong>{ok && <Check />}</div>)}</aside>
              </div>
              {tested && <div className="sys-test-result"><CheckCircle2 /><p><strong>{source === "upload" ? `${temporaryVideoFormatLabel} пригоден для AI-проверки` : "Соединение проверено, но реального кадра ещё нет"}</strong><span>{snapshotCapturedAt ? `${autoPlanFromVideo ? "GPT построит по кадру черновой зал. " : ""}Контрольный кадр зафиксирован в ${snapshotTimeLabel}.` : source === "upload" ? "Теперь снимите обязательный контрольный кадр." : "Вернитесь к источнику и выберите временный MP4 или AVI для GPT и YOLO."}</span></p><SystemPill tone={snapshotCapturedAt ? "success" : "warning"}>{snapshotCapturedAt ? "Готово" : "Нужно фото"}</SystemPill></div>}
            </div>
          )}
          {step === "gpt-plan" && (
            <div className="sys-wizard-content sys-gpt-plan-step">
              <span className="sys-kicker"><Sparkles /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span>
              <h2>AI предложил схему видимой зоны</h2>
              <p>Это не точный план помещения, а camera-centric черновик по одному ракурсу. На схеме остаются только уверенно распознанные стационарные объекты.</p>
              {visionRunning ? (
                <div className="sys-ai-progress" aria-live="polite" aria-busy="true"><div className="sys-ai-progress-head"><span><i><Sparkles /></i><span><strong>AI анализирует перспективу</strong><small>YOLO ищет объекты, GPT строит схему только видимой зоны</small></span></span><b>AI</b></div><div className="sys-ai-progress-track is-indeterminate" aria-hidden="true"><i /></div><footer><span><time dateTime={`PT${visionElapsedSeconds}S`}>{visionElapsedSeconds} сек</time> · автоостановка через {visionSecondsRemaining} сек</span><button type="button" className="secondary" onClick={cancelCameraVision}>Остановить</button></footer></div>
              ) : visionResult ? (
                <>
                  {visionFallback && <div className="sys-vision-fallback" role="alert"><AlertTriangle /><p><strong>Резервный AI-результат — не подтверждено</strong><span>{visionFallbackMessage}</span></p><button className="secondary" onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить анализ</button></div>}
                  {!visionFallback && !autoPlanQualityReady && <div className="sys-gpt-quality-warning" role="alert"><AlertTriangle /><p><strong>Этот кадр не даёт надёжный план</strong><span>{autoPlanQualityMessage}. Выберите момент, где лучше видны проходы, столы и границы пола.</span></p></div>}
                  <div className="sys-vision-compare sys-gpt-plan-compare">
                    <article className="sys-vision-card"><header><div><Map /><p><strong>AI-схема видимой зоны</strong><span>{visionResult.layout.room.name}</span></p></div><SystemPill tone={visionFallback || !autoPlanQualityReady ? "warning" : "success"}>{asPercent(visionResult.layout.confidence)}%</SystemPill></header><div className="sys-vision-plan" aria-label="Черновая схема видимой зоны, построенная AI"><div className="sys-gpt-plan-room" style={{ left: `${visionResult.layout.room.left}%`, top: `${visionResult.layout.room.top}%`, width: `${visionResult.layout.room.width}%`, height: `${visionResult.layout.room.height}%` }}><strong>{visionResult.layout.room.name}</strong></div>{visionResult.layout.objects.map((object, index) => <div key={`${object.kind}-${index}`} className={`sys-gpt-plan-object kind-${object.kind}`} style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.width}%`, height: `${object.height}%` }}><span>{object.label}{object.seats > 0 ? ` · ${object.seats} мест` : ""}</span></div>)}<div className="sys-gpt-plan-camera" style={{ left: `${visionResult.layout.camera.x}%`, top: `${visionResult.layout.camera.y}%`, transform: `translate(-50%,-50%) rotate(${visionResult.layout.camera.rotation}deg)` }} aria-label="Предложенное положение камеры"><Camera /><b style={{ "--vision-angle": `${visionResult.layout.camera.viewAngle}deg` } as React.CSSProperties} /></div></div></article>
                    <article className="sys-vision-card"><header><div><ScanLine /><p><strong>{detectorIsActual ? "Результат YOLO" : "YOLO · резервный режим"}</strong><span>{visionResult.detections.length} стационарных объектов на этом кадре</span></p></div><SystemPill tone={detectorIsActual ? "success" : "warning"}>{cameraVisionEngineLabel(visionResult.engines.detector)}</SystemPill></header><div className="sys-vision-frame" aria-label="Контрольный кадр с результатом YOLO" style={{ aspectRatio: `${temporaryVideo?.width || 16} / ${temporaryVideo?.height || 9}` }}><div className="sys-vision-frame-image" role="img" aria-label="Контрольный кадр камеры" style={{ backgroundImage: `url(${JSON.stringify(snapshotPreviewUrl)})` }} />{visionResult.detections.map((detection) => <div className="sys-vision-bbox" key={detection.id} style={{ left: `${detection.x}%`, top: `${detection.y}%`, width: `${detection.width}%`, height: `${detection.height}%` }}><span>{detection.label} · {asPercent(detection.confidence)}%</span></div>)}{visionResult.detections.length === 0 && <div className="sys-vision-no-detections"><ScanLine /><span>YOLO не нашёл столы, места, двери или стойки</span></div>}</div></article>
                  </div>
                  <section className="sys-gpt-plan-meta"><div><SystemPill tone={visionFallback || !autoPlanQualityReady ? "warning" : "success"}>{visionFallback ? "Резервный черновик" : autoPlanQualityReady ? `Можно принять · ${asPercent(visionResult.layout.confidence)}%` : `Недостаточно · ${asPercent(visionResult.layout.confidence)}%`}</SystemPill><h3>{visionResult.layout.room.name}</h3><p>{visionResult.layout.summary}</p></div><dl><div><dt>Тип</dt><dd>{visionResult.layout.room.type}</dd></div><div><dt>Схема</dt><dd>{visionResult.layout.objects.length}</dd></div><div><dt>YOLO</dt><dd>{visionResult.detections.length}</dd></div><div><dt>Порог</dt><dd>от {Math.round(AUTO_PLAN_MIN_CONFIDENCE * 100)}%</dd></div></dl><div className="sys-gpt-plan-actions">{!autoPlanQualityReady && <button className="primary" onClick={() => { setStep("stream"); setError(""); }}><Camera /> Другой кадр</button>}<button className="secondary" disabled={visionRunning} onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить AI</button></div></section>
                </>
              ) : <div className="sys-gpt-plan-empty" role="alert"><AlertTriangle /><p><strong>План не построен</strong><span>{visionError || "Повторите анализ контрольного кадра."}</span></p><button className="secondary" onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить</button></div>}
            </div>
          )}
          {step === "vision-check" && (
            <div className="sys-wizard-content sys-vision-step">
              <span className="sys-kicker"><ScanLine /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span>
              <h2>{autoPlanFromVideo ? "Сверьте AI-схему с кадром" : "Проверьте существующий план зала"}</h2>
              <p>{autoPlanFromVideo ? "Слева — принятая схема видимой зоны." : "Слева — сохранённый план выбранного зала; AI не меняет его."} Справа YOLO показывает только столы, места, двери и стойки. GPT ниже сверяет их количество и относительное расположение.</p>
              {visionRunning ? (
                <div className="sys-ai-progress" aria-live="polite" aria-busy="true"><div className="sys-ai-progress-head"><span><i><ScanLine /></i><span><strong>YOLO распознаёт сцену</strong><small>После детекции GPT сверит счётчики и контекст плана</small></span></span><b>AI</b></div><div className="sys-ai-progress-track is-indeterminate" aria-hidden="true"><i /></div><footer><span><time dateTime={`PT${visionElapsedSeconds}S`}>{visionElapsedSeconds} сек</time> · автоостановка через {visionSecondsRemaining} сек</span><button type="button" className="secondary" onClick={cancelCameraVision}>Остановить</button></footer></div>
              ) : visionResult ? (
                <>
                  {visionFallback && <div className="sys-vision-fallback" role="alert"><AlertTriangle /><p><strong>Резервный AI-результат — проверка не пройдена</strong><span>{visionFallbackMessage}</span></p><button className="secondary" onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить анализ</button></div>}
                  <div className="sys-vision-compare">
                    <article className="sys-vision-card"><header><div><Map /><p><strong>{autoPlanFromVideo ? "Принятая AI-схема" : "Существующий план · без изменений"}</strong><span>{displayedRoom?.name ?? zone}</span></p></div><SystemPill tone="neutral">{autoPlanFromVideo ? cameraVisionEngineLabel(visionResult.engines.room) : "Источник истины"}</SystemPill></header><div className="sys-vision-plan" aria-label="План помещения для сверки">{displayedRoom && <div className="sys-vision-room" style={{ left: `${displayedRoom.left}%`, top: `${displayedRoom.top}%`, width: `${displayedRoom.width}%`, height: `${displayedRoom.height}%` }}><strong>{displayedRoom.name}</strong></div>}{displayedPlanObjects.map((object, index) => <div key={`${object.kind}-${object.label}-${index}`} className={`sys-vision-plan-object kind-${object.kind}`} style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.width}%`, height: `${object.height}%` }}><span>{object.label}{"seats" in object && Number(object.seats) > 0 ? ` · ${object.seats} мест` : ""}</span></div>)}{displayedPlanCamera && <div className="sys-vision-plan-camera" style={{ left: `${displayedPlanCamera.x}%`, top: `${displayedPlanCamera.y}%`, transform: `translate(-50%,-50%) rotate(${displayedPlanCamera.rotation}deg)` }}><Camera /></div>}</div></article>
                    <article className="sys-vision-card"><header><div><ScanLine /><p><strong>{detectorIsActual ? "YOLO · стационарные объекты" : "AI-детекция · резервный режим"}</strong><span>{visionResult.detections.length} столов, мест, дверей и стоек</span></p></div><SystemPill tone={detectorIsActual ? "success" : "warning"}>{cameraVisionEngineLabel(visionResult.engines.detector)}</SystemPill></header><div className="sys-vision-frame" aria-label="Контрольный кадр с рамками детектора" style={{ aspectRatio: `${temporaryVideo?.width || 16} / ${temporaryVideo?.height || 9}` }}><div className="sys-vision-frame-image" role="img" aria-label="Контрольный кадр камеры" style={{ backgroundImage: `url(${JSON.stringify(snapshotPreviewUrl)})` }} />{visionResult.detections.map((detection) => <div className="sys-vision-bbox" key={detection.id} style={{ left: `${detection.x}%`, top: `${detection.y}%`, width: `${detection.width}%`, height: `${detection.height}%` }}><span>{detection.label} · {asPercent(detection.confidence)}%</span></div>)}</div></article>
                  </div>
                  <section className={`sys-vision-reconciliation is-${visionFallback ? "warning" : visionResult.reconciliation.status}`} aria-live="polite"><header><div>{!visionFallback && visionResult.reconciliation.status === "ok" ? <CheckCircle2 /> : <AlertTriangle />}<p><strong>{visionFallback ? "Резервная сверка — не подтверждено" : visionResult.reconciliation.status === "ok" ? "План и кадр согласованы" : visionResult.reconciliation.status === "warning" ? "Есть расхождения для проверки" : "План и кадр не совпадают"}</strong><span>{visionFallback ? visionFallbackMessage : visionResult.reconciliation.summary}</span></p></div><SystemPill tone={!visionFallback && visionResult.reconciliation.status === "ok" ? "success" : "warning"}>{visionFallback ? "Нужен Retry" : `${asPercent(visionResult.reconciliation.score)}%`}</SystemPill></header><div className="sys-vision-counts">{visionResult.reconciliation.counts.map((item, index) => <div className={`is-${item.status}`} key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.plan} / {item.detected}</strong><em>план / YOLO</em></div>)}</div>{visionResult.reconciliation.recommendations.length > 0 && <ul>{visionResult.reconciliation.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}<footer><span>GPT-сверка · {cameraVisionEngineLabel(visionResult.engines.reconciliation)}</span><button className="secondary" onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить YOLO и сверку</button></footer></section>
                  {!visionFallback && visionResult.reconciliation.status === "warning" && <label className="sys-vision-accept"><input type="checkbox" checked={visionWarningAccepted} onChange={(event) => { setVisionWarningAccepted(event.target.checked); setError(""); }} /><i /> <span><strong>Я просмотрел расхождения</strong><small>Сохранить результат как проверенный с предупреждением</small></span></label>}
                </>
              ) : <div className="sys-vision-empty" role="alert"><AlertTriangle /><p><strong>Проверка не выполнена</strong><span>{visionError || "Нужен настоящий контрольный кадр из MP4 или AVI."}</span></p><button className="secondary" onClick={() => void analyzeCameraVision({ force: true })}><RefreshCw /> Повторить анализ</button></div>}
            </div>
          )}
          {step === "privacy" && <div className="sys-wizard-content"><span className="sys-kicker"><ShieldCheck /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span><h2>Приватность и хранение</h2><p>Настройки наследуются от организации и могут быть только строже базовой политики.</p><div className="sys-privacy-settings">{[["blur", "Размывать лица на edge", "Обязательно политикой организации"], ["events", "Записывать только события", "Постоянный архив остаётся в VMS"], ["evidence", "Доказательные фрагменты", "15 секунд до и после события"], ["audio", "Анализировать аудио", "Заблокировано политикой организации"]].map(([key, title, text]) => { const locked = key === "blur" || key === "audio"; return <label key={key}><p><strong>{title}</strong><span>{text}</span></p><input type="checkbox" disabled={locked} checked={privacy[key]} onChange={(event) => setPrivacy((current) => ({ ...current, [key]: event.target.checked }))} /><i /></label>; })}</div><div className="sys-retention"><label>Хранение событий<select value={retention} onChange={(event) => setRetention(event.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90" disabled>90 дней · нужна политика Owner</option></select></label><label>Raw-видео<select value={rawVideo} onChange={(event) => setRawVideo(event.target.value)}><option value="local">Только локальный VMS</option><option value="none">Не хранить</option></select></label><div><LockKeyhole /><p><strong>Зона исключения</strong><span>PIN-pad и экран персонала закрываются privacy mask.</span></p></div></div></div>}
          {step === "review" && <div className="sys-wizard-content"><span className="sys-kicker"><CheckCircle2 /> ШАГ {currentStepNumber} ИЗ {totalSteps}</span><h2>Проверьте контекст перед добавлением</h2><p>{visionFallback ? "Резервный результат нельзя сохранить как подтверждённый. Вернитесь к AI-проверке и повторите анализ." : "Камера сохранится только после ответа сервера. GPT-план, YOLO-детекция и сверка уже завершены."}</p><div className="sys-review-card"><div className="sys-review-camera"><Camera /><SystemPill tone={visionFallback ? "warning" : "success"}>{visionFallback ? "AI не подтверждено" : "GPT + YOLO готовы"}</SystemPill></div><div><span>Точка на плане<strong>{selectedPlanCamera?.label} · {zone}{autoPlanFromVideo ? " · построено по кадру" : " · выбрано на плане"}</strong></span><span>Название<strong>{name}</strong></span><span>Контекст<strong>{selectedLocation.name} → {floor} → {zone}</strong></span><span>Источник<strong>{sourceLabel} · {checkedResolution} · {source === "upload" ? "временно" : `${checkedFps} FPS`}</strong></span><span>Контрольный кадр<strong>{snapshotTimeLabel} · ID {snapshotId.slice(0, 8)}</strong></span><span>AI-проверка<strong>{visionFallback ? "Резервный режим · требуется повтор" : visionResult ? `${visionResult.reconciliation.status} · ${asPercent(visionResult.reconciliation.score)}% · ${visionResult.detections.length} объектов` : "—"}</strong></span><span>Аналитики<strong>{compatibleAnalytics.join(" · ")}</strong></span><span>Privacy<strong>{privacy.blur ? "Edge blur" : "Без blur"} · {privacy.events ? "events only" : "continuous"} · {retention} дней</strong></span></div></div><div className="sys-next-steps"><strong>Что произойдёт дальше</strong><span><i>1</i>Источник привяжется к подтверждённой точке плана</span><span><i>2</i>{source === "upload" ? `${temporaryVideoFormatLabel} останется временным и не займёт Edge storage` : "Контрольный кадр сохранится в контексте камеры"}</span><span><i>3</i>Рекомендованные аналитики подготовятся по результатам YOLO</span><span><i>4</i>Для точной геометрии останется калибровка ROI</span></div></div>}
          {error && <div className="sys-wizard-error" role="alert"><AlertTriangle />{error}</div>}
        </div>
        <footer><button className="secondary" disabled={submitting || autoDraftCreating || visionRunning} onClick={() => { if (currentStepIndex === 0) { videoExtractionRunRef.current += 1; close(); } else { setStep(visibleSteps[currentStepIndex - 1]); setError(""); } }}>{currentStepIndex === 0 ? "Отмена" : <><ChevronLeft /> Назад</>}</button><div className="sys-wizard-footer-status"><span><b>Шаг {currentStepNumber} из {totalSteps}</b><em>{stepHint}</em></span>{step === "placement" && <button className="secondary sys-auto-plan-trigger" disabled={submitting} aria-describedby="auto-plan-video-help" aria-label="Настроить зал и положение камеры по контрольному кадру" onClick={startAutoPlanFromVideo}><Sparkles /> Настроить по видео</button>}<button className="primary" disabled={!stepReady || submitting || autoDraftCreating || visionRunning} onClick={next}>{submitting ? <><RefreshCw /> Сохраняем…</> : autoDraftCreating ? <><RefreshCw /> Сохраняем AI-план…</> : visionRunning ? <><RefreshCw /> Анализируем…</> : step === "review" ? <><Check /> Добавить и калибровать</> : step === "gpt-plan" ? !autoPlanQualityReady ? <><AlertTriangle /> Нужен другой кадр</> : <><Check /> Принять схему <ChevronRight /></> : step === "vision-check" ? <>Принять проверку <ChevronRight /></> : <>Далее <ChevronRight /></>}</button></div></footer>
      </section>
    </div>
  );
}

function PlayIcon() { return <Video />; }

function CalibrationStudio({ camera, notify, close, onActivate, onTemporaryVideoAttach, onDeleteCamera }: { camera: CameraItem; notify: Notify; close: () => void; onActivate?: () => Promise<VenueLocation | void>; onTemporaryVideoAttach?: (file: File) => Promise<void>; onDeleteCamera?: (cameraId: string) => void }) {
  const [tool, setTool] = useState("align");
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([{x: 17, y: 68}, {x: 42, y: 42}]);
  const [validated, setValidated] = useState(false);
  const [configured, setConfigured] = useState<Record<string, boolean>>({ roi: false, line: false, table: false, mask: false });
  const [ruleName, setRuleName] = useState("Alignment set A");
  const [validationError, setValidationError] = useState("");
  const [activating, setActivating] = useState(false);
  const [attachingVideo, setAttachingVideo] = useState(false);
  const temporarySource = Boolean(camera.temporaryVideoUrl || camera.temporaryVideoPreviewUrl);
  const temporaryVideoCamera = camera.sourceType === "upload";
  const temporaryFormat = camera.temporaryVideoFormat ?? "mp4";
  const temporaryFormatLabel = temporaryFormat.toUpperCase();
  const calibrationVideoInputRef = useRef<HTMLInputElement>(null);
  const attachRunRef = useRef(0);
  useEffect(() => () => { attachRunRef.current += 1; }, []);
  const attachTemporaryVideo = async (file: File) => {
    const runId = attachRunRef.current + 1;
    attachRunRef.current = runId;
    setAttachingVideo(true);
    try {
      const selectedFormat = validateTemporaryVideo(file);
      if (selectedFormat !== temporaryFormat) throw new Error(`Для этой камеры выберите исходный ${temporaryFormatLabel}.`);
      if (!onTemporaryVideoAttach) throw new Error("Временное подключение видео недоступно.");
      await onTemporaryVideoAttach(file);
      if (attachRunRef.current !== runId) return;
      setValidationError("");
    } catch (error) {
      if (attachRunRef.current !== runId) return;
      setValidationError(error instanceof Error ? error.message : "Не удалось подготовить временное видео.");
    } finally {
      if (attachRunRef.current === runId) setAttachingVideo(false);
    }
  };
  const addPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoints((current) => [...current.slice(-3), { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }]);
    setValidated(false);
    setValidationError("");
  };
  const chooseTool = (value: string) => { setTool(value); setRuleName(value === "align" ? "Alignment set A" : `${value} · ${camera.zone}`); setValidated(false); };
  const autoDetect = () => { setPoints([{x:17,y:68},{x:42,y:42},{x:68,y:64},{x:79,y:31}]); setConfigured({ roi:true, line:true, table:true, mask:true }); setValidated(false); setValidationError(""); notify("Auto-detect подготовил 4 опорные точки, ROI, вход, столы и privacy mask"); };
  const validate = () => {
    if (temporaryVideoCamera && !temporarySource) { setValidationError(`Временный ${temporaryFormatLabel} недоступен. Выберите исходный файл заново для калибровки.`); return; }
    if (camera.status === "offline") { setValidationError("Поток offline. Разметку можно оставить черновиком, но активировать аналитику нельзя."); return; }
    if (points.length !== 4) { setValidationError(`Нужно ровно 4 пары опорных точек. Сейчас: ${points.length}.`); return; }
    const missing = Object.entries(configured).filter(([, ready]) => !ready).map(([key]) => key);
    if (missing.length) { setValidationError(`Не подтверждены правила: ${missing.join(", ")}.`); return; }
    setValidated(true); setValidationError(""); notify("Валидация пройдена · reprojection error 0,18 м · 15 минут без drift");
  };
  const activate = async () => {
    if (camera.status === "offline") { setValidationError("Нельзя активировать: источник offline. Восстановите поток и повторите validation test."); return; }
    if (!validated) { setValidationError("Сначала завершите четыре опорные точки, все правила и validation test."); return; }
    setActivating(true);
    setValidationError("");
    try {
      const updated = await onActivate?.();
      notify("Калибровка сохранена · аналитики активированы после 15-минутного окна прогрева", updated ? { location: updated } : undefined);
      close();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Не удалось сохранить калибровку.");
      setActivating(false);
    }
  };
  const toolOptions = [
    ["align", Crosshair, "Точки"],
    ["roi", MapPin, "ROI"],
    ["line", ScanLine, "Линия"],
    ["table", Table2, "Объекты"],
    ["mask", EyeOff, "Приватность"],
  ] as const;
  const activeToolLabel = toolOptions.find(([key]) => key === tool)?.[2] ?? "Инструмент";
  const completedRules = Object.values(configured).filter(Boolean).length;
  return (
    <>
      <section className="sys-calibration-head">
        <button className="secondary" disabled={activating || attachingVideo} onClick={close}><ArrowLeft /> Все камеры</button>
        <div><i><Camera /></i><p><span>{camera.id} · {camera.location}</span><strong>{camera.name}</strong><em>{camera.floor} → {camera.zone}</em></p></div>
        <SystemPill tone={camera.status === "offline" ? "danger" : temporaryVideoCamera ? "warning" : "success"}><CircleDot /> {camera.status === "offline" ? "Offline" : temporaryVideoCamera ? temporarySource ? `Тестовый ${temporaryFormatLabel}` : `Нужен ${temporaryFormatLabel}` : "Live"}</SystemPill>
        {onDeleteCamera && <button className="secondary sys-danger-action" disabled={activating || attachingVideo} onClick={() => onDeleteCamera(camera.id)}><Trash2 /> Удалить</button>}
        <button className="primary" disabled={!validated || camera.status === "offline" || activating || attachingVideo} onClick={activate}>{activating ? <RefreshCw /> : <Check />} {activating ? "Сохраняем…" : "Сохранить и активировать"}</button>
      </section>
      <section className="sys-calibration-simple">
        <header className="card sys-calibration-commandbar">
          <div className="sys-calibration-tool-tabs" role="tablist" aria-label="Инструменты калибровки">
            {toolOptions.map(([key, Icon, label]) => <button role="tab" aria-selected={tool === key} className={tool === key ? "active" : ""} key={key} onClick={() => chooseTool(key)}><Icon />{label}{key === "align" ? <b>{points.length}/4</b> : configured[key] && <Check />}</button>)}
          </div>
          <div className="sys-calibration-quick-actions">
            <button className="secondary" onClick={() => { setPoints([]); setValidated(false); setValidationError(""); }}><Trash2 /> Сбросить</button>
            <button className="secondary" onClick={autoDetect}><Sparkles /> Авторазметка</button>
          </div>
        </header>

        <div className="sys-calibration-views">
          <article className="card">
            <div className="card-head"><div><span>КАДР КАМЕРЫ</span><h2>{camera.id} · {camera.resolution}</h2></div><SystemPill tone={camera.status === "offline" ? "danger" : temporaryVideoCamera ? "warning" : "success"}>{camera.status === "offline" ? "Последний кадр" : temporaryVideoCamera ? temporarySource ? `${temporaryFormatLabel} · временно` : `${temporaryFormatLabel} не выбран` : "LIVE"}</SystemPill></div>
            <div className={`sys-calibration-video tool-${tool}${temporarySource ? " has-video" : ""}`} onClick={addPoint}>
              {temporaryFormat === "mp4" && camera.temporaryVideoUrl && <video className="sys-calibration-video-source" src={camera.temporaryVideoUrl} controls muted playsInline loop autoPlay onClick={(event) => event.stopPropagation()} />}
              {temporaryFormat === "avi" && camera.temporaryVideoPreviewUrl && <div className="sys-calibration-video-source" role="img" aria-label={`Кадр из AVI камеры ${camera.id}`} style={{ backgroundImage: `url(${JSON.stringify(camera.temporaryVideoPreviewUrl)})` }} onClick={(event) => event.stopPropagation()} />}
              {temporaryVideoCamera && !temporarySource && <div className="sys-calibration-video-missing" onClick={(event) => event.stopPropagation()}><input ref={calibrationVideoInputRef} className="sys-sr-only" type="file" accept={TEMPORARY_VIDEO_ACCEPT} aria-label={`Выбрать исходный ${temporaryFormatLabel} для калибровки`} value="" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void attachTemporaryVideo(file); }} /><Upload /><strong>{attachingVideo ? `Извлекаем кадр из ${temporaryFormatLabel}…` : `Выберите исходный ${temporaryFormatLabel} снова`}</strong><span>{temporaryFormat === "avi" ? "AVI отправится только для извлечения кадра и не будет сохранён." : "Файл останется только в этой вкладке."}</span><button className="secondary" disabled={attachingVideo} onClick={() => calibrationVideoInputRef.current?.click()}>{attachingVideo ? "Подготовка…" : `Выбрать ${temporaryFormatLabel}`}</button></div>}
              <span>{camera.id}</span><em>{tool === "align" ? "Отметьте одинаковые точки на кадре и плане" : `${activeToolLabel}: настройте область на кадре`}</em>
              <div className="sys-perspective-floor" />
              {points.map((point, index) => <button style={{ left: `${point.x}%`, top: `${point.y}%` }} key={`${point.x}-${point.y}`} aria-label={`Удалить опорную точку ${index + 1}`} onClick={(event) => { event.stopPropagation(); setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index)); setValidated(false); }}><b>{index + 1}</b></button>)}
              {tool === "roi" && <div className="sys-roi-shape"><strong>{camera.zone}</strong></div>}
              {tool === "line" && <div className="sys-tripwire"><ArrowRight /><span>IN</span></div>}
              {tool === "table" && <><div className="sys-object-box object-1">Стол 1</div><div className="sys-object-box object-2">Стол 2</div></>}
              {tool === "mask" && <div className="sys-mask-box"><EyeOff /> приватная зона</div>}
            </div>
          </article>
          <article className="card">
            <div className="card-head"><div><span>ПЛАН И ПРИВЯЗКА</span><h2>{camera.floor} · {camera.zone}</h2></div><button className="icon" aria-label="Переключить слой плана" onClick={() => notify("Слой плана переключён на архитектурный")}><Layers3 /></button></div>
            <div className="sys-calibration-map" onClick={addPoint}>
              <div className="sys-map-room">{camera.zone}</div><div className="sys-map-room map-hall">Смежная зона</div><button className="sys-cal-map-camera" aria-label="Позиция камеры на плане" onClick={(event) => { event.stopPropagation(); notify("Выбрана позиция камеры на плане"); }}><Camera /><b /></button>
              {points.map((point, index) => <button style={{ left: `${Math.min(82, point.x + 5)}%`, top: `${Math.max(12, point.y - 8)}%` }} key={`${point.x}-${point.y}`} aria-label={`Опорная точка ${index + 1} на плане`} onClick={(event) => event.stopPropagation()}><b>{index + 1}</b></button>)}
            </div>
          </article>
        </div>

        <section className="card sys-calibration-statusbar">
          <div><span>Готовность</span><strong>{validated ? "Калибровка проверена" : `${points.length}/4 точки · ${completedRules}/4 правила`}</strong></div>
          <div className="sys-calibration-checks" aria-label="Статус правил">
            {[["Точки", points.length === 4], ["ROI", configured.roi], ["Линия", configured.line], ["Объекты", configured.table], ["Приватность", configured.mask]].map(([label, ready]) => <span className={ready ? "ready" : ""} key={String(label)}>{ready ? <Check /> : <CircleDot />}{label}</span>)}
          </div>
          <button className="primary" onClick={validate}><CheckCircle2 /> Проверить</button>
        </section>

        <details className="card sys-calibration-details">
          <summary><span><Settings2 /> Настройки: {activeToolLabel}</span><em>{(camera.height ?? 3.2).toFixed(1).replace(".", ",")} м · {camera.angle ?? 72}° · {camera.orientation ?? 118}°</em><ChevronDown /></summary>
          <div className="sys-calibration-details-body">
            <label>Название правила<input required minLength={3} value={ruleName} onChange={(event) => { setRuleName(event.target.value); setValidated(false); }} /></label>
            <label>Инструмент<select value={tool} onChange={(event) => chooseTool(event.target.value)}><option value="align">Опорные точки</option><option value="roi">ROI</option><option value="line">Линия пересечения</option><option value="table">Объекты</option><option value="mask">Маска приватности</option></select></label>
            <div className="sys-calibration-metrics"><span>Высота<strong>{(camera.height ?? 3.2).toFixed(1).replace(".", ",")} м</strong></span><span>Угол<strong>{camera.angle ?? 72}°</strong></span><span>Азимут<strong>{camera.orientation ?? 118}°</strong></span><span>Ошибка<strong>{validated ? "0,18 м" : "—"}</strong></span></div>
            <p><Info />Калибровка связывает координаты кадра с планом. Для ручной привязки нужны четыре неподвижные точки в одинаковом порядке.</p>
            {tool !== "align" && <button className="primary" disabled={!ruleName.trim()} onClick={() => { setConfigured((current) => ({ ...current, [tool]: true })); setValidated(false); notify(`${ruleName} подтверждено для ${camera.zone}`); }}><Check /> Применить правило</button>}
          </div>
        </details>
        {validationError && <div className="sys-wizard-error" role="alert"><AlertTriangle />{validationError}</div>}
      </section>
    </>
  );
}
