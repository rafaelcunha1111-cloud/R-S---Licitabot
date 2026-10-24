import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { schedulerTick, deadlineTick } from "./scheduler.js";
import { dispatchOne } from "./queue.js";
import { setTimeout as pause } from "node:timers/promises";
const c = readConfig();
const pool = createPool(c);
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const heartbeat = async () => {
  await pool.query(
    "INSERT INTO worker_health(name,heartbeat_at) VALUES('scheduler',now()) ON CONFLICT(name) DO UPDATE SET heartbeat_at=now()",
  );
};
await heartbeat();
const timer = setInterval(() => {
  void heartbeat().catch(() => console.error("worker_heartbeat_failed"));
}, 15000);
console.log("Worker iniciado. Conectores de portais pendentes de homologação.");
while (!stopping) {
  try {
    await schedulerTick(pool);
    await deadlineTick(pool);
    for (let i = 0; i < 10 && !stopping; i++)
      if (!(await dispatchOne(pool, c))) break;
    await pool.query("DELETE FROM auth_sessions WHERE expires_at<now()");
  } catch {
    console.error("worker_cycle_failed");
  }
  if (!stopping) await pause(10000);
}
clearInterval(timer);
await pool.end();
