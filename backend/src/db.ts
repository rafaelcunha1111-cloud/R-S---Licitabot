import pg from "pg";
import { readFileSync } from "node:fs";
import type { Config } from "./config.js";
export function createPool(c: Config) {
  // Do not accept libpq URL options that silently weaken TLS.
  const url = new URL(c.DATABASE_URL);
  const sslMode = url.searchParams.get("sslmode");
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith("ssl")) url.searchParams.delete(key);
  const tls =
    c.NODE_ENV === "production" ||
    sslMode === "verify-full" ||
    sslMode === "require" ||
    sslMode === "verify-ca";
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    ssl: tls
      ? {
          rejectUnauthorized: true,
          ...(c.DATABASE_CA_CERT
            ? { ca: readFileSync(c.DATABASE_CA_CERT, "utf8") }
            : {}),
        }
      : false,
  });
  pool.on("error", () => console.error("database_connection_lost"));
  return pool;
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
