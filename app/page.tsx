"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Camera as CameraIcon, ChevronRight, Film, LayoutDashboard, LogOut, Menu, Plus, Server, Settings2, UserCog, Users, X } from "lucide-react";
import { AdminPage } from "./admin";
import { apiFetch } from "./api-client";
import { AuthGate, useAuth } from "./auth";
import { CamerasPage } from "./cameras";
import { GuestsPage } from "./guests";
import { Overview } from "./overview";
import { StaffPage } from "./staff";
import type { Camera, PageKey, Venue, Video, WorkerInfo } from "./types";
import { VideosPage } from "./videos";

type Key = PageKey;

const nav: [Key, string, typeof LayoutDashboard][] = [
  ["overview", "Головна", LayoutDashboard],
  ["guests", "Гості", Users],
  ["staff", "Персонал", UserCog],
  ["cameras", "Камери", CameraIcon],
  ["videos", "Відео", Film],
];
const adminNav: [Key, string, typeof LayoutDashboard] = ["admin", "Вузли обробки", Server];

const titles: Record<Key, [string, string]> = {
  overview: ["Головна", "Що відбувається в закладі зараз і за період"],
  guests: ["Гості", "Хто і коли заходив, скільки пробув, де сидів — із записом кожного візиту"],
  staff: ["Персонал", "Зміна працівників: де були, скільки разів виходили, чи чекали гості біля стійки"],
  cameras: ["Камери", "Живі камери, архів за 24 години та розмітка кадру"],
  videos: ["Відео", "Завантаження записів і статус обробки"],
  admin: ["Вузли обробки", "Сервери, що пишуть і аналізують камери (тільки для адміністратора)"],
};

const POLL_MS = 3000;
const LIVE_POLL_MS = 10_000;

function pathForPage(page: Key) {
  return `/${page}`;
}

function pageFromPath(pathname: string): Key | null {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  return (Object.keys(titles) as Key[]).find((key) => key === slug) ?? null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VF";
}

// Day boundaries, hourly charts and "today" counters use the venue's time zone.
const TIME_ZONES: [string, string][] = [
  ["Europe/Kyiv", "Київ (UTC+2/+3)"],
  ["Europe/Warsaw", "Варшава (UTC+1/+2)"],
  ["Europe/Berlin", "Берлін (UTC+1/+2)"],
  ["Europe/Prague", "Прага (UTC+1/+2)"],
  ["Europe/Vilnius", "Вільнюс (UTC+2/+3)"],
  ["Europe/Bucharest", "Бухарест (UTC+2/+3)"],
  ["Europe/Chisinau", "Кишинів (UTC+2/+3)"],
  ["Europe/London", "Лондон (UTC+0/+1)"],
  ["Europe/Lisbon", "Лісабон (UTC+0/+1)"],
  ["Europe/Istanbul", "Стамбул (UTC+3)"],
  ["Asia/Dubai", "Дубай (UTC+4)"],
  ["America/New_York", "Нью-Йорк (UTC−5/−4)"],
  ["UTC", "UTC"],
];

function VenueModal({ venue, onClose, onSaved }: { venue?: Venue | null; onClose: () => void; onSaved: (venue: Venue) => void }) {
  const [name, setName] = useState(venue?.name ?? "");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [timezone, setTimezone] = useState(venue?.timezone ?? "Europe/Kyiv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zones = TIME_ZONES.some(([zone]) => zone === timezone) ? TIME_ZONES : [[timezone, timezone] as [string, string], ...TIME_ZONES];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ name: name.trim(), address: address.trim(), timezone });
      const result = venue
        ? await apiFetch<{ venue: Venue }>(`/venues/${venue.id}`, { method: "PATCH", body })
        : await apiFetch<{ venue: Venue }>("/venues", { method: "POST", body });
      onSaved(result.venue);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : venue ? "Не вдалося зберегти заклад" : "Не вдалося створити заклад");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalback" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="venue-modal-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        <span className="eyebrow">{venue ? "НАЛАШТУВАННЯ ЗАКЛАДУ" : "НОВИЙ ЗАКЛАД"}</span>
        <h2 id="venue-modal-title">{venue ? venue.name : "Додати заклад"}</h2>
        <label className="field">Назва<input autoFocus required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Кав'ярня на Подолі" /></label>
        <label className="field">Адреса (необов’язково)<input maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="вул. Сагайдачного, 10" /></label>
        <label className="field">Часовий пояс
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {zones.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
          </select>
        </label>
        <p className="footnote">За часовим поясом рахуємо «сьогодні», межі днів і години на графіках.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="primary" disabled={busy || name.trim().length < 2}>{busy ? "Зберігаємо…" : venue ? "Зберегти" : "Створити"}</button>
        </div>
      </form>
    </div>
  );
}

function VenueFlowDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const page: Key = pageFromPath(pathname) ?? "overview";
  const [mobile, setMobile] = useState(false);
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueId, setVenueId] = useState("");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [worker, setWorker] = useState<WorkerInfo | null>(null);
  const [venueModal, setVenueModal] = useState<"new" | "edit" | null>(null);
  const [loadError, setLoadError] = useState("");

  const venue = venues?.find((item) => item.id === venueId) ?? null;

  useEffect(() => {
    if (!pageFromPath(pathname)) router.replace(pathForPage("overview"));
    else if (pageFromPath(pathname) === "admin" && !user.isAdmin) router.replace(pathForPage("overview"));
  }, [pathname, router, user.isAdmin]);

  useEffect(() => {
    apiFetch<{ venues: Venue[] }>("/venues")
      .then((result) => {
        setVenues(result.venues);
        setVenueId((current) => current || result.venues[0]?.id || "");
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити заклади"));
  }, []);

  // State is only set in promise callbacks, so calling this from an effect does not cascade renders.
  const refreshVenueData = useCallback((id: string): Promise<void> => {
    if (!id) return Promise.resolve();
    return Promise.all([
      apiFetch<{ cameras: Camera[] }>(`/venues/${id}/cameras`),
      apiFetch<{ videos: Video[] }>(`/venues/${id}/videos`),
      apiFetch<{ worker: WorkerInfo }>("/processing/status"),
    ])
      .then(([cameraResult, videoResult, statusResult]) => {
        setCameras(cameraResult.cameras);
        setVideos(videoResult.videos);
        setWorker(statusResult.worker);
        setLoadError("");
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Не вдалося оновити дані"));
  }, []);

  useEffect(() => {
    void refreshVenueData(venueId);
  }, [venueId, refreshVenueData]);

  const pending = videos.some((video) => video.status === "queued" || video.status === "processing");

  // People waiting for "is this a staff member?" — a badge on the Staff item.
  const [reviews, setReviews] = useState(0);
  const hasPeopleCameras = cameras.some((camera) => camera.source === "rtsp" && camera.kind !== "outdoor");
  useEffect(() => {
    if (!venueId || !hasPeopleCameras) return;
    let cancelled = false;
    const check = () => apiFetch<{ summary: { reviews: number } }>(`/venues/${venueId}/people/summary`)
      .then((result) => { if (!cancelled) setReviews(result.summary.reviews); }, () => undefined);
    void check();
    const timer = window.setInterval(check, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [venueId, hasPeopleCameras]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void refreshVenueData(venueId), POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending, venueId, refreshVenueData]);

  // Live camera status (online, fps, errors) comes from node heartbeats.
  const hasLive = cameras.some((camera) => camera.source === "rtsp");
  useEffect(() => {
    if (!hasLive || pending) return;
    const timer = window.setInterval(() => void refreshVenueData(venueId), LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasLive, pending, venueId, refreshVenueData]);

  const go = (target: Key) => {
    router.push(pathForPage(target));
    setMobile(false);
    window.scrollTo(0, 0);
  };

  const refresh = () => refreshVenueData(venueId);
  const context = { venue, cameras, videos, worker, refresh, go, openVenueModal: () => setVenueModal("new") };

  return (
    <div className="shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <i>VF</i>
          <p>
            <strong>VenueFlow</strong>
            <span>Video intelligence</span>
          </p>
          <button onClick={() => setMobile(false)} aria-label="Закрити меню">
            <X />
          </button>
        </div>
        <div className="venue-picker">
          {venues && venues.length > 0 ? (
            <div className="venue-select-row">
              <label>Заклад<select value={venueId} onChange={(event) => setVenueId(event.target.value)}>
                {venues.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              {venue && <button type="button" className="icon-button soft" aria-label="Налаштування закладу" title="Налаштування закладу" onClick={() => setVenueModal("edit")}><Settings2 /></button>}
            </div>
          ) : <span>{venues ? "Закладів ще немає" : "Завантаження…"}</span>}
          <button className="venue-add" onClick={() => setVenueModal("new")}><Plus />Новий заклад</button>
        </div>
        <nav>
          <div>
            {(user.isAdmin ? [...nav, adminNav] : nav).map(([key, label, Icon]) => (
              <button className={page === key ? "active" : ""} key={key} onClick={() => go(key)}>
                <Icon />
                <span>{label}</span>
                {key === "videos" && pending && <em>{videos.filter((video) => video.status === "queued" || video.status === "processing").length}</em>}
                {key === "staff" && hasPeopleCameras && reviews > 0 && <em className="attention" title="Чекають підтвердження">{reviews}</em>}
              </button>
            ))}
          </div>
        </nav>
        <footer>
          <div>
            <i>{initials(user.name)}</i>
            <p>
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </p>
            <button className="profile-more" aria-label="Вийти" title="Вийти" onClick={() => void logout()}><LogOut /></button>
          </div>
        </footer>
      </aside>
      {mobile && <button className="scrim" aria-label="Закрити бічне меню" onClick={() => setMobile(false)} />}
      <main>
        <header>
          <button className="burger" aria-label="Відкрити бічне меню" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div className="crumb">
            <span>{venue?.name ?? "VenueFlow"}</span>
            <ChevronRight />
            <strong>{titles[page][0]}</strong>
          </div>
        </header>
        <div className="content">
          <div className="pagehead">
            <div>
              <h1>{titles[page][0]}</h1>
              <p>{titles[page][1]}</p>
            </div>
          </div>
          {loadError && <div className="notice notice-error" role="alert">{loadError}</div>}
          {page === "overview" && <Overview {...context} />}
          {page === "guests" && <GuestsPage {...context} />}
          {page === "staff" && <StaffPage {...context} />}
          {page === "cameras" && <CamerasPage {...context} />}
          {page === "videos" && <VideosPage {...context} />}
          {page === "admin" && user.isAdmin && <AdminPage />}
        </div>
      </main>
      {venueModal && (
        <VenueModal
          venue={venueModal === "edit" ? venue : null}
          onClose={() => setVenueModal(null)}
          onSaved={(saved) => {
            setVenues((current) => {
              const list = current ?? [];
              return list.some((item) => item.id === saved.id) ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved];
            });
            setVenueId(saved.id);
            setVenueModal(null);
          }}
        />
      )}
    </div>
  );
}

export default function Home() {
  return <AuthGate><VenueFlowDashboard /></AuthGate>;
}
