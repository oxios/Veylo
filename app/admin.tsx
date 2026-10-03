"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Copy, Cpu, HardDrive, KeyRound, MemoryStick, Plus, Power, Server, Trash2, X, Zap } from "lucide-react";
import { apiFetch } from "./api-client";
import { KindChip, StatusPill } from "./camera-ui";
import { formatBytes, formatDuration, formatRelative } from "./format";
import type { AdminCamera, NodeSetup, ProcessingNode } from "./types";

function Meter({ label, value, detail, icon: Icon }: { label: string; value: number | null | undefined; detail?: string; icon: typeof Cpu }) {
  const percent = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  const tone = percent === null ? "" : percent >= 90 ? "critical" : percent >= 75 ? "warning" : "good";
  return (
    <div className="meter">
      <span><Icon />{label}<b>{percent === null ? "—" : `${Math.round(percent)}%`}</b></span>
      <span className="meter-track"><i className={tone} style={{ width: `${percent ?? 0}%` }} /></span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-block">
      <span>{label}</span>
      <pre>{text}</pre>
      <button type="button" className="icon-button soft" aria-label={`Скопіювати: ${label}`} onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>{copied ? <Check /> : <Copy />}</button>
    </div>
  );
}

function TokenDialog({ title, token, setup, onClose }: { title: string; token: string; setup: NodeSetup; onClose: () => void }) {
  return (
    <div className="modalback" onMouseDown={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="token-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><X /></button>
        <span className="eyebrow">ВУЗОЛ ОБРОБКИ</span>
        <h2 id="token-title">{title}</h2>
        <div className="notice notice-warning"><KeyRound /><span>Токен показується <b>один раз</b>. Збережіть його в <code>.env</code> вузла — у базі зберігається лише хеш.</span></div>
        <CopyBlock label="Токен" text={token} />
        <CopyBlock label=".env вузла (deploy/node/.env)" text={setup.env} />
        <CopyBlock label="Запуск на сервері (CPU)" text={setup.commands.join("\n")} />
        <CopyBlock label="Запуск з NVIDIA GPU" text={setup.gpuCommand} />
        <p className="footnote">Вузлу не потрібні вхідні порти: він сам підключається до головного сервера (HTTPS + WebSocket) і публікує живе відео в hub лише поки хтось дивиться. Камери мають бути доступні з мережі вузла.</p>
        <div className="modal-actions"><button type="button" className="primary" onClick={onClose}>Готово</button></div>
      </div>
    </div>
  );
}

function NodeCard({ node, onChanged, onToken }: { node: ProcessingNode; onChanged: () => Promise<void>; onToken: (token: string, setup: NodeSetup) => void }) {
  const [busy, setBusy] = useState(false);
  const gpu = node.stats.gpus?.[0];
  const disk = node.stats.disk;
  const diskUsed = disk?.totalBytes ? ((disk.totalBytes - (disk.freeBytes ?? 0)) / disk.totalBytes) * 100 : null;
  const state = !node.enabled ? "disabled" : node.online ? "online" : "offline";

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`node-card ${state}`}>
      <div className="node-head">
        <span className={`node-dot ${state}`} aria-hidden="true" />
        <div>
          <strong>{node.name}</strong>
          <small>{node.info.hostname ?? "ще не підключався"}{node.managedBy === "env" ? " · локальний (з .env)" : ""}</small>
        </div>
        <span className={`state-pill tone-${state === "online" ? "good" : state === "offline" ? "critical" : "neutral"} compact`}>
          {state === "online" ? <Zap /> : <Power />}{state === "online" ? "Онлайн" : state === "offline" ? "Офлайн" : "Вимкнено"}
        </span>
      </div>
      <div className="node-hw">
        <span className="hw-chip">{node.info.device?.startsWith("cuda") ? `GPU · ${node.info.gpu}` : node.info.device ? "CPU" : "—"}</span>
        {node.info.cpuCount && <span className="hw-chip">{node.info.cpuCount} ядер</span>}
        {node.stats.ramTotalBytes && <span className="hw-chip">{formatBytes(node.stats.ramTotalBytes)} RAM</span>}
        {node.info.model && <span className="hw-chip">{node.info.model}</span>}
        {node.version && <span className="hw-chip">v{node.version}</span>}
      </div>
      <div className="node-meters">
        <Meter icon={Cpu} label="CPU" value={node.online ? node.stats.cpu : null} />
        <Meter icon={MemoryStick} label="RAM" value={node.online ? node.stats.ramPercent : null} />
        {gpu && <Meter icon={Zap} label="GPU" value={node.online ? gpu.util : null} detail={`${Math.round(gpu.memUsedMb)} / ${Math.round(gpu.memTotalMb)} МБ · ${Math.round(gpu.tempC)}°C`} />}
        <Meter icon={HardDrive} label="Диск" value={node.online ? diskUsed : null} detail={disk?.freeBytes ? `вільно ${formatBytes(disk.freeBytes)}` : undefined} />
      </div>
      <div className="node-foot">
        <span><b>{node.cameraCount}</b>/{node.maxCameras} камер</span>
        <span><b>{node.online ? node.stats.analysisFps ?? 0 : "—"}</b> кадр/с аналізу</span>
        <span>{node.online && node.stats.uptimeSec ? `працює ${formatDuration(node.stats.uptimeSec)}` : `був ${formatRelative(node.lastSeenAt)}`}</span>
      </div>
      <div className="node-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void act(() => apiFetch(`/admin/nodes/${node.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !node.enabled }) }))}><Power />{node.enabled ? "Вимкнути" : "Увімкнути"}</button>
        {node.managedBy === "admin" && (
          <button type="button" className="secondary" disabled={busy} onClick={() => {
            if (!window.confirm(`Перевипустити токен вузла «${node.name}»? Старий перестане працювати одразу.`)) return;
            void act(async () => {
              const result = await apiFetch<{ token: string; setup: NodeSetup }>(`/admin/nodes/${node.id}/token`, { method: "POST" });
              onToken(result.token, result.setup);
            });
          }}><KeyRound />Новий токен</button>
        )}
        {node.managedBy === "admin" && (
          <button type="button" className="icon-button" aria-label={`Видалити вузол ${node.name}`} disabled={busy} onClick={() => {
            if (!window.confirm(`Видалити вузол «${node.name}»? Його камери перейдуть на інші вузли, архів на цьому вузлі буде видалено.`)) return;
            void act(() => apiFetch(`/admin/nodes/${node.id}`, { method: "DELETE" }));
          }}><Trash2 /></button>
        )}
      </div>
    </li>
  );
}

