/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "./api-client";
import PlanCanvas, { type PlanElement } from "./plan-canvas";
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
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Cloud,
  Crosshair,
  DoorOpen,
  EyeOff,
  Gauge,
  HardDrive,
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
  backendFloors?: VenueFloorRecord[];
};

export type VenueFloorRecord = {
  id: string;
  level: number;
  name: string;
  canvas?: { width: number; height: number; gridSize: number };
  planImport?: { originalName?: string; generatedElements?: number };
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
  source: string;
  analytics: string[];
  status: "online" | "degraded" | "offline";
  calibrated: boolean;
  retentionDays?: number;
  rawVideo?: string;
  privacy?: Record<string, boolean>;
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

export const venueLocations: VenueLocation[] = [
  {
    id: "franko",
    name: "Franko, 12",
    city: "Івано-Франківськ",
    address: "вул. Івана Франка, 12",
    format: "Full service",
    timezone: "Europe/Kyiv · UTC+3",
    floors: 2,
    zones: 14,
    cameras: 5,
    online: 4,
    readiness: 92,
    capacity: 118,
    businessHours: "08:00–23:00",
    coordinates: { lat: 48.9226, lng: 24.7111 },
    status: "attention",
    demoSeeded: true,
    privacyConfigured: true,
    historyDays: 90,
    connectedSources: ["Poster POS", "OpenWeather", "Google Business", "Worksection", "BAS / 1C", "Telegram", "KDS", "CRM / Loyalty", "Inventory", "IoT / HACCP", "Delivery aggregators", "Telephony / Reservations"],
  },
  {
    id: "shevchenka",
    name: "Shevchenka, 8",
    city: "Львів",
    address: "просп. Шевченка, 8",
    format: "Coffee & bakery",
    timezone: "Europe/Kyiv · UTC+3",
    floors: 1,
    zones: 8,
    cameras: 4,
    online: 4,
    readiness: 100,
    capacity: 64,
    businessHours: "08:00–23:00",
    coordinates: { lat: 49.8397, lng: 24.0297 },
    status: "ready",
    demoSeeded: true,
    privacyConfigured: true,
    historyDays: 120,
    connectedSources: ["Poster POS", "OpenWeather", "Google Business", "Worksection", "BAS / 1C", "Telegram", "KDS", "CRM / Loyalty", "Inventory", "IoT / HACCP", "Delivery aggregators", "Telephony / Reservations"],
  },
  {
    id: "dniprovska",
    name: "Dniprovska, 21",
    city: "Київ",
    address: "наб. Дніпровська, 21",
    format: "Fast casual",
    timezone: "Europe/Kyiv · UTC+3",
    floors: 2,
    zones: 11,
    cameras: 7,
    online: 7,
    readiness: 98,
    capacity: 146,
    businessHours: "09:00–23:00",
    coordinates: { lat: 50.4501, lng: 30.5234 },
    status: "ready",
    demoSeeded: true,
    privacyConfigured: true,
    historyDays: 84,
    connectedSources: ["Poster POS", "OpenWeather", "Google Business", "Worksection", "BAS / 1C", "Telegram", "KDS", "CRM / Loyalty", "Inventory", "IoT / HACCP", "Delivery aggregators", "Telephony / Reservations"],
  },
  {
    id: "central",
    name: "Central Café",
    city: "Чернівці",
    address: "пл. Центральна, 4",
    format: "Coffee shop",
    timezone: "Europe/Kyiv · UTC+3",
    floors: 1,
    zones: 5,
    cameras: 2,
    online: 1,
    readiness: 61,
    capacity: 38,
    businessHours: "08:00–22:00",
    coordinates: { lat: 48.2915, lng: 25.9403 },
    status: "setup",
    demoSeeded: true,
    privacyConfigured: true,
    historyDays: 63,
    connectedSources: ["Poster POS", "OpenWeather", "Google Business", "Telegram", "KDS", "CRM / Loyalty", "IoT / HACCP", "Delivery aggregators", "Telephony / Reservations"],
  },
];

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
  const addFloorToSelected = async () => {
    const level = selected.floors + 1;
    try {
      const result = await apiFetch<{ floor: VenueFloorRecord; location: VenueLocation }>(`/locations/${encodeURIComponent(selected.id)}/floors`, {
        method: "POST",
        body: JSON.stringify({ level, name: `${level} этаж` }),
      });
      const updated = { ...selected, ...result.location, backendFloors: [...(selected.backendFloors ?? []), result.floor] };
      onLocationUpdate(updated); onLocationChange(updated); notify(`${level} этаж добавлен в ${selected.name} · загрузите PDF-план`, { location: updated }); go("floorplan");
    } catch (error) {
      notify(`Не удалось добавить этаж: ${error instanceof Error ? error.message : "ошибка API"}`);
    }
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
      </section>

      <section className="sys-location-detail">
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
              <button className="sys-add-floor" onClick={() => void addFloorToSelected()}>
                <Plus /> Добавить этаж
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
      </section>

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
  const [addZone, setAddZone] = useState(false);
  const [floor, setFloor] = useState("1");
  const [floorCount, setFloorCount] = useState(Math.max(1, location.floors));
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
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [planUploadError, setPlanUploadError] = useState("");
  const [floorRecords, setFloorRecords] = useState<VenueFloorRecord[]>(location.backendFloors ?? []);
  const planInputRef = useRef<HTMLInputElement>(null);
  const cameraPlacements: Array<[string, number, number, string]> = [
    ["CAM-01", 17, 48, "right"], ["CAM-02", 40, 21, "down"], ["CAM-03", 73, 23, "down"], ["CAM-04", 76, 62, "left"], ["CAM-05", 31, 77, "down"], ["CAM-06", 52, 68, "left"], ["CAM-07", 86, 72, "left"],
  ];
  const locationZones = useMemo(() => spatialZonesFor({ ...location, customZones }).map((item) => {
    const placedCameras = (location.configuredCameras ?? []).filter((camera) => camera.zone === item.name && camera.floor.startsWith(item.floor)).map((camera) => camera.id);
    const linked = [...item.cameras, ...placedCameras, ...(linkedOverrides[item.id] ?? [])].filter((camera, index, all) => all.indexOf(camera) === index && (location.configuredCameras?.some((item) => item.id === camera) || Number(camera.split("-")[1]) <= location.cameras));
    const hasOffline = linked.some((camera) => Number(camera.split("-")[1]) > location.online);
    return { ...item, cameras: linked, coverage: linked.length === 0 ? 0 : hasOffline ? Math.min(61, item.coverage) : location.status === "ready" ? Math.max(94, item.coverage) : item.coverage };
  }), [location, customZones, linkedOverrides]);
  const activeFloorRecord = floorRecords.find((item) => item.level === Number(floor));
  useEffect(() => {
    let active = true;
    apiFetch<{ floors: VenueFloorRecord[] }>(`/locations/${encodeURIComponent(location.id)}/floors`)
      .then(({ floors: savedFloors }) => {
        if (active) setFloorRecords(savedFloors);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [location.id]);
  useEffect(() => {
    if (!activeFloorRecord) return;
    let active = true;
    apiFetch<{ floor: VenueFloorRecord; zones: FloorZone[]; planElements: PlanElement[]; planPdfUrl?: string }>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan`)
      .then(({ floor: savedFloor, zones: savedZones, planElements: savedElements, planPdfUrl }) => {
        if (!active) return;
        setCustomZones((current) => [...current.filter((item) => item.floor !== floor), ...savedZones]);
        setPlanElements((current) => [...current.filter((item) => item.floor !== floor), ...savedElements]);
        if (savedFloor.planImport?.originalName) {
          setPlanFileNames((current) => ({ ...current, [floor]: savedFloor.planImport?.originalName ?? "floor-plan.pdf" }));
          if (planPdfUrl) setPlanPdfUrls((current) => ({ ...current, [floor]: planPdfUrl }));
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
        const updated = { ...location, ...result.location, backendFloors: floorRecords, customZones: nextCustomZones, planElements, planFileNames };
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
    const updated = { ...location, planElements: nextElements, planFileNames, planPdfUrls };
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
  const addFloor = async () => {
    const nextLevel = floorCount + 1;
    try {
      const result = await apiFetch<{ floor: VenueFloorRecord; location: VenueLocation }>(`/locations/${encodeURIComponent(location.id)}/floors`, {
        method: "POST",
        body: JSON.stringify({ level: nextLevel, name: `${nextLevel} этаж` }),
      });
      const nextFloors = [...floorRecords, result.floor];
      const updated = { ...location, ...result.location, backendFloors: nextFloors, customZones, planElements, planFileNames, planPdfUrls };
      setFloorRecords(nextFloors); setFloorCount(nextLevel); setFloor(String(nextLevel)); setSelected(""); onLocationUpdate(updated); notify(`${nextLevel} этаж добавлен · загрузите PDF-план`, { location: updated });
    } catch (error) {
      notify(`Не удалось добавить этаж: ${error instanceof Error ? error.message : "ошибка API"}`);
    }
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
      const result = await apiFetch<{ location: VenueLocation; floor: VenueFloorRecord; zones: FloorZone[]; planElements: PlanElement[]; planFileName: string; planPdfUrl?: string; importSummary: { generatedElements: number; generatedZones: number } }>(`/floors/${encodeURIComponent(activeFloorRecord.id)}/plan/import-pdf`, { method: "POST", body: formData });
      const nextElements = [...planElements.filter((item) => item.floor !== floor), ...result.planElements];
      const nextZones = [...customZones.filter((item) => item.floor !== floor), ...result.zones];
      const nextNames = { ...planFileNames, [floor]: result.planFileName };
      const nextPdfUrls = result.planPdfUrl ? { ...planPdfUrls, [floor]: result.planPdfUrl } : planPdfUrls;
      const nextPlans = planReady.includes(floor) ? planReady : [...planReady, floor];
      const nextFloorRecords = floorRecords.map((item) => item.id === result.floor.id ? result.floor : item);
      const updated = { ...location, ...result.location, backendFloors: nextFloorRecords, customZones: nextZones, planElements: nextElements, planFileNames: nextNames, planPdfUrls: nextPdfUrls, planFloors: nextPlans };
      setFloorRecords(nextFloorRecords); setPlanElements(nextElements); setCustomZones(nextZones); setPlanFileNames(nextNames); setPlanPdfUrls(nextPdfUrls); setPlanReady(nextPlans); setSelected(nextZones.find((item) => item.floor === floor)?.id ?? ""); onLocationUpdate(updated); notify(`${result.planFileName}: создано ${result.importSummary.generatedElements} объектов и ${result.importSummary.generatedZones} зон`, { location: updated });
    } catch (error) {
      setPlanUploadError(error instanceof Error ? error.message : "Не удалось обработать PDF");
    } finally {
      setUploadingPlan(false);
      if (planInputRef.current) planInputRef.current.value = "";
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
  return (
    <>
      <section className="sys-floor-toolbar">
        <div className="sys-segmented">
          {Array.from({ length: floorCount }).map((_, index) => {
            const value = String(index + 1);
            return <button className={floor === value ? "active" : ""} onClick={() => { setFloor(value); setSelected(value === "1" ? "hall" : customZones.find((item) => item.floor === value)?.id ?? ""); setEditingBounds(false); }} key={value}>{value} этаж</button>;
          })}
          <button onClick={() => void addFloor()}><Plus /> Этаж</button>
        </div>
        <div className="sys-layer-switcher">
          {[["plan", Layers3, "План"], ["coverage", Camera, "Покрытие"], ["traffic", Activity, "Трафик"]].map(([key, Icon, label]: any) => (
            <button className={layer === key ? "active" : ""} onClick={() => setLayer(key)} key={key}><Icon /> {label}</button>
          ))}
        </div>
        <div className="sys-floor-actions">
          <input
            ref={planInputRef}
            className="sys-hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Загрузить PDF-план этажа"
            value=""
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPlan(file);
            }}
          />
          {planPdfUrls[floor] && <a className="secondary" href={planPdfUrls[floor]} target="_blank" rel="noreferrer"><Layers3 /> Оригинал PDF</a>}
          <button className="secondary" disabled={uploadingPlan} onClick={() => planInputRef.current?.click()}><Upload /> {planReady.includes(floor) ? "Заменить PDF" : "Загрузить PDF"}</button>
          <button className="primary" onClick={() => planReady.includes(floor) ? setAddZone(true) : notify(`Нельзя создать зону: сначала загрузите план ${floor} этажа`)}><Plus /> Создать зону</button>
        </div>
      </section>

      <section className="sys-floor-layout">
        <article className="card sys-floor-canvas-card">
          <div className="card-head">
            <div><span>{location.name.toUpperCase()} · {floor} ЭТАЖ · {location.zones} ЗОН</span><h2>План, зоны и покрытие камер</h2></div>
            <div className="sys-canvas-legend"><span><i className="good" /> покрыто</span><span><i className="warn" /> проверить</span><span><i className="camera" /> камера</span></div>
          </div>
          {planReady.includes(floor) ? (
            <div className={`sys-floor-canvas has-editor layer-${layer}`}>
              <PlanCanvas
                floor={floor}
                elements={planElements}
                zones={visibleZones}
                selectedZoneId={selected}
                onSelectZone={setSelected}
                onElementsChange={setPlanElements}
                onCommit={commitPlanElements}
                planFileName={planFileNames[floor]}
              />
            </div>
          ) : (
            <div className="sys-floor-canvas">
              <div className="sys-grid-lines" />
              <div className="sys-empty-floor">
                <Layers3 />
                <h3>План {floor} этажа не загружен</h3>
                <p>Загрузите PDF — система прочитает подписи и автоматически расставит базовые стены, двери, столы и камеры.</p>
                <div className="sys-empty-floor-actions">
                  <button className="primary" disabled={uploadingPlan} onClick={() => planInputRef.current?.click()}><Upload /> {uploadingPlan ? "Анализируем…" : "Загрузить PDF"}</button>
                  <button className="secondary" onClick={() => { const nextPlans = [...planReady, floor]; const demoName = `demo-floor-${floor}.pdf`; const nextNames = { ...planFileNames, [floor]: demoName }; const updated = { ...location, planFloors: nextPlans, planElements, planFileNames: nextNames, readiness: Math.min(99, location.readiness + 12) }; setPlanReady(nextPlans); setPlanFileNames(nextNames); onLocationUpdate(updated); notify(`${demoName} загружен · можно добавлять и перемещать объекты`, { location: updated }); }}>Использовать demo-план</button>
                </div>
                {planUploadError && <div className="sys-form-error" role="alert"><AlertTriangle />{planUploadError}</div>}
              </div>
            </div>
          )}
          {planUploadError && planReady.includes(floor) && <div className="sys-plan-error" role="alert"><AlertTriangle />{planUploadError}</div>}
          <footer className="sys-canvas-footer">
            <span><MousePointer2 /> Выберите зону или камеру для настройки</span>
            <span>Масштаб 100% · сетка 0,5 м</span>
          </footer>
        </article>

        <aside className="sys-zone-panel">
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
        </aside>
      </section>

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
  resolution: string;
  fps: number;
  latency: string;
  health: number;
  status: "online" | "offline" | "degraded";
  analytics: string[];
};

type CameraSetup = {
  location: VenueLocation;
  name: string;
  floor: string;
  zone: string;
  source: string;
  analytics: string[];
  retention: string;
  height: number;
  angle: number;
  orientation: number;
  privacy: Record<string, boolean>;
  rawVideo: string;
};

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

export function CameraControl({ notify, location, locations, onLocationUpdate }: { notify: Notify; location: VenueLocation; locations: VenueLocation[]; onLocationUpdate: (location: VenueLocation) => void }) {
  const [wizard, setWizard] = useState(false);
  const [calibration, setCalibration] = useState<CameraItem | null>(null);
  const [selected, setSelected] = useState("all");
  const [display, setDisplay] = useState<"list" | "grid">("list");
  const configuredCameras = useMemo(() => location.configuredCameras ?? [], [location.configuredCameras]);
  const configuredOnline = configuredCameras.filter((camera) => camera.status !== "offline").length;
  const baselineCount = Math.max(0, location.cameras - configuredCameras.length);
  const baselineOnline = Math.max(0, location.online - configuredOnline);
  const cameras = useMemo(() => [
    ...camerasForLocation({ ...location, cameras: baselineCount, online: baselineOnline }),
    ...configuredCameras.map((camera): CameraItem => ({
      id: camera.id,
      name: camera.name,
      location: location.name,
      floor: camera.floor,
      zone: camera.zone,
      type: "Configured camera",
      source: camera.source,
      resolution: "1920×1080",
      fps: camera.status === "offline" ? 0 : 25,
      latency: camera.status === "offline" ? "—" : "196 мс",
      health: camera.calibrated ? 96 : camera.status === "offline" ? 28 : 82,
      status: camera.status,
      analytics: camera.analytics,
    })),
  ], [location, baselineCount, baselineOnline, configuredCameras]);
  const visible = useMemo(() => cameras.filter((camera) => selected === "all" || camera.status === selected), [cameras, selected]);
  const counts = {
    online: cameras.filter((camera) => camera.status === "online").length,
    degraded: cameras.filter((camera) => camera.status === "degraded").length,
    offline: cameras.filter((camera) => camera.status === "offline").length,
  };
  const streamsOnline = counts.online + counts.degraded;
  const averageHealth = Math.round(cameras.reduce((sum, camera) => sum + camera.health, 0) / Math.max(1, cameras.length));
  const problemCamera = cameras.find((camera) => camera.status === "offline") ?? cameras.find((camera) => camera.status === "degraded");
  const completeCamera = (draft: CameraSetup) => {
    setWizard(false);
    const nextId = `CAM-${String(cameras.length + 1).padStart(2, "0")}`;
    const created: CameraItem = { id: nextId, name: draft.name, location: draft.location.name, floor: draft.floor, zone: draft.zone, type: "Configured camera", source: draft.source, resolution: "1920×1080", fps: 25, latency: "196 мс", health: 82, status: "degraded", analytics: draft.analytics };
    const definition: VenueCameraDefinition = { id: nextId, name: draft.name, floor: draft.floor, zone: draft.zone, source: draft.source, analytics: draft.analytics, status: "degraded", calibrated: false, retentionDays: Number(draft.retention), rawVideo: draft.rawVideo, privacy: draft.privacy };
    const updated: VenueLocation = { ...location, configuredCameras: [...(location.configuredCameras ?? []), definition], cameras: location.cameras + 1, online: location.online + 1, readiness: Math.min(99, location.readiness + 10), privacyConfigured: draft.privacy.blur && !draft.privacy.audio, status: "attention" };
    onLocationUpdate(updated);
    notify(`${nextId} добавлена в ${draft.location.name} · источник online, аналитики ждут калибровку`, { location: updated });
    setCalibration(created);
  };
  if (calibration) return <CalibrationStudio camera={calibration} notify={notify} close={() => setCalibration(null)} onActivate={() => {
    if (!location.configuredCameras?.some((camera) => camera.id === calibration.id)) return;
    const nextCameras = location.configuredCameras.map((camera) => camera.id === calibration.id ? { ...camera, calibrated: true, status: "online" as const } : camera);
    const nextReadiness = Math.min(100, location.readiness + 15);
    const coreReady = ["Poster POS", "OpenWeather"].every((source) => location.connectedSources?.includes(source));
    const ready = location.zones > 0 && location.cameras > 0 && location.online === location.cameras && nextCameras.every((camera) => camera.calibrated) && coreReady && location.privacyConfigured && nextReadiness >= 80;
    const updated: VenueLocation = { ...location, configuredCameras: nextCameras, readiness: nextReadiness, status: ready ? "ready" : "attention" };
    onLocationUpdate(updated);
    return updated;
  }} />;
  return (
    <>
      <section className="sys-camera-summary">
        {[
          [Camera, "Камер", String(cameras.length), location.name, "blue"],
          [Wifi, "Online", String(streamsOnline), cameras.length ? `${Math.round((streamsOnline / cameras.length) * 100)}%` : "нет источников", "green"],
          [Gauge, "Средний health", String(averageHealth), location.status === "ready" ? "стабильно" : "нужна проверка", "violet"],
          [HardDrive, "Edge storage", location.id === "central" ? "42%" : "68%", location.id === "central" ? "620 GB свободно" : "4,2 TB свободно", "amber"],
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
          <p><strong>{problemCamera.id} · {problemCamera.name}: {problemCamera.status === "offline" ? "нет потока" : "нестабильный поток"}</strong><span>{location.name} · {problemCamera.floor} → {problemCamera.zone} · {problemCamera.status === "offline" ? "RTSP timeout" : "потери кадров 4,8%"}</span></p>
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
        <button className="primary" onClick={() => setWizard(true)}><Plus /> Добавить камеру</button>
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
            <div className={`sys-camera-thumb thumb-${index} ${camera.status}`}><Camera /><span>{camera.id}</span><i className={`sys-live-dot ${camera.status}`} />{camera.status !== "offline" && <b>LIVE</b>}</div>
            <p className="sys-camera-name"><strong>{camera.name}</strong><span>{camera.id} · {camera.type}</span></p>
            <p className="sys-camera-context"><strong>{camera.location}</strong><span>{camera.floor} → {camera.zone}</span></p>
            <p className="sys-camera-stream"><strong>{camera.resolution} · {camera.fps} FPS</strong><span>{camera.source} · {camera.latency}</span></p>
            <div className="sys-camera-analytics">{camera.analytics.slice(0, display === "grid" ? 3 : 2).map((item) => <span key={item}>{item}</span>)}{camera.analytics.length > 2 && display === "list" && <b>+{camera.analytics.length - 2}</b>}</div>
            <div className="sys-camera-health"><i><b style={{ width: `${camera.health}%` }} /></i><strong>{camera.health}</strong><span>{camera.status === "online" ? "Стабильно" : camera.status === "degraded" ? "Проверить" : "Нет сигнала"}</span></div>
            <button className="secondary" onClick={() => setCalibration(camera)}><Settings2 /> Настроить</button>
          </article>
        ))}
      </section>
      <article className="card sys-edge-appliance">
        <div className="sys-edge-icon"><Server /></div>
        <p><span>EDGE APPLIANCE · {location.name.toUpperCase()}</span><strong>VenueFlow Edge 01</strong><em>Jetson Orin NX · 16 GB · {cameras.length} потоков · models v2.8.4</em></p>
        <div><span>GPU<strong>46%</strong></span><span>Температура<strong>54°C</strong></span><span>Сеть<strong>86 Mbps</strong></span><span>Uptime<strong>18д 4ч</strong></span></div>
        <SystemPill tone={cameras.length ? "success" : "neutral"}>{cameras.length ? <><CheckCircle2 /> Healthy</> : <>Готов к подключению</>}</SystemPill>
        <button className="secondary" onClick={() => notify(cameras.length ? "Диагностика edge-устройства открыта" : "Edge готов · сначала добавьте видеопоток")}>Диагностика</button>
      </article>
      {wizard && <CameraWizard location={location} locations={locations} notify={notify} close={() => setWizard(false)} complete={completeCamera} />}
    </>
  );
}

function zoneOptionsFor(location: VenueLocation, floorLabel: string) {
  const floorNumber = floorLabel.split(" ")[0];
  return [...new Set(spatialZonesFor(location).filter((item) => item.floor === floorNumber).map((item) => item.name))];
}

function CameraWizard({ location, locations, notify, close, complete }: { location: VenueLocation; locations: VenueLocation[]; notify: Notify; close: () => void; complete: (setup: CameraSetup) => void }) {
  const [step, setStep] = useState(0);
  const [locationId] = useState(location.id);
  const firstSpatialZone = location.customZones?.[0];
  const initialFloor = `${firstSpatialZone?.floor ?? "1"} этаж · ${firstSpatialZone?.floor === "2" ? "Lounge" : "Основной"}`;
  const initialZone = zoneOptionsFor(location, initialFloor)[0] ?? "";
  const [floor, setFloor] = useState(initialFloor);
  const [zone, setZone] = useState(initialZone);
  const [name, setName] = useState(initialZone ? `${initialZone} · обзор` : "");
  const [source, setSource] = useState("onvif");
  const [device, setDeviceState] = useState<number | null>(null);
  const [rtsp, setRtspState] = useState({ url: "rtsp://192.168.1.42:554/stream1", login: "venueflow", password: "demopassword" });
  const [vendor, setVendorState] = useState({ provider: "Verkada", site: location.name, camera: initialZone || "Camera 01" });
  const [uploaded, setUploadedState] = useState(false);
  const [tested, setTested] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [height, setHeight] = useState(3.2);
  const [angle, setAngle] = useState(72);
  const [orientation, setOrientation] = useState(118);
  const [analytics, setAnalytics] = useState(["People count", "Occupancy", "Dwell time"]);
  const [privacy, setPrivacy] = useState<Record<string, boolean>>({ blur: true, events: true, evidence: true, audio: false });
  const [retention, setRetention] = useState("30");
  const [rawVideo, setRawVideo] = useState("local");
  const [error, setError] = useState("");
  const setDevice = (value: number | null) => { setDeviceState(value); setTested(false); };
  const setRtsp = (value: React.SetStateAction<typeof rtsp>) => { setRtspState(value); setTested(false); };
  const setVendor = (value: React.SetStateAction<typeof vendor>) => { setVendorState(value); setTested(false); };
  const setUploaded = (value: boolean) => { setUploadedState(value); setTested(false); };
  const selectedLocation = locations.find((item) => item.id === locationId) ?? location;
  const titles = ["Контекст", "Источник", "Проверка потока", "Размещение", "Аналитики", "Приватность", "Проверка"];
  const zones = zoneOptionsFor(selectedLocation, floor);
  const selectedZoneDefinition = spatialZonesFor(selectedLocation).find((item) => item.name === zone && floor.startsWith(item.floor));
  const isKitchenZone = /кух|kitchen|back of house/i.test(`${zone} ${selectedZoneDefinition?.type ?? ""}`);
  const sourceReady = source === "onvif" ? device !== null : source === "rtsp" ? /^rtsps?:\/\//i.test(rtsp.url) && Boolean(rtsp.login && rtsp.password) : source === "vendor" ? Boolean(vendor.provider && vendor.site && vendor.camera) : uploaded;
  const sourceLabel = source === "onvif" ? `ONVIF · ${device === null ? "устройство не выбрано" : ["Hikvision DS-2CD", "Dahua IPC-HDW", "Axis M3085"][device]}` : source === "rtsp" ? "RTSP URL" : source === "vendor" ? `${vendor.provider} Cloud VMS` : "MP4 pilot";
  const toggleAnalytic = (item: string) => setAnalytics((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  const chooseSource = (value: string) => { setSource(value); setTested(false); setError(""); };
  const next = () => {
    setError("");
    if (step === 0 && (selectedLocation.zones < 1 || zones.length === 0)) { setError("На выбранном этаже нет сохранённой зоны. Сначала завершите план этажа и создайте зону."); return; }
    if (step === 0 && (!name.trim() || !floor || !zone)) { setError("Выберите этаж и зону, затем укажите название камеры."); return; }
    if (step === 1 && !sourceReady) { setError(source === "onvif" ? "Выберите найденное ONVIF-устройство." : source === "upload" ? "Выберите demo-видео для пилота." : "Заполните обязательные параметры источника."); return; }
    if (step === 2 && !tested) { setError("Сначала запустите тест потока и дождитесь результата."); return; }
    if (step === 3 && !placed) { setError("Подтвердите положение камеры на плане и параметры монтажа."); return; }
    if (step === 4) {
      const compatibleAnalytics = analytics.filter((item) => isKitchenZone ? !["Table service", "Queue"].includes(item) : item !== "SOP compliance");
      if (compatibleAnalytics.length === 0) { setError("Выберите хотя бы одну совместимую аналитику."); return; }
      if (compatibleAnalytics.length !== analytics.length) setAnalytics(compatibleAnalytics);
    }
    if (step < titles.length - 1) { setStep((value) => value + 1); return; }
    complete({ location: selectedLocation, name: name.trim(), floor, zone, source: sourceLabel, analytics, retention, height, angle, orientation, privacy, rawVideo });
  };
  return (
    <div className="sys-wizard-backdrop">
      <section className="sys-wizard" role="dialog" aria-modal="true" aria-labelledby="camera-wizard-title">
        <header><div><i><Camera /></i><p><span>МАСТЕР ПОДКЛЮЧЕНИЯ</span><strong id="camera-wizard-title">Новая камера</strong></p></div><button onClick={close} aria-label="Закрыть мастер камеры"><X /></button></header>
        <div className="sys-wizard-progress">{titles.map((title, index) => <button className={index === step ? "active" : index < step ? "done" : ""} disabled={index > step} key={title} onClick={() => { if (index < step) { setStep(index); setError(""); } }}><i>{index < step ? <Check /> : index + 1}</i><span>{title}</span></button>)}</div>
        <main>
          {step === 0 && <div className="sys-wizard-content"><span className="sys-kicker"><MapPin /> ШАГ 1 ИЗ 7</span><h2>Где находится камера?</h2><p>Контекст обязателен: без локации, этажа и зоны события нельзя корректно положить в метрики.</p><div className="sys-form-grid"><label>Организация<select value="Oxios Food Group" disabled><option>Oxios Food Group</option></select></label><label>Активная локация<select value={locationId} disabled>{locations.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.city}</option>)}</select><small>Чтобы добавить камеру в другое заведение, сначала переключите активную локацию.</small></label><label>Этаж *<select required value={floor} onChange={(event) => { const value = event.target.value; const nextZone = zoneOptionsFor(selectedLocation, value)[0] ?? ""; setFloor(value); setZone(nextZone); setName(nextZone ? `${nextZone} · обзор` : ""); }}>{Array.from({ length: Math.max(1, selectedLocation.floors) }).map((_, index) => <option key={index}>{index + 1} этаж · {index === 0 ? "Основной" : "Lounge"}</option>)}</select></label><label>Зона *<select required value={zone} onChange={(event) => { setZone(event.target.value); setName(`${event.target.value} · обзор`); }}>{zones.length === 0 ? <option value="">Нет сохранённых зон</option> : zones.map((item) => <option key={item}>{item}</option>)}</select><small>{zones.length === 0 ? "Вернитесь в «Планы и зоны» и создайте зону на этом этаже." : `${zones.length} зон доступно на выбранном этаже.`}</small></label><label className="wide">Название камеры *<input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} /></label></div><div className="sys-context-preview"><Building2 /><span>Oxios Food</span><ChevronRight /><Store /><span>{selectedLocation.name}</span><ChevronRight /><Layers3 /><span>{floor}</span><ChevronRight /><MapPin /><strong>{zone || "Зона не выбрана"}</strong></div><div className="sys-guidance"><Crosshair /> {selectedLocation.address} · {selectedLocation.coordinates.lat.toFixed(4)}, {selectedLocation.coordinates.lng.toFixed(4)} · {selectedLocation.timezone}</div>{(selectedLocation.zones < 1 || zones.length === 0) && <div className="sys-form-error"><AlertTriangle />План выбранного этажа пока не содержит зон — продолжение заблокировано.</div>}</div>}
          {step === 1 && <div className="sys-wizard-content"><span className="sys-kicker"><Cable /> ШАГ 2 ИЗ 7</span><h2>Как получить видеопоток?</h2><p>Выберите один источник и заполните данные, необходимые именно для этого способа подключения.</p><div className="sys-source-options">{[["onvif", Router, "Найти по ONVIF", "Автопоиск в локальной сети"], ["rtsp", Cable, "RTSP URL", "Подключение по адресу потока"], ["vendor", Cloud, "Cloud VMS", "Verkada, Rhombus, Meraki"], ["upload", Upload, "Видео для пилота", "MP4 до подключения live"]].map(([key, Icon, title, text]: any) => <button className={source === key ? "active" : ""} key={key} onClick={() => chooseSource(key)}><i><Icon /></i><strong>{title}</strong><span>{text}</span>{source === key && <CheckCircle2 />}</button>)}</div>{source === "onvif" && <div className="sys-discovery"><div><RefreshCw /><p><strong>Найдено 3 устройства</strong><span>Сканирование подсети 192.168.1.0/24 завершено</span></p></div>{[["Hikvision DS-2CD", "192.168.1.42"], ["Dahua IPC-HDW", "192.168.1.51"], ["Axis M3085", "192.168.1.63"]].map((item, index) => <button className={device === index ? "active" : ""} key={item[1]} onClick={() => setDevice(index)}><Camera /><p><strong>{item[0]}</strong><span>{item[1]} · ONVIF S</span></p><SystemPill tone={device === index ? "success" : "neutral"}>{device === index ? "Выбрано" : "Выбрать"}</SystemPill></button>)}</div>}{source === "rtsp" && <div className="sys-form-grid"><label className="wide">RTSP URL *<input required value={rtsp.url} onChange={(event) => setRtsp((current) => ({ ...current, url: event.target.value }))} /></label><label>Логин *<input required value={rtsp.login} onChange={(event) => setRtsp((current) => ({ ...current, login: event.target.value }))} /></label><label>Пароль *<input required type="password" value={rtsp.password} onChange={(event) => setRtsp((current) => ({ ...current, password: event.target.value }))} /></label></div>}{source === "vendor" && <div className="sys-form-grid"><label>Провайдер *<select value={vendor.provider} onChange={(event) => setVendor((current) => ({ ...current, provider: event.target.value }))}><option>Verkada</option><option>Rhombus</option><option>Meraki</option></select></label><label>Site / organization *<input required value={vendor.site} onChange={(event) => setVendor((current) => ({ ...current, site: event.target.value }))} /></label><label className="wide">Camera ID / name *<input required value={vendor.camera} onChange={(event) => setVendor((current) => ({ ...current, camera: event.target.value }))} /></label></div>}{source === "upload" && <button className={`sys-upload-zone ${uploaded ? "selected" : ""}`} onClick={() => { setUploaded(true); notify("Выбран demo-camera.mp4 · 2:14 · 1080p"); }}><Upload /><strong>{uploaded ? "demo-camera.mp4 выбран" : "Использовать demo-camera.mp4"}</strong><span>2:14 · 1080p · без персональных данных</span>{uploaded && <CheckCircle2 />}</button>}</div>}
          {step === 2 && <div className="sys-wizard-content"><span className="sys-kicker"><Video /> ШАГ 3 ИЗ 7</span><h2>Проверьте качество потока</h2><p>Тест проверяет соединение, FPS, задержку, освещение и минимальную плотность пикселей.</p><div className="sys-stream-test"><div className={`sys-stream-preview ${tested ? "tested" : ""}`}><span>CAM NEW · 21:24:08</span><i><Video /></i>{tested && <><div className="sys-person-box person-a"><small>person · 97%</small></div><div className="sys-person-box person-b"><small>person · 95%</small></div></>}<button onClick={() => { setTested(true); notify("Поток стабилен · 1920×1080 · 25 FPS · latency 196 мс"); }}>{tested ? <CheckCircle2 /> : <PlayIcon />} {tested ? "Проверено" : "Запустить тест"}</button></div><aside>{[["Соединение", tested ? "Стабильно" : "Ожидает", tested], ["Разрешение", tested ? "1920×1080" : "—", tested], ["FPS", tested ? "25" : "—", tested], ["Битрейт", tested ? "4.8 Mbps" : "—", tested], ["Задержка", tested ? "196 мс" : "—", tested], ["Освещение", tested ? "Хорошее" : "—", tested]].map(([label, value, ok]: any) => <div key={label}><span>{label}</span><strong>{value}</strong>{ok && <Check />}</div>)}</aside></div>{tested && <div className="sys-test-result"><CheckCircle2 /><p><strong>Поток пригоден для people analytics</strong><span>Для face recognition не используется. Тест действителен 15 минут.</span></p><SystemPill tone="success">Score 94/100</SystemPill></div>}</div>}
          {step === 3 && <div className="sys-wizard-content"><span className="sys-kicker"><Map /> ШАГ 4 ИЗ 7</span><h2>Разместите камеру на плане</h2><p>Положение и направление нужны для heatmap, объединения треков и понимания соседних зон.</p><div className="sys-placement"><div className={`sys-mini-plan ${placed ? "confirmed" : ""}`}><div className="sys-mini-room">{zone}</div><button className="sys-placement-camera" aria-label="Подтвердить позицию камеры на плане" onClick={() => { setPlaced(true); notify(`Позиция камеры подтверждена · ${floor} → ${zone}`); }}><Camera /><b /></button><span>{placed ? "Позиция подтверждена" : "Нажмите камеру, чтобы подтвердить позицию"}</span></div><aside><label>Высота установки<div><input aria-label="Высота установки камеры" type="range" min="2" max="6" step="0.1" value={height} onChange={(event) => { setHeight(Number(event.target.value)); setPlaced(true); }} /><strong>{height.toFixed(1).replace(".", ",")} м</strong></div></label><label>Угол к горизонту<div><input aria-label="Угол камеры к горизонту" type="range" min="20" max="90" value={angle} onChange={(event) => { setAngle(Number(event.target.value)); setPlaced(true); }} /><strong>{angle}°</strong></div></label><label>Ориентация<div><input aria-label="Ориентация камеры" type="range" min="0" max="360" value={orientation} onChange={(event) => { setOrientation(Number(event.target.value)); setPlaced(true); }} /><strong>{orientation}°</strong></div></label><div className="sys-guidance"><Info /> Для heatmap рекомендуется угол ≥70° и видимый участок пола без сильных перекрытий.</div></aside></div></div>}
          {step === 4 && <div className="sys-wizard-content"><span className="sys-kicker"><Sparkles /> ШАГ 5 ИЗ 7</span><h2>Что камера должна понимать?</h2><p>Совместимость зависит от типа зоны «{selectedZoneDefinition?.type ?? "не указан"}», угла и результата проверки потока.</p><div className="sys-analytics-picker">{[[Users, "People count", "Вход/выход и уникальные треки", "recommended"], [Activity, "Occupancy", "Заполненность зоны", "recommended"], [Clock3, "Dwell time", "Время пребывания", "recommended"], [Table2, "Table service", "Посадка и этапы сервиса", isKitchenZone ? "incompatible" : ""], [ScanLine, "Queue", "Длина и скорость очереди", isKitchenZone ? "incompatible" : ""], [ShieldCheck, "Safety events", "Падения и опасные зоны", ""], [Utensils, "SOP compliance", "Стандарты кухни", isKitchenZone ? "recommended" : "incompatible"], [EyeOff, "Privacy mask", "Постоянная маска приватных зон", "recommended"]].map(([Icon, title, text, flag]: any) => { const active = analytics.includes(title); const incompatible = flag === "incompatible"; return <button disabled={incompatible} aria-disabled={incompatible} className={`${active ? "active" : ""} ${flag}`} onClick={() => toggleAnalytic(title)} key={title}><i><Icon /></i><p><strong>{title}</strong><span>{text}</span>{incompatible && <em>Недоступно для зоны «{zone}»</em>}</p><span className="sys-check">{active && <Check />}</span></button>; })}</div><div className="sys-compute"><Server /><p><strong>Расчётная нагрузка</strong><span>{analytics.length} аналитики · {(0.7 + analytics.length * .35).toFixed(1)} TOPS · ~6 Mbps metadata</span></p><SystemPill tone="success">Edge 01 · достаточно</SystemPill></div></div>}
          {step === 5 && <div className="sys-wizard-content"><span className="sys-kicker"><ShieldCheck /> ШАГ 6 ИЗ 7</span><h2>Приватность и хранение</h2><p>Настройки наследуются от организации и могут быть только строже базовой политики.</p><div className="sys-privacy-settings">{[["blur", "Размывать лица на edge", "Обязательно политикой организации"], ["events", "Записывать только события", "Постоянный архив остаётся в VMS"], ["evidence", "Доказательные фрагменты", "15 секунд до и после события"], ["audio", "Анализировать аудио", "Заблокировано политикой организации"]].map(([key, title, text]) => { const locked = key === "blur" || key === "audio"; return <label key={key}><p><strong>{title}</strong><span>{text}</span></p><input type="checkbox" disabled={locked} checked={privacy[key]} onChange={(event) => setPrivacy((current) => ({ ...current, [key]: event.target.checked }))} /><i /></label>; })}</div><div className="sys-retention"><label>Хранение событий<select value={retention} onChange={(event) => setRetention(event.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90" disabled>90 дней · нужна политика Owner</option></select></label><label>Raw-видео<select value={rawVideo} onChange={(event) => setRawVideo(event.target.value)}><option value="local">Только локальный VMS</option><option value="none">Не хранить</option></select></label><div><LockKeyhole /><p><strong>Зона исключения</strong><span>PIN-pad и экран персонала закрываются privacy mask.</span></p></div></div></div>}
          {step === 6 && <div className="sys-wizard-content"><span className="sys-kicker"><CheckCircle2 /> ШАГ 7 ИЗ 7</span><h2>Проверьте контекст перед добавлением</h2><p>После создания источник будет online, но бизнес-аналитики включатся только после калибровки.</p><div className="sys-review-card"><div className="sys-review-camera"><Camera /><SystemPill tone="success">Поток проверен</SystemPill></div><div><span>Камера<strong>{name}</strong></span><span>Контекст<strong>{selectedLocation.name} → {floor} → {zone}</strong></span><span>Источник<strong>{sourceLabel} · 1920×1080 · 25 FPS</strong></span><span>Монтаж<strong>{height.toFixed(1)} м · {angle}° · азимут {orientation}°</strong></span><span>Аналитики<strong>{analytics.join(" · ")}</strong></span><span>Privacy<strong>{privacy.blur ? "Edge blur" : "Без blur"} · {privacy.events ? "events only" : "continuous"} · {retention} дней</strong></span></div></div><div className="sys-next-steps"><strong>Что произойдёт дальше</strong><span><i>1</i>Источник появится в fleet и на плане</span><span><i>2</i>Вы разметите ROI, линии и объекты</span><span><i>3</i>VenueFlow проведёт validation test</span><span><i>4</i>Только после подтверждения события попадут в метрики</span></div></div>}
          {error && <div className="sys-wizard-error" role="alert"><AlertTriangle />{error}</div>}
        </main>
        <footer><button className="secondary" onClick={() => step === 0 ? close() : (setStep((value) => value - 1), setError(""))}>{step === 0 ? "Отмена" : <><ChevronLeft /> Назад</>}</button><div><span>Шаг {step + 1} из {titles.length}</span><button className="primary" onClick={next}>{step === titles.length - 1 ? <><Check /> Добавить и калибровать</> : <>Далее <ChevronRight /></>}</button></div></footer>
      </section>
    </div>
  );
}

function PlayIcon() { return <Video />; }

function CalibrationStudio({ camera, notify, close, onActivate }: { camera: CameraItem; notify: Notify; close: () => void; onActivate?: () => VenueLocation | void }) {
  const [stage, setStage] = useState(1);
  const [tool, setTool] = useState("align");
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([{x: 17, y: 68}, {x: 42, y: 42}]);
  const [validated, setValidated] = useState(false);
  const [configured, setConfigured] = useState<Record<string, boolean>>({ roi: false, line: false, table: false, mask: false });
  const [ruleName, setRuleName] = useState("Alignment set A");
  const [validationError, setValidationError] = useState("");
  const addPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoints((current) => [...current.slice(-3), { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }]);
    setValidated(false);
    setValidationError("");
  };
  const chooseTool = (value: string) => { setTool(value); setRuleName(value === "align" ? "Alignment set A" : `${value} · ${camera.zone}`); setValidated(false); };
  const autoDetect = () => { setPoints([{x:17,y:68},{x:42,y:42},{x:68,y:64},{x:79,y:31}]); setConfigured({ roi:true, line:true, table:true, mask:true }); setValidated(false); setValidationError(""); notify("Auto-detect подготовил 4 опорные точки, ROI, вход, столы и privacy mask"); };
  const validate = () => {
    if (camera.status === "offline") { setValidationError("Поток offline. Разметку можно оставить черновиком, но активировать аналитику нельзя."); return; }
    if (points.length !== 4) { setValidationError(`Нужно ровно 4 пары опорных точек. Сейчас: ${points.length}.`); return; }
    const missing = Object.entries(configured).filter(([, ready]) => !ready).map(([key]) => key);
    if (missing.length) { setValidationError(`Не подтверждены правила: ${missing.join(", ")}.`); return; }
    setValidated(true); setStage(6); setValidationError(""); notify("Валидация пройдена · reprojection error 0,18 м · 15 минут без drift");
  };
  return (
    <>
      <section className="sys-calibration-head">
        <button className="secondary" onClick={close}><ArrowLeft /> Все камеры</button>
        <div><i><Camera /></i><p><span>{camera.id} · {camera.location}</span><strong>{camera.name}</strong><em>{camera.floor} → {camera.zone}</em></p></div>
        <SystemPill tone={camera.status === "offline" ? "danger" : "success"}><CircleDot /> {camera.status === "offline" ? "Offline" : "Live"}</SystemPill>
        <button className="primary" aria-disabled={!validated || camera.status === "offline"} onClick={() => { if (camera.status === "offline") { setValidationError("Нельзя активировать: источник offline. Восстановите поток и повторите validation test."); return; } if (!validated) { setValidationError("Сначала завершите четыре опорные точки, все правила и validation test."); return; } const updated = onActivate?.(); notify("Калибровка сохранена · аналитики активированы после 15-минутного окна прогрева", updated ? { location: updated } : undefined); close(); }}><Check /> Сохранить и активировать</button>
      </section>
      <section className="sys-calibration-layout">
        <aside className="card sys-calibration-steps">
          <div><span>CALIBRATION STUDIO</span><strong>Настройка пространства</strong></div>
          {[[1, Video, "Поток", "Качество и ориентация"], [2, Crosshair, "Camera ↔ floor", "4 опорные точки"], [3, ScanLine, "ROI и линии", "Зоны и направления"], [4, Table2, "Объекты", "Столы, кассы, pass"], [5, ShieldCheck, "Privacy masks", "Исключить приватные зоны"], [6, CheckCircle2, "Валидация", "Тест 15 минут"]].map(([number, Icon, title, text]: any) => <button className={stage === number ? "active" : stage > number ? "done" : ""} key={number} onClick={() => setStage(number)}><i>{stage > number ? <Check /> : <Icon />}</i><p><strong>{title}</strong><span>{text}</span></p><ChevronRight /></button>)}
          <div className="sys-calibration-score"><Gauge /><p><span>Calibration score</span><strong>{validated ? "96/100" : "78/100"}</strong><em>{validated ? "Готово к запуску" : "Требуется проверка"}</em></p></div>
        </aside>
        <main className="sys-calibration-workspace">
          <div className="sys-calibration-tools">
            <div>{[["align", Crosshair, "Опорные точки"], ["roi", MapPin, "ROI"], ["line", ScanLine, "Tripwire"], ["table", Table2, "Объект"], ["mask", EyeOff, "Privacy mask"]].map(([key, Icon, label]: any) => <button className={tool === key ? "active" : ""} key={key} onClick={() => chooseTool(key)}><Icon /> {label}{key !== "align" && configured[key] && <Check />}</button>)}</div>
            <div><button className="secondary" onClick={() => { setPoints([]); setValidated(false); setValidationError(""); }}><Trash2 /> Очистить</button><button className="secondary" onClick={autoDetect}><Sparkles /> Auto-detect</button></div>
          </div>
          <div className="sys-calibration-views">
            <article className="card">
              <div className="card-head"><div><span>ВИД С КАМЕРЫ</span><h2>{camera.id} · {camera.resolution}</h2></div><SystemPill tone={camera.status === "offline" ? "danger" : "success"}>{camera.status === "offline" ? "Последний кадр" : "LIVE"}</SystemPill></div>
              <div className={`sys-calibration-video tool-${tool}`} onClick={addPoint}>
                <span>{camera.id} · 21:26:42</span><em>Нажмите на одинаковые точки в видео и на плане</em>
                <div className="sys-perspective-floor" />
                {points.map((point, index) => <button style={{ left: `${point.x}%`, top: `${point.y}%` }} key={`${point.x}-${point.y}`} aria-label={`Удалить опорную точку ${index + 1}`} onClick={(event) => { event.stopPropagation(); setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index)); setValidated(false); }}><b>{index + 1}</b></button>)}
                {tool === "roi" && <div className="sys-roi-shape"><strong>{camera.zone}</strong></div>}
                {tool === "line" && <div className="sys-tripwire"><ArrowRight /><span>IN</span></div>}
                {tool === "table" && <><div className="sys-object-box object-1">Стол 1</div><div className="sys-object-box object-2">Стол 2</div></>}
                {tool === "mask" && <div className="sys-mask-box"><EyeOff /> приватная зона</div>}
              </div>
            </article>
            <article className="card">
              <div className="card-head"><div><span>ПЛАН ЭТАЖА</span><h2>{camera.floor} · {camera.zone}</h2></div><button className="icon" aria-label="Переключить слой плана" onClick={() => notify("Слой плана переключён на архитектурный")}><Layers3 /></button></div>
              <div className="sys-calibration-map" onClick={addPoint}>
                <div className="sys-map-room">{camera.zone}</div><div className="sys-map-room map-hall">Смежная зона</div><button className="sys-cal-map-camera" aria-label="Позиция камеры на плане" onClick={(event) => { event.stopPropagation(); notify("Выбрана позиция камеры на плане"); }}><Camera /><b /></button>
                {points.map((point, index) => <button style={{ left: `${Math.min(82, point.x + 5)}%`, top: `${Math.max(12, point.y - 8)}%` }} key={`${point.x}-${point.y}`} aria-label={`Опорная точка ${index + 1} на плане`} onClick={(event) => event.stopPropagation()}><b>{index + 1}</b></button>)}
              </div>
            </article>
          </div>
          <section className="card sys-calibration-bottom">
            <div><span>АКТИВНЫЕ ПРАВИЛА</span><strong>{points.length}/4 опорные точки</strong></div>
            {[[`ROI · ${camera.zone}`, configured.roi], ["Tripwire · Вход/выход", configured.line], ["Objects · столы/кассы", configured.table], ["Privacy · POS screen", configured.mask]].map(([item, ready]: any) => <span key={item}><i className={ready ? "ok" : "warn"}>{ready ? <Check /> : <AlertTriangle />}</i>{item}</span>)}
            <button className="primary" onClick={validate}><CheckCircle2 /> Проверить калибровку</button>
          </section>
          {validationError && <div className="sys-wizard-error" role="alert"><AlertTriangle />{validationError}</div>}
        </main>
        <aside className="card sys-inspector">
          <div className="card-head"><div><span>ИНСПЕКТОР</span><h2>{tool === "align" ? "Camera ↔ floor" : tool.toUpperCase()}</h2></div></div>
          <label>Название *<input required minLength={3} value={ruleName} onChange={(event) => { setRuleName(event.target.value); setValidated(false); }} /></label>
          <label>Тип *<select value={tool} onChange={(event) => chooseTool(event.target.value)}><option value="align">Reference points</option><option value="roi">Region of interest</option><option value="line">Directional tripwire</option><option value="table">Tracked object</option><option value="mask">Privacy mask</option></select></label>
          <div className="sys-inspector-grid"><span>Высота камеры<strong>3,2 м</strong></span><span>Угол<strong>72°</strong></span><span>Focal length<strong>2,8 mm</strong></span><span>Ошибка<strong>{validated ? "0,18 м" : "—"}</strong></span></div>
          <h3>Требования</h3>
          {["Минимум 4 точки на полу", "Одинаковый порядок точек", "Не использовать движимые объекты", "Проверить проекцию ROI"].map((item, index) => <p className="sys-requirement" key={item}><i className={points.length > index ? "done" : ""}>{points.length > index && <Check />}</i>{item}</p>)}
          <div className="sys-inspector-tip"><Info /><p><strong>Почему это нужно</strong><span>Калибровка переводит пиксели кадра в координаты плана и позволяет объединять события нескольких камер.</span></p></div>
          {tool !== "align" && <button className="primary full" disabled={!ruleName.trim()} onClick={() => { setConfigured((current) => ({ ...current, [tool]: true })); setValidated(false); notify(`${ruleName} подтверждено для ${camera.zone}`); }}><Check /> Подтвердить правило</button>}
        </aside>
      </section>
    </>
  );
}
