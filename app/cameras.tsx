"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Camera as CameraIcon, Eye, EyeOff, Film, Layers, Loader2, Plug, Plus, Radio, Settings2, Trash2, Users, Video as VideoIcon } from "lucide-react";
import { apiFetch } from "./api-client";
import { ArchiveView } from "./archive-view";
import { CameraFrame, KindChip, kindMeta, StatusPill, statusExplanation } from "./camera-ui";
import { CameraWizard } from "./camera-wizard";
import { formatPercent, formatRelative } from "./format";
import { LiveView } from "./live-view";
import { MarkupEditor } from "./markup-editor";
import type { Camera, CameraKind, NowState, PageContext, Probe, Video } from "./types";

type Tab = "live" | "archive" | "markup" | "settings";

// Latest counters of a live camera, polled while it is shown.
export function useNow(camera: Camera, intervalMs = 8000) {
  const [now, setNow] = useState<NowState | null>(null);
  const live = camera.source === "rtsp" && camera.status.state === "online";
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const load = () => apiFetch<{ live: NowState }>(`/cameras/${camera.id}/now`).then((result) => !cancelled && setNow(result.live)).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [camera.id, live, intervalMs]);
  return live ? now : null;
}

function CameraCard({ camera, videos, onOpen }: { camera: Camera; videos: Video[]; onOpen: () => void }) {
  const now = useNow(camera);
  const live = camera.source === "rtsp";
  const doneVideos = videos.filter((video) => video.cameraId === camera.id && video.status === "done").length;
  const conversion = now && now.today.entries + now.today.passersby > 0 ? now.today.entries / (now.today.entries + now.today.passersby) : null;
  return (
    <li className="camera-card">
      <button type="button" className="camera-card-button" onClick={onOpen}>
        <CameraFrame camera={camera} refreshMs={live ? 30_000 : 0} className={camera.status.state === "online" || !live ? "" : "dimmed"}>
          <div className="card-overlay top">
            <StatusPill status={camera.status} compact />
            <KindChip kind={camera.kind} />
          </div>
          <div className="card-overlay bottom">
            <strong>{camera.name}</strong>
            <span>
              {live
                ? camera.status.state === "online"
                  ? `${camera.status.width}×${camera.status.height} · ${camera.status.fps ?? "—"} кадр/с${camera.status.recording ? " · ● запис" : ""}`
                  : statusExplanation(camera.status).split(".")[0]
                : `${doneVideos} оброблених відео`}
            </span>
          </div>
        </CameraFrame>
        <div className="camera-card-stats">
          {live ? (
            <>
              <span><Users /><b>{now?.now ? (camera.kind === "outdoor" ? now.now.people : now.now.inHall ?? now.now.people) : "—"}</b>{camera.kind === "outdoor" ? "у кадрі" : "у залі"}</span>
              {camera.kind !== "indoor" && <span><b>{now ? now.today.entries : "—"}</b>зайшло сьогодні</span>}
              {camera.kind !== "indoor" && <span><b>{conversion === null ? "—" : formatPercent(conversion)}</b>конверсія</span>}
              {camera.kind === "indoor" && <span><b>{now?.now ? `${now.now.tables.filter((table) => table.occupied).length}/${camera.tables.length}` : "—"}</b>столиків зайнято</span>}
            </>
          ) : (
            <span><Film />Записи завантажуються файлами</span>
          )}
        </div>
      </button>
    </li>
  );
}

