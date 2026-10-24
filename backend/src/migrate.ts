import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";
import { createPool, transaction } from "./db.js";
import type pg from "pg";
export async function migrate(pool: pg.Pool) {
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(8173401)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const name of readdirSync(directory)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
          .rowCount
      )
        continue;
      await c.query(readFileSync(directory + "/" + name, "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(readConfig());
  try {
    await migrate(pool);
    console.log("Migrations aplicadas.");
  } catch {
    console.error(
      "Falha nas migrations; verificar acesso, TLS e versão do banco.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
