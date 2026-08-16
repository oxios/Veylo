const ApiError = require("../utils/api-error");
const DEFAULT_YOLO_TIMEOUT_MS = 8_000;
const MAX_YOLO_TIMEOUT_MS = 30_000;

function cleanMessage(value, fallback = "YOLO detector request failed") {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  return (text || fallback).slice(0, 240);
}

function normalizedTimeoutMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(Math.round(parsed), MAX_YOLO_TIMEOUT_MS)
    : DEFAULT_YOLO_TIMEOUT_MS;
}

function yoloTimeoutError(timeoutMs) {
  return new ApiError(504, `YOLO detector timed out after ${timeoutMs} ms`, "YOLO_TIMEOUT");
}

function requestAbortedError() {
  return new ApiError(499, "Camera vision request was aborted", "CAMERA_VISION_REQUEST_ABORTED");
}

async function detectWithYolo({
  url,
  apiKey = "",
  buffer,
  mimeType,
  fileName = "snapshot.jpg",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_YOLO_TIMEOUT_MS,
  signal,
}) {
  if (signal?.aborted) throw requestAbortedError();
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw new ApiError(503, "YOLO_API_URL is invalid", "YOLO_CONFIGURATION_ERROR");
  }

  if (!/^https?:$/.test(endpoint.protocol)) {
    throw new ApiError(503, "YOLO_API_URL must use HTTP or HTTPS", "YOLO_CONFIGURATION_ERROR");
  }

  const form = new FormData();
  form.append("image", new Blob([buffer], { type: mimeType }), fileName);
  form.append("coordinateSpace", "percent");

  const controller = new AbortController();
  const boundedTimeoutMs = normalizedTimeoutMs(timeoutMs);
  let rejectParentAbort;
  const parentAbort = signal ? new Promise((_, reject) => {
    rejectParentAbort = reject;
  }) : null;
  const abortFromParent = () => {
    controller.abort(signal?.reason);
    rejectParentAbort?.(requestAbortedError());
  };
  signal?.addEventListener("abort", abortFromParent, { once: true });
  let timeout;
  let timedOut = false;
  try {
    const operation = (async () => {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiError(
          502,
          cleanMessage(payload?.error?.message || payload?.message || payload?.detail, `YOLO detector returned ${response.status}`),
          "YOLO_UPSTREAM_ERROR",
        );
      }
      if (payload?.actual === false || payload?.status === "fallback") {
        throw new ApiError(
          502,
          cleanMessage(payload?.reason || payload?.message || payload?.detail, "YOLO detector returned a fallback result"),
          "YOLO_FALLBACK_RESPONSE",
        );
      }
      const detections = Array.isArray(payload?.detections)
        ? payload.detections
        : Array.isArray(payload?.predictions)
          ? payload.predictions
          : null;
      if (!detections) {
        throw new ApiError(502, "YOLO detector response has no detections array", "YOLO_INVALID_RESPONSE");
      }
      return {
        detections,
        model: cleanMessage(payload?.model || payload?.engine || "external-yolo", "external-yolo"),
      };
    })();
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(yoloTimeoutError(boundedTimeoutMs));
      }, boundedTimeoutMs);
    });
    return await Promise.race(parentAbort ? [operation, deadline, parentAbort] : [operation, deadline]);
  } catch (error) {
    if (signal?.aborted) throw requestAbortedError();
    if (timedOut || error?.name === "AbortError" || error?.code === "YOLO_TIMEOUT") throw yoloTimeoutError(boundedTimeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

module.exports = { detectWithYolo };
