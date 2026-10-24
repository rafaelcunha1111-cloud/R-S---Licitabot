import pg from "pg";
import { readFileSync } from "node:fs";
import type { Config } from "./config.js";
const renderInternalHost = /^dpg-[a-z0-9]+-[a-z]$/i;
/** Explicit transport policy, resolved before pg parses the connection URL.
 * Never retry certificate errors with weaker TLS options.
 */
export function databaseConnectionOptions(
  c: Config,
): Pick<pg.PoolConfig, "connectionString" | "ssl"> {
  const url = new URL(c.DATABASE_URL);
  const modes = url.searchParams.getAll("sslmode");
  const sslFlags = url.searchParams.getAll("ssl");
  if (modes.length > 1 || sslFlags.length > 1)
    throw Error("Opções SSL duplicadas na DATABASE_URL.");
  const mode = modes[0];
  const flag = sslFlags[0];
  if (
    mode !== undefined &&
    !["disable", "require", "verify-ca", "verify-full"].includes(mode)
  )
    throw Error(
      "sslmode não suportado; use require/verify-full ou a configuração interna do Render.",
    );
  if (flag !== undefined && !["true", "false", "1", "0"].includes(flag))
    throw Error("Opção ssl inválida.");
  const wantsTls =
    ["require", "verify-ca", "verify-full"].includes(mode || "") ||
    ["true", "1"].includes(flag || "");
  const disablesTls = mode === "disable" || ["false", "0"].includes(flag || "");
  if (wantsTls && disablesTls)
    throw Error("Opções SSL conflitantes na DATABASE_URL.");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("ssl") && !["sslmode", "ssl"].includes(key))
      throw Error(
        "Opções de certificado na URL não são suportadas; configure DATABASE_CA_CERT no servidor.",
      );
    // pg-connection-string can replace the explicit ssl object when these remain.
    if (key.startsWith("ssl") || key === "uselibpqcompat")
      url.searchParams.delete(key);
  }
  const internal = renderInternalHost.test(url.hostname);
  const explicitInternal = c.DATABASE_SSL_MODE === "render-internal";
  if (explicitInternal && !internal)
    throw Error(
      "render-internal exige o hostname interno curto do PostgreSQL Render, não o endereço externo.",
    );
  if (explicitInternal && (wantsTls || c.DATABASE_CA_CERT))
    throw Error(
      "render-internal conflita com TLS/CA explícitos; remova a opção conflitante ou use verify-full.",
    );
  const privateConnection =
    explicitInternal ||
    (c.DATABASE_SSL_MODE === "auto" &&
      c.RENDER === "true" &&
      internal &&
      !wantsTls &&
      !c.DATABASE_CA_CERT);
  const tls =
    !privateConnection &&
    (c.DATABASE_SSL_MODE === "verify-full" ||
      c.NODE_ENV === "production" ||
      wantsTls ||
      Boolean(c.DATABASE_CA_CERT));
  if (tls && disablesTls)
    throw Error(
      "Não é permitido desabilitar TLS nesta conexão; use a URL interna do Render com a política apropriada.",
    );
  return {
    connectionString: url.toString(),
    ssl: tls
      ? {
          rejectUnauthorized: true,
          ...(c.DATABASE_CA_CERT
            ? { ca: readFileSync(c.DATABASE_CA_CERT, "utf8") }
            : {}),
        }
      : false,
  };
}
export function createPool(c: Config) {
  const pool = new pg.Pool({
    ...databaseConnectionOptions(c),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
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
