const http = require("node:http");
const { WebSocketServer } = require("ws");
const app = require("./app");
const env = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const Node = require("./models/node");
const { requeueStaleJobs } = require("./routes/node-api");
const { startBackgroundJobs } = require("./services/background");
const channel = require("./services/node-channel");
const { bearerToken, findNodeByToken } = require("./services/node-tokens");
const { ensureLocalNode } = require("./services/nodes");
const { seedOwner } = require("./services/seed-owner");

let server;
let jobs = [];

function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

// Processing nodes open a WebSocket control channel at /api/node/ws with their bearer token.
function attachNodeSockets(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url || "/", "http://localhost");
    if (pathname !== "/api/node/ws") return rejectUpgrade(socket, 404, "Not Found");
    findNodeByToken(bearerToken(req.headers.authorization), Node)
      .then((node) => {
        if (!node) return rejectUpgrade(socket, 401, "Unauthorized");
        if (!node.enabled) return rejectUpgrade(socket, 403, "Forbidden");
        wss.handleUpgrade(req, socket, head, (ws) => {
          channel.attach(node._id, ws);
          Node.updateOne({ _id: node._id }, { $set: { connectedAt: new Date() } }).catch(() => {});
          console.log(`Node "${node.name}" connected`);
          ws.on("close", () => console.log(`Node "${node.name}" disconnected`));
        });
      })
      .catch(() => rejectUpgrade(socket, 500, "Internal Server Error"));
  });
}

async function start() {
  await connectDatabase();
  if (process.env.AUTO_SEED_OWNER !== "false") {
    await seedOwner({ log: console.log });
  }
  await ensureLocalNode(console.log);
  server = http.createServer(app);
  attachNodeSockets(server);
  channel.start();
  if (env.nodeEnv !== "test") jobs = startBackgroundJobs({ requeueStaleJobs });
  server.listen(env.port, "0.0.0.0", () => {
    console.log(`VenueFlow API listening on http://0.0.0.0:${env.port}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  jobs.forEach(clearInterval);
  channel.stop();
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch(async (error) => {
  console.error("VenueFlow API failed to start:", error.message);
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
