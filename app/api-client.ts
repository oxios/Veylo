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
    throw new ApiError(nestedMessage ?? payload?.message ?? "Сервер не зміг виконати запит", response.status);
  }

  return payload as T;
}

export const apiUrl = (path: string) => `${API_BASE}${path}`;

// fetch() has no upload progress, so large video uploads go through XMLHttpRequest.
export function apiUpload<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", apiUrl(path));
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let payload: (ApiErrorPayload & T) | null = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload);
        return;
      }
      const nestedMessage = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
      reject(new ApiError(nestedMessage ?? payload?.message ?? "Сервер не зміг прийняти файл", request.status));
    };
    request.onerror = () => reject(new ApiError("З'єднання перервано під час завантаження", 0));
    request.send(form);
  });
}
