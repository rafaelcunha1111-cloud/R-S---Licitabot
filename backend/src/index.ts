import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";
const config = readConfig();
const pool = createPool(config);
// Apply versioned database migrations before accepting API requests.
// The migration runner uses a PostgreSQL advisory transaction lock.
await migrate(pool);
const server = createApp(pool, config).listen(config.PORT, "0.0.0.0", () =>
  console.log("API LicitaBot iniciada; consulte status autenticado."),
);
async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
