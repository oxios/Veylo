export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type ApiErrorPayload = {
  message?: string;
  error?: string | { message?: string };
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;

  if (!response.ok) {
    const nestedMessage = typeof payload?.error === "string"
      ? payload.error
      : payload?.error?.message;
    throw new ApiError(nestedMessage ?? payload?.message ?? "Сервер не смог выполнить запрос", response.status);
  }

  return payload as T;
}