export function AdminPage() {
  const [nodes, setNodes] = useState<ProcessingNode[] | null>(null);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [maxCameras, setMaxCameras] = useState(8);
  const [token, setToken] = useState<{ title: string; token: string; setup: NodeSetup } | null>(null);

  const load = useCallback(async () => {
    try {
      const [nodeResult, cameraResult] = await Promise.all([
        apiFetch<{ nodes: ProcessingNode[] }>("/admin/nodes"),
        apiFetch<{ cameras: AdminCamera[] }>("/admin/cameras"),
      ]);
      setNodes(nodeResult.nodes);
      setCameras(cameraResult.cameras);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити вузли");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await apiFetch<{ node: ProcessingNode; token: string; setup: NodeSetup }>("/admin/nodes", { method: "POST", body: JSON.stringify({ name: name.trim(), maxCameras }) });
      setAdding(false);
      setName("");
      setToken({ title: `Вузол «${result.node.name}» створено`, token: result.token, setup: result.setup });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося створити вузол");
    }
  };

  const assign = async (cameraId: string, nodeId: string) => {
    await apiFetch(`/admin/cameras/${cameraId}`, { method: "PATCH", body: JSON.stringify({ nodeId: nodeId || null }) });
    await load();
  };

  const online = nodes?.filter((node) => node.online).length ?? 0;
  const totalFps = nodes?.reduce((sum, node) => sum + (node.online ? node.stats.analysisFps ?? 0 : 0), 0) ?? 0;

  return (
    <div className="stack">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="admin-summary">
        <div className="card"><span>Вузли онлайн</span><strong>{nodes ? `${online} / ${nodes.length}` : "—"}</strong></div>
        <div className="card"><span>Камер наживо</span><strong>{cameras.filter((camera) => camera.status.state === "online").length} / {cameras.length}</strong></div>
        <div className="card"><span>Аналіз, кадр/с</span><strong>{Math.round(totalFps * 10) / 10}</strong></div>
        <div className="card"><span>Очікують вузол</span><strong>{cameras.filter((camera) => !camera.nodeId).length}</strong></div>
      </div>

      <div className="section-bar">
        <div>
          <span className="eyebrow">ІНФРАСТРУКТУРА</span>
          <h2>Вузли обробки</h2>
        </div>
        <button type="button" className="primary" onClick={() => setAdding(true)}><Plus />Додати вузол</button>
      </div>
      {nodes === null ? <section className="card panel"><p className="muted">Завантажуємо…</p></section> : (
        <ul className="node-grid">
          {nodes.map((node) => <NodeCard key={node.id} node={node} onChanged={load} onToken={(value, setup) => setToken({ title: `Новий токен для «${node.name}»`, token: value, setup })} />)}
        </ul>
      )}

      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">РОЗПОДІЛ</span>
            <h2>Камери на вузлах</h2>
          </div>
        </div>
        {cameras.length === 0 ? <p className="muted">RTSP-камер ще немає.</p> : (
          <div className="table-wrap">
            <table className="video-table">
              <thead><tr><th>Камера</th><th>Заклад · власник</th><th>Статус</th><th>Вузол</th></tr></thead>
              <tbody>
                {cameras.map((camera) => (
                  <tr key={camera.id}>
                    <td><strong>{camera.name}</strong><small><KindChip kind={camera.kind} /> <code>{camera.rtspDisplay}</code></small></td>
                    <td>{camera.venue}<small>{camera.owner}</small></td>
                    <td><StatusPill status={camera.status} compact />{camera.status.error && <small className="error-text">{camera.status.error}</small>}</td>
                    <td>
                      <select aria-label={`Вузол камери ${camera.name}`} value={camera.nodeId ?? ""} onChange={(event) => void assign(camera.id, event.target.value)}>
                        <option value="">— очікує вузол —</option>
                        {(nodes ?? []).map((node) => <option key={node.id} value={node.id} disabled={!node.enabled}>{node.name}{node.online ? "" : " (офлайн)"}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote">Нові камери автоматично йдуть на найменш завантажений онлайн-вузол. При перенесенні архів за минулі 24 години залишається на старому вузлі й видаляється з нього.</p>
      </section>

      {adding && (
        <div className="modalback" onMouseDown={() => setAdding(false)}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="node-add-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={create}>
            <button type="button" className="modal-close" onClick={() => setAdding(false)} aria-label="Закрити"><X /></button>
            <span className="eyebrow">НОВИЙ ВУЗОЛ</span>
            <h2 id="node-add-title"><Server /> Додати вузол обробки</h2>
            <label className="field">Назва<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="GPU-сервер Київ-1" /></label>
            <label className="field">Максимум камер<input type="number" min={1} max={64} value={maxCameras} onChange={(event) => setMaxCameras(Number(event.target.value) || 1)} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setAdding(false)}>Скасувати</button>
              <button type="submit" className="primary" disabled={name.trim().length < 2}>Створити й отримати токен</button>
            </div>
          </form>
        </div>
      )}
      {token && <TokenDialog title={token.title} token={token.token} setup={token.setup} onClose={() => setToken(null)} />}
    </div>
  );
}
