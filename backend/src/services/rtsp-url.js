// RTSP address handling. Credentials are kept apart from the address so the UI can show the address
// without ever receiving the password.

const ApiError = require("../utils/api-error");

const PROTOCOLS = new Set(["rtsp:", "rtsps:"]);

function invalid(message) {
  return new ApiError(422, message, "INVALID_RTSP_URL");
}

/**
 * Parses a user-supplied address. Credentials embedded in the URL (rtsp://user:pass@host/...) are extracted,
 * explicit username/password arguments win over embedded ones.
 * @returns {{ address: string, username: string, password: string }} address has no credentials
 */
function parseRtspInput(raw, { username, password } = {}) {
  const text = String(raw || "").trim();
  if (!text) throw invalid("RTSP address is required");
  if (/\s/.test(text)) throw invalid("RTSP address must not contain spaces");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw invalid("RTSP address is not a valid URL");
  }
  if (!PROTOCOLS.has(url.protocol)) throw invalid("Address must start with rtsp:// or rtsps://");
  if (!url.hostname) throw invalid("RTSP address has no host");
  const embeddedUser = decodeURIComponent(url.username || "");
  const embeddedPassword = decodeURIComponent(url.password || "");
  url.username = "";
  url.password = "";
  url.hash = "";
  return {
    address: url.toString(),
    username: username !== undefined && username !== "" ? String(username) : embeddedUser,
    password: password !== undefined && password !== "" ? String(password) : embeddedPassword,
  };
}

// Full URL for the processing node (never sent to browsers).
function withCredentials(address, username, password) {
  const url = new URL(address);
  if (username) url.username = encodeURIComponent(username);
  if (password) url.password = encodeURIComponent(password);
  return url.toString();
}

// "host:port/path?query" for display.
function displayAddress(address) {
  if (!address) return "";
  const url = new URL(address);
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
}

// Common vendors expose the low-resolution substream next to the main one.
function suggestSubstream(address) {
  if (!address) return "";
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
  return "";
}

module.exports = { parseRtspInput, withCredentials, displayAddress, suggestSubstream };
