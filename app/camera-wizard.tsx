"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Plug, Radio, Upload, Wand2, X, XCircle } from "lucide-react";
import { apiFetch } from "./api-client";
import { kindMeta } from "./camera-ui";
import type { Camera, CameraKind, Probe, ProbeResult, Venue } from "./types";

type Source = "rtsp" | "upload";

function suggestSubstream(address: string) {
  try {
    const url = new URL(address);
    if (url.searchParams.get("subtype") === "0") {
      url.searchParams.set("subtype", "1");
      return url.toString();
    }
    const hik = url.pathname.match(/^(.*\/Streaming\/Channels\/)(\d+)01$/i);
    if (hik) {
      url.pathname = `${hik[1]}${hik[2]}02`;
      return url.toString();
    }
    if (/\/stream1$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/stream1$/i, "stream2");
      return url.toString();
    }
  } catch {
    // not a URL yet
  }
  return "";
}

// A pasted rtsp://user:pass@host/... is split so the password never stays visible in the address field.
function splitCredentials(address: string) {
  try {
    const url = new URL(address.trim());
    if (!url.username && !url.password) return null;
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    url.username = "";
    url.password = "";
    return { address: url.toString(), username, password };
  } catch {
    return null;
  }
}

function ProbeRow({ label, result }: { label: string; result: ProbeResult | null }) {
  if (!result) return null;
  return (
    <li className={result.ok ? "ok" : "bad"}>
      {result.ok ? <CheckCircle2 /> : <XCircle />}
      <span>{label}</span>
      <small>{result.ok ? `${(result.codec || "").toUpperCase()} · ${result.width}×${result.height}${result.fps ? ` · ${Math.round(result.fps)} кадр/с` : ""}` : result.error}</small>
    </li>
  );
}

