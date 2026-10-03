const LOCALE = "uk-UA";

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(LOCALE, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(value: string | null | undefined, withSeconds = false) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) });
}

export function formatBucket(seconds: number) {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${seconds / 60} хв`;
  return `${seconds / 3600} год`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${hours} год ${minutes} хв`;
  if (minutes) return `${minutes} хв ${rest} с`;
  return `${rest} с`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

// Value for <input type="datetime-local"> in the browser's time zone.
export function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatPercent(fraction: number | null | undefined, digits = 0) {
  if (fraction === null || fraction === undefined) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatRelative(value: string | null | undefined, now = Date.now()) {
  if (!value) return "—";
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 10) return "щойно";
  if (seconds < 60) return `${seconds} с тому`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} хв тому`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} год тому`;
  return formatDateTime(value);
}

export function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatDay(value: string) {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: "short", day: "2-digit", month: "2-digit" });
}
