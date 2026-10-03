// Periodic jobs of the API process. Each job runs at most once at a time; errors are logged and retried.

const { cleanupClips } = require("./clips");
const { finalizeIdleTracks, rollupOnce } = require("./live-pipeline");
const { assignPendingCameras } = require("./nodes");
const { expireVectors, refreshVisits } = require("./people");

function every(ms, name, job, log) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (error) {
      log(`[background] ${name} failed: ${error.message}`);
    } finally {
      running = false;
    }
  }, ms);
  timer.unref?.();
  return timer;
}

// Recomputes dirty hours in batches until none are left (bounded per tick).
async function rollupDrain() {
  for (let round = 0; round < 20; round += 1) {
    if ((await rollupOnce({ limit: 25 })) < 25) return;
  }
}

function startBackgroundJobs({ requeueStaleJobs, log = console.error }) {
  return [
    every(3000, "rollup", rollupDrain, log),
    every(30_000, "finalize-idle-tracks", () => finalizeIdleTracks(), log),
    every(15_000, "assign-pending-cameras", assignPendingCameras, log),
    every(30_000, "requeue-stale-jobs", () => requeueStaleJobs(), log),
    every(60_000, "cleanup-clips", () => cleanupClips(), log),
    every(10_000, "refresh-visits", () => refreshVisits(), log),
    every(10 * 60_000, "expire-appearance-vectors", () => expireVectors(), log),
  ];
}

module.exports = { startBackgroundJobs };