export function CameraWizard({ venue, onClose, onCreated }: { venue: Venue; onClose: () => void; onCreated: (camera: Camera) => void }) {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source>("rtsp");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [subUrl, setSubUrl] = useState("");
  const [kind, setKind] = useState<CameraKind | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rtsp = { url: url.trim(), username, password, subUrl: subUrl.trim() };
  const suggestion = suggestSubstream(url.trim());
  const addressValid = /^rtsps?:\/\/[^\s/]+/.test(url.trim());
  const probeOk = Boolean(probe?.main?.ok);
  const canContinue = name.trim().length >= 2 && (source === "upload" || (addressValid && probeOk));

  const onUrlChange = (value: string) => {
    setProbe(null);
    const split = splitCredentials(value);
    if (split) {
      setUrl(split.address);
      setUsername(split.username);
      setPassword(split.password);
    } else {
      setUrl(value);
    }
  };

  const runProbe = async () => {
    setProbing(true);
    setError("");
    setProbe(null);
    try {
      const result = await apiFetch<{ probe: Probe }>("/cameras/probe", { method: "POST", body: JSON.stringify({ rtsp }) });
      setProbe(result.probe);
      if (!result.probe.main?.ok) setError(result.probe.main?.error ?? "Камера не відповіла");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Перевірка не вдалася");
    } finally {
      setProbing(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 3) {
      if (step === 1 && canContinue) setStep(2);
      else if (step === 2 && kind) setStep(3);
      return;
    }
    if (!kind) return;
    setBusy(true);
    setError("");
    try {
      const body = source === "rtsp" ? { source, name: name.trim(), kind, rtsp } : { source, name: name.trim(), kind };
      const result = await apiFetch<{ camera: Camera }>(`/venues/${venue.id}/cameras`, { method: "POST", body: JSON.stringify(body) });
      onCreated(result.camera);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося додати камеру");
      setBusy(false);
    }
  };

  const steps = ["Підключення", "Тип камери", "Підтвердження"];

  return (
    <div className="modalback" onMouseDown={onClose}>
      <form className="modal wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={create}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        <span className="eyebrow">{venue.name.toUpperCase()}</span>
        <h2 id="wizard-title">Нова камера</h2>
        <ol className="wizard-steps">
          {steps.map((label, index) => (
            <li key={label} className={index + 1 === step ? "active" : index + 1 < step ? "done" : ""}>
              <i>{index + 1 < step ? <Check /> : index + 1}</i>{label}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="wizard-body">
            <div className="segmented" role="group" aria-label="Джерело відео">
              <button type="button" className={source === "rtsp" ? "on" : ""} aria-pressed={source === "rtsp"} onClick={() => setSource("rtsp")}><Radio />RTSP-камера наживо</button>
              <button type="button" className={source === "upload" ? "on" : ""} aria-pressed={source === "upload"} onClick={() => setSource("upload")}><Upload />Завантаження відеофайлів</button>
            </div>
            <label className="field">Назва камери<input autoFocus required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Вхід із вулиці" /></label>
            {source === "rtsp" ? (
              <>
                <label className="field">RTSP-адреса основного потоку
                  <input className="mono" value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="rtsp://192.168.1.20:554/cam/realmonitor?channel=1&subtype=0" spellCheck={false} autoComplete="off" />
                </label>
                <div className="field-row">
                  <label className="field">Логін<input value={username} onChange={(event) => { setUsername(event.target.value); setProbe(null); }} autoComplete="off" placeholder="admin" /></label>
                  <label className="field">Пароль
                    <span className="password-field">
                      <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setProbe(null); }} autoComplete="new-password" />
                      <button type="button" aria-label={showPassword ? "Сховати пароль" : "Показати пароль"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>
                    </span>
                  </label>
                </div>
                <label className="field">Субпотік (для аналізу та live, необов’язково)
                  <span className="input-with-action">
                    <input className="mono" value={subUrl} onChange={(event) => { setSubUrl(event.target.value); setProbe(null); }} placeholder={suggestion || "rtsp://…"} spellCheck={false} autoComplete="off" />
                    {suggestion && subUrl !== suggestion && <button type="button" className="secondary" onClick={() => { setSubUrl(suggestion); setProbe(null); }}><Wand2 />Підставити</button>}
                  </span>
                </label>
                <div className="probe-box">
                  <button type="button" className="primary" disabled={!addressValid || probing} onClick={() => void runProbe()}>{probing ? <Loader2 className="spin" /> : <Plug />}{probing ? "Перевіряємо…" : "Перевірити з’єднання"}</button>
                  <span className="muted small">Пароль шифрується на сервері й більше ніде не показується.</span>
                </div>
                {probe && (
                  <div className="probe-result">
                    {probe.frame && (
                      // eslint-disable-next-line @next/next/no-img-element -- data URI frame from the probe
                      <img src={probe.frame} alt="Кадр з камери" />
                    )}
                    <ul>
                      <ProbeRow label="Основний потік" result={probe.main} />
                      <ProbeRow label="Субпотік" result={probe.sub} />
                      <li className="note"><span>Перевірив вузол «{probe.node}»</span></li>
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Камера без живого потоку: ви завантажуєте записи файлами на сторінці «Відео», а метрики рахуються по них.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <p className="muted">Від типу залежить, що рахуємо і що треба розмітити на кадрі.</p>
            <div className="kind-cards" role="group" aria-label="Тип камери">
              {(Object.keys(kindMeta) as CameraKind[]).map((item) => {
                const meta = kindMeta[item];
                const Icon = meta.icon;
                return (
                  <button key={item} type="button" className={`kind-card kind-${item}${kind === item ? " on" : ""}`} aria-pressed={kind === item} onClick={() => setKind(item)}>
                    <span className="kind-icon"><Icon /></span>
                    <strong>{meta.label}</strong>
                    <small>{meta.summary}</small>
                    <ul>{meta.counts.map((count) => <li key={count}><Check />{count}</li>)}</ul>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && kind && (
          <div className="wizard-body">
            <dl className="summary">
              <div><dt>Назва</dt><dd>{name.trim()}</dd></div>
              <div><dt>Джерело</dt><dd>{source === "rtsp" ? "RTSP-камера наживо" : "Завантаження файлів"}</dd></div>
              {source === "rtsp" && <div><dt>Потік</dt><dd className="mono">{url.replace(/^rtsps?:\/\//, "")}{username ? ` · ${username}` : ""}</dd></div>}
              <div><dt>Тип</dt><dd>{kindMeta[kind].label}</dd></div>
            </dl>
            {source === "rtsp" && (
              <p className="muted">Після додавання вузол обробки почне запис основного потоку (зберігаємо 24 години, без звуку) і аналіз субпотоку. Далі розмітите кадр: {kind === "outdoor" ? "лінію дверей і тротуар" : kind === "hybrid" ? "поріг, проріз дверей і столики" : "зал і столики"}.</p>
            )}
          </div>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          {step > 1 ? <button type="button" className="secondary" onClick={() => setStep(step - 1)}><ArrowLeft />Назад</button> : <button type="button" className="secondary" onClick={onClose}>Скасувати</button>}
          <button type="submit" className="primary" disabled={busy || (step === 1 && !canContinue) || (step === 2 && !kind)}>
            {step < 3 ? <>Далі<ArrowRight /></> : busy ? "Додаємо…" : <><Check />Додати камеру</>}
          </button>
        </div>
      </form>
    </div>
  );
}
