import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";

const listenPort = positiveInteger(process.env.PORT, 5173);
const internalPort = positiveInteger(process.env.FRONTEND_INTERNAL_PORT, 3000);
const proxyTimeoutMs = positiveInteger(process.env.PROXY_TIMEOUT_MS, 120_000);
const webUpstream = new URL(`http://127.0.0.1:${internalPort}`);
const apiUpstream = new URL(process.env.VENUEFLOW_API_URL || "http://127.0.0.1:4000");
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isApiRequest(pathname = "/") {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function forwardedHeaders(request, upstream) {
  const headers = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (!hopByHopHeaders.has(name.toLowerCase()) && value !== undefined) {
      headers[name] = value;
    }
  }

  headers.host = upstream.host;
  headers["x-forwarded-host"] = request.headers.host || "";
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-for"] = [
    request.headers["x-forwarded-for"],
    request.socket.remoteAddress,
  ].filter(Boolean).join(", ");

  return headers;
}

function responseHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => !hopByHopHeaders.has(name.toLowerCase()) && value !== undefined,
    ),
  );
}

const vinextCli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
const vinext = spawn(
  process.execPath,
  [fileURLToPath(vinextCli), "start", "--port", String(internalPort), "--hostname", "127.0.0.1"],
  {
    env: { ...process.env, PORT: String(internalPort) },
    stdio: "inherit",
  },
);

vinext.on("error", (error) => {
  console.error("[frontend] Unable to start Vinext:", error);
  shutdown(1);
});

vinext.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`[frontend] Vinext stopped unexpectedly (${signal || code || 0}).`);
    shutdown(code || 1);
  }
});

const server = http.createServer((request, response) => {
  const upstream = isApiRequest(request.url) ? apiUpstream : webUpstream;
  const target = new URL(request.url || "/", upstream);
  const proxyRequest = http.request(
    target,
    {
      method: request.method,
      headers: forwardedHeaders(request, upstream),
      timeout: proxyTimeoutMs,
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode || 502,
        responseHeaders(proxyResponse.headers),
      );
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("timeout", () => {
    proxyRequest.destroy(new Error("Upstream request timed out"));
  });

  proxyRequest.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    const apiRequest = isApiRequest(request.url);
    response.writeHead(502, { "content-type": apiRequest ? "application/json" : "text/plain; charset=utf-8" });
    response.end(apiRequest
      ? JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "API temporarily unavailable" } })
      : "Frontend temporarily unavailable");
  });

  request.on("aborted", () => proxyRequest.destroy());
  request.pipe(proxyRequest);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`[frontend] Listening on http://0.0.0.0:${listenPort}; /api -> ${apiUpstream.href}`);
});

server.on("error", (error) => {
  console.error("[frontend] Reverse proxy failed:", error);
  shutdown(1);
});

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceExit = setTimeout(() => process.exit(exitCode || 1), 10_000);
  forceExit.unref();

  server.close(() => {
    if (!vinext.killed) vinext.kill("SIGTERM");
  });

  if (!vinext.killed) vinext.kill("SIGTERM");
  vinext.once("exit", () => process.exit(exitCode));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
