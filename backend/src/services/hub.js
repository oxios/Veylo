// MediaMTX hub on the main server: relays live video from nodes to browsers over WebRTC (WHEP).
// The API proxies WHEP so browsers only talk to the main domain and ownership is checked here.

const env = require("../config/env");
const ApiError = require("../utils/api-error");

const READER_USER = "venueflow";
const hubAuthorization = () => `Basic ${Buffer.from(`${READER_USER}:${env.mediamtxSecret}`).toString("base64")}`;

async function pathReady(path, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${env.hubApiUrl}/v3/paths/get/${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const body = await response.json();
    return Boolean(body.available ?? body.ready); // "available" since MediaMTX 1.15
  } catch {
    return false;
  }
}

async function waitForPath(path, timeoutMs, { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pathReady(path, fetchImpl)) return true;
    await sleep(400);
  }
  return false;
}

async function whepOffer(path, sdp) {
  let response;
  try {
    response = await fetch(`${env.hubWebrtcUrl}/${path}/whep`, {
      method: "POST",
      headers: { "content-type": "application/sdp", authorization: hubAuthorization() },
      body: sdp,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, "Live video relay is unavailable", "HUB_UNAVAILABLE");
  }
  if (!response.ok) throw new ApiError(502, `Live video relay rejected the session (${response.status})`, "HUB_REJECTED");
  const location = response.headers.get("location") || "";
  const session = location.split("/").filter(Boolean).at(-1) || "";
  return { answer: await response.text(), session, etag: response.headers.get("etag") || "" };
}

async function whepForward(path, session, method, { body, contentType, ifMatch } = {}) {
  const headers = { authorization: hubAuthorization() };
  if (contentType) headers["content-type"] = contentType;
  if (ifMatch) headers["if-match"] = ifMatch;
  try {
    const response = await fetch(`${env.hubWebrtcUrl}/${path}/whep/${session}`, { method, headers, body, signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.text(), contentType: response.headers.get("content-type") || "" };
  } catch {
    return { status: 502, body: "", contentType: "" };
  }
}

module.exports = { READER_USER, pathReady, waitForPath, whepOffer, whepForward };
