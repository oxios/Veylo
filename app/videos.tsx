"use client";

import { FormEvent, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { apiFetch, apiUpload } from "./api-client";
import { formatBytes, formatDateTime, formatDuration, toLocalInputValue } from "./format";
import type { PageContext, Video } from "./types";
import { ProgressBar, StatusBadge, WorkerBanner } from "./video-status";

const ACCEPT = ".mp4,.mov,.avi,.mkv,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska";

export function VideosPage({ venue, cameras: allCameras, videos, worker, refresh, go, openVenueModal }: PageContext) {
  // Live cameras record on their own; files are uploaded only to "upload" cameras.
  const cameras = allCameras.filter((item) => item.source === "upload");
  const [cameraId, setCameraId] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toLocalInputValue(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const camera = cameras.find((item) => item.id === cameraId) ?? cameras[0];

  if (!venue || cameras.length === 0) {
    return (
      <section className="card panel empty">
        <h2>{venue ? "Немає камери для завантаження файлів" : "Спочатку створіть заклад"}</h2>
        <p className="muted">Кожне відео належить камері: так ми знаємо, яку розмітку до нього застосувати. Додайте камеру з джерелом «Завантаження відеофайлів» — живі RTSP-камери пишуть архів самі.</p>
        {venue ? <button className="primary" onClick={() => go("cameras")}><Plus />До камер</button> : <button className="primary" onClick={openVenueModal}><Plus />Додати заклад</button>}
      </section>
    );
  }

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !camera) return;
    setError("");
    setUploadProgress(0);
    const form = new FormData();
    form.append("recordedAt", new Date(recordedAt).toISOString());
    form.append("file", file);
    try {
      await apiUpload<{ video: Video }>(`/cameras/${camera.id}/videos`, form, setUploadProgress);
      setFile(null);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося завантажити відео");
    } finally {
      setUploadProgress(null);
    }
  };

  const remove = async (video: Video) => {
    if (!window.confirm(`Видалити «${video.originalName}» разом із його показниками?`)) return;
    try {
      await apiFetch(`/videos/${video.id}`, { method: "DELETE" });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не вдалося видалити відео");
    }
  };

  const uploading = uploadProgress !== null;
  return (
    <div className="stack">
      <WorkerBanner worker={worker} videos={videos} />
      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">ЗАВАНТАЖЕННЯ</span>
            <h2>Нове відео</h2>
          </div>
        </div>
        <form className="upload-form" onSubmit={upload}>
          <label className="field">Камера<select value={camera?.id ?? ""} onChange={(event) => setCameraId(event.target.value)} disabled={uploading}>
            {cameras.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="field">Початок запису<input type="datetime-local" required value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} disabled={uploading} /></label>
          <label className="field file-field">Файл (MP4, MOV, AVI, MKV · до 2 ГБ)
            <input className="file-input" type="file" accept={ACCEPT} value="" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={uploading} />
            <span className="file-picker"><span className="file-button">Вибрати файл</span><span className="file-name">{file ? `${file.name} · ${formatBytes(file.size)}` : "Файл не вибрано"}</span></span>
          </label>
          <button type="submit" className="primary" disabled={!file || !recordedAt || uploading}><Upload />{uploading ? `Завантаження ${Math.round((uploadProgress ?? 0) * 100)}%` : "Завантажити"}</button>
        </form>
        {uploading && <ProgressBar value={uploadProgress ?? 0} label="Прогрес завантаження файлу" />}
        {error && <div className="form-error" role="alert">{error}</div>}
        <p className="footnote">Час початку запису потрібен, щоб показники розклалися по годинах. Після обробки файл відео видаляється, зберігаються лише траєкторії людей і один стоп-кадр.</p>
      </section>
      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">{venue.name.toUpperCase()}</span>
            <h2>Завантажені відео</h2>
          </div>
        </div>
        {videos.length === 0 ? <p className="muted">Відео ще не завантажено.</p> : (
          <div className="table-wrap">
            <table className="video-table">
              <thead>
                <tr><th>Файл</th><th>Камера</th><th>Запис від</th><th>Тривалість</th><th>Треків</th><th>Статус</th><th><span className="sr-only">Дії</span></th></tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td><strong>{video.originalName}</strong><small>{formatBytes(video.sizeBytes)} · {video.format.toUpperCase()}</small></td>
                    <td>{allCameras.find((item) => item.id === video.cameraId)?.name ?? "—"}</td>
                    <td>{formatDateTime(video.recordedAt)}</td>
                    <td>{formatDuration(video.durationSec)}</td>
                    <td>{video.trackCount ?? "—"}</td>
                    <td>
                      <StatusBadge video={video} />
                      {video.status === "processing" && <ProgressBar value={video.progress} label={`Прогрес обробки ${video.originalName}`} />}
                      {video.status === "failed" && <small className="error-text">{video.error}</small>}
                    </td>
                    <td><button type="button" className="icon-button" aria-label={`Видалити відео ${video.originalName}`} onClick={() => void remove(video)}><Trash2 /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
