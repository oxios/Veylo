const http = require("node:http");
const app = require("./app");
const env = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { seedOwner } = require("./services/seed-owner");

let server;

async function start() {
  await connectDatabase();
  if (process.env.AUTO_SEED_OWNER !== "false") {
    await seedOwner({ log: console.log });
  }
  server = http.createServer(app);
  server.listen(env.port, "0.0.0.0", () => {
    console.log(`VenueFlow API listening on http://0.0.0.0:${env.port}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  if (server) {
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