function SettingsTab({ camera, onSaved, onDeleted }: { camera: Camera; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [name, setName] = useState(camera.name);
  const [kind, setKind] = useState<CameraKind>(camera.kind);
  const [enabled, setEnabled] = useState(camera.enabled);
  const [analysis, setAnalysis] = useState(camera.analysisStream);
  const [url, setUrl] = useState(camera.rtspDisplay ? `rtsp://${camera.rtspDisplay}` : "");
  const [subUrl, setSubUrl] = useState(camera.rtspSubDisplay ? `rtsp://${camera.rtspSubDisplay}` : "");
  const [username, setUsername] = useState(camera.rtspUsername);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const live = camera.source === "rtsp";
  const rtspChanged = live && (url !== `rtsp://${camera.rtspDisplay}` || subUrl !== (camera.rtspSubDisplay ? `rtsp://${camera.rtspSubDisplay}` : "") || username !== camera.rtspUsername || password !== "");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = { name: name.trim(), kind, enabled };
      if (live) body.analysisStream = analysis;
      if (rtspChanged) body.rtsp = { url: url.trim(), username, password, subUrl: subUrl.trim() };
      await apiFetch(`/cameras/${camera.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setPassword("");
      await onSaved();
      setMessage(kind !== camera.kind ? "Збережено. Тип змінився — перевірте розмітку." : "Збережено.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося зберегти");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setProbing(true);
    setProbe(null);
    setMessage("");
    try {
      const result = await apiFetch<{ probe: Probe }>(`/cameras/${camera.id}/probe`, { method: "POST" });
      setProbe(result.probe);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Перевірка не вдалася");
    } finally {
      setProbing(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Видалити камеру «${camera.name}» разом з усіма показниками${live ? " і записом" : " та відео"}?`)) return;
    await apiFetch(`/cameras/${camera.id}`, { method: "DELETE" });
    await onDeleted();
  };

  return (
    <form className="settings-grid" onSubmit={save}>
      <section className="card panel">
        <h3>Основне</h3>
        <label className="field">Назва<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="field">Тип камери
          <div className="segmented" role="group" aria-label="Тип камери">
            {(Object.keys(kindMeta) as CameraKind[]).map((item) => (
              <button key={item} type="button" className={kind === item ? "on" : ""} aria-pressed={kind === item} onClick={() => setKind(item)}>{kindMeta[item].label}</button>
            ))}
          </div>
        </div>
        {live && (
          <label className="switch-row">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span><strong>Камера активна</strong><small>Вимкнена камера не пише архів і не рахує показники.</small></span>
          </label>
        )}
      </section>
      {live && (
        <section className="card panel">
          <h3>Потік</h3>
          <label className="field">RTSP-адреса<input className="mono" value={url} onChange={(event) => setUrl(event.target.value)} spellCheck={false} /></label>
          <div className="field-row">
            <label className="field">Логін<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" /></label>
            <label className="field">Новий пароль
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="без змін" autoComplete="new-password" />
                <button type="button" aria-label={showPassword ? "Сховати пароль" : "Показати пароль"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>
              </span>
            </label>
          </div>
          <label className="field">Субпотік<input className="mono" value={subUrl} onChange={(event) => setSubUrl(event.target.value)} placeholder="немає" spellCheck={false} /></label>
          <label className="field">Аналіз YOLO
            <select value={analysis} onChange={(event) => setAnalysis(event.target.value as "sub" | "main")}>
              <option value="sub">Субпотік (рекомендовано, менше навантаження)</option>
              <option value="main">Основний потік (точніше для далеких людей)</option>
            </select>
          </label>
          <div className="probe-box">
            <button type="button" className="secondary" disabled={probing} onClick={() => void check()}>{probing ? <Loader2 className="spin" /> : <Plug />}Перевірити збережене з’єднання</button>
            {camera.status.nodeName && <span className="muted small">Вузол: {camera.status.nodeName}</span>}
          </div>
          {probe && (
            <ul className="probe-inline">
              {[["Основний", probe.main], ["Субпотік", probe.sub]].map(([label, result]) => result && typeof result === "object" && (
                <li key={String(label)} className={result.ok ? "ok" : "bad"}>{String(label)}: {result.ok ? `${result.codec?.toUpperCase()} ${result.width}×${result.height}` : result.error}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="settings-actions">
        <button type="button" className="danger" onClick={() => void remove()}><Trash2 />Видалити камеру</button>
        {message && <span className="form-message" role="status">{message}</span>}
        <button type="submit" className="primary" disabled={busy || name.trim().length < 2}>{busy ? "Зберігаємо…" : "Зберегти"}</button>
      </div>
    </form>
  );
}

function CameraDetail({ camera, videos, initialTab, onBack, refresh, go }: {
  camera: Camera;
  videos: Video[];
  initialTab: Tab;
  onBack: () => void;
  refresh: () => Promise<void>;
  go: PageContext["go"];
}) {
  const live = camera.source === "rtsp";
  const [tab, setTab] = useState<Tab>(live ? initialTab : initialTab === "settings" ? "settings" : "markup");
  const hasFrame = live ? Boolean(camera.snapshotAt) : videos.some((video) => video.cameraId === camera.id && video.status === "done");
  const tabs: { key: Tab; label: string; icon: typeof Radio }[] = live
    ? [{ key: "live", label: "Наживо", icon: Radio }, { key: "archive", label: "Архів 24 год", icon: Film }, { key: "markup", label: "Розмітка", icon: Layers }, { key: "settings", label: "Налаштування", icon: Settings2 }]
    : [{ key: "markup", label: "Розмітка", icon: Layers }, { key: "settings", label: "Налаштування", icon: Settings2 }];

  return (
    <div className="stack">
      <div className="detail-head">
        <button type="button" className="back-link" onClick={onBack}><ArrowLeft />Усі камери</button>
        <div className="detail-title">
          <h2>{camera.name}</h2>
          <KindChip kind={camera.kind} />
          <StatusPill status={camera.status} />
        </div>
        <span className="detail-meta">
          {live ? <code>{camera.rtspDisplay}</code> : "Відео завантажуються файлами"}
          {live && camera.status.lastFrameAt && camera.status.state === "online" && <> · кадр {formatRelative(camera.status.lastFrameAt)}</>}
        </span>
      </div>
      {live && camera.status.state !== "online" && camera.status.state !== "connecting" && (
        <div className={`notice ${camera.status.state === "error" || camera.status.state === "node_offline" ? "notice-error" : "notice-warning"}`} role="status">{statusExplanation(camera.status)}</div>
      )}
      <div className="tabs" role="tablist" aria-label="Розділи камери">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "tab on" : "tab"} onClick={() => setTab(key)}><Icon />{label}</button>
        ))}
      </div>
      <section className="card panel tab-panel" role="tabpanel">
        {tab === "live" && <LiveView camera={camera} />}
        {tab === "archive" && <ArchiveView camera={camera} />}
        {tab === "markup" && (hasFrame ? <MarkupEditor key={`${camera.id}-${camera.kind}`} camera={camera} onSaved={refresh} /> : (
          <div className="empty-frame">
            <CameraIcon />
            <strong>{live ? "Чекаємо перший кадр з камери" : "Кадр з’явиться після обробки першого відео"}</strong>
            <p>{live ? "Вузол завантажує кадр основного потоку одразу після підключення. Розмітку робимо на реальному кадрі, щоб зони збігалися з тим, що бачить камера." : "Завантажте запис цієї камери на сторінці «Відео»."}</p>
            {!live && <button type="button" className="secondary" onClick={() => go("videos")}><VideoIcon />До відео</button>}
          </div>
        ))}
        {tab === "settings" && <SettingsTab key={camera.id} camera={camera} onSaved={refresh} onDeleted={async () => { onBack(); await refresh(); }} />}
      </section>
    </div>
  );
}

export function CamerasPage({ venue, cameras, videos, refresh, go, openVenueModal }: PageContext) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<Tab>("live");
  const [wizard, setWizard] = useState(false);
  const opened = cameras.find((camera) => camera.id === openId) ?? null;

  if (!venue) {
    return (
      <section className="card panel empty">
        <h2>Спочатку створіть заклад</h2>
        <p className="muted">Камери належать закладу.</p>
        <button className="primary" onClick={openVenueModal}><Plus />Додати заклад</button>
      </section>
    );
  }

  if (opened) {
    return <CameraDetail key={opened.id} camera={opened} videos={videos} initialTab={initialTab} onBack={() => setOpenId(null)} refresh={refresh} go={go} />;
  }

  return (
    <div className="stack">
      <div className="section-bar">
        <div>
          <span className="eyebrow">{venue.name.toUpperCase()}</span>
          <h2>{cameras.length ? `${cameras.length} ${cameras.length === 1 ? "камера" : cameras.length < 5 ? "камери" : "камер"}` : "Камер ще немає"}</h2>
        </div>
        <button type="button" className="primary" onClick={() => setWizard(true)}><Plus />Додати камеру</button>
      </div>
      {cameras.length === 0 ? (
        <section className="card panel empty-hero">
          <Radio />
          <h3>Підключіть першу камеру</h3>
          <p>Вкажіть RTSP-адресу — вузол обробки почне писати архів на 24 години й рахувати людей, входи та зайнятість столиків наживо.</p>
          <button type="button" className="primary" onClick={() => setWizard(true)}><Plus />Додати камеру</button>
        </section>
      ) : (
        <ul className="camera-grid">
          {cameras.map((camera) => <CameraCard key={camera.id} camera={camera} videos={videos} onOpen={() => { setInitialTab("live"); setOpenId(camera.id); }} />)}
        </ul>
      )}
      {wizard && (
        <CameraWizard
          venue={venue}
          onClose={() => setWizard(false)}
          onCreated={async (camera) => {
            setWizard(false);
            await refresh();
            setInitialTab(camera.source === "rtsp" ? "live" : "markup");
            setOpenId(camera.id);
          }}
        />
      )}
    </div>
  );
}
