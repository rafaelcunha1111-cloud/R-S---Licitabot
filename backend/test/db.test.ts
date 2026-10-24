import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readConfig } from "../src/config.js";
import { databaseConnectionOptions } from "../src/db.js";
const production = (env: NodeJS.ProcessEnv = {}) =>
  readConfig({
    NODE_ENV: "production",
    FRONTEND_ORIGIN: "https://example.invalid",
    DATABASE_URL: "postgresql://db.example.invalid/licitabot",
    ...env,
  });
const internal = "postgresql://dpg-fixture123-a/licitabot";
test("Render auto: apenas hostname privado curto na plataforma usa conexão interna sem TLS", () => {
  assert.equal(
    databaseConnectionOptions(
      production({ DATABASE_URL: internal, RENDER: "true" }),
    ).ssl,
    false,
  );
  assert.deepEqual(
    databaseConnectionOptions(production({ DATABASE_URL: internal })).ssl,
    { rejectUnauthorized: true },
  );
  for (const host of [
    "dpg-fixture123-a.oregon-postgres.render.com",
    "db.example.invalid",
    "dpg-fixture123-a.attacker.invalid",
    "dpg-fixture123-a.evil",
    "localhost",
  ])
    assert.deepEqual(
      databaseConnectionOptions(
        production({
          DATABASE_URL: `postgresql://${host}/licitabot`,
          RENDER: "true",
        }),
      ).ssl,
      { rejectUnauthorized: true },
    );
});
test("modo render-internal é explícito e recusa endereços externos ou TLS/CA conflitantes", () => {
  assert.equal(
    databaseConnectionOptions(
      production({
        DATABASE_URL: internal,
        DATABASE_SSL_MODE: "render-internal",
      }),
    ).ssl,
    false,
  );
  for (const url of [
    "postgresql://db.example.invalid/test",
    internal + "?sslmode=require",
    internal + "?ssl=true",
  ])
    assert.throws(() =>
      databaseConnectionOptions(
        production({ DATABASE_URL: url, DATABASE_SSL_MODE: "render-internal" }),
      ),
    );
  assert.throws(() =>
    databaseConnectionOptions(
      production({
        DATABASE_URL: internal,
        DATABASE_SSL_MODE: "render-internal",
        DATABASE_CA_CERT: "/not-read",
      }),
    ),
  );
});
test("TLS explícito preserva verificação mesmo na rede Render e com uselibpqcompat", () => {
  for (const mode of ["require", "verify-ca", "verify-full"]) {
    const options = databaseConnectionOptions(
      production({
        DATABASE_URL: internal + `?sslmode=${mode}&uselibpqcompat=true`,
        RENDER: "true",
      }),
    );
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
    assert.equal(
      new URL(options.connectionString!).searchParams.has("sslmode"),
      false,
    );
    assert.equal(
      new URL(options.connectionString!).searchParams.has("uselibpqcompat"),
      false,
    );
    const client = new pg.Client(options);
    assert.deepEqual((client as any).connectionParameters.ssl, {
      rejectUnauthorized: true,
    });
  }
  assert.deepEqual(
    databaseConnectionOptions(
      production({
        DATABASE_URL: internal,
        RENDER: "true",
        DATABASE_SSL_MODE: "verify-full",
      }),
    ).ssl,
    { rejectUnauthorized: true },
  );
});
test("não aceita modos inseguros, parâmetros duplicados ou disable externo em produção", () => {
  for (const query of [
    "sslmode=no-verify",
    "sslmode=prefer",
    "sslmode=disable",
    "ssl=false",
    "sslmode=verify-full&sslmode=disable",
    "sslmode=require&ssl=false",
    "sslrootcert=/ignored",
  ])
    assert.throws(() =>
      databaseConnectionOptions(
        production({
          DATABASE_URL: "postgresql://db.example.invalid/test?" + query,
        }),
      ),
    );
  assert.equal(
    databaseConnectionOptions(
      production({
        DATABASE_URL: internal + "?sslmode=disable",
        RENDER: "true",
      }),
    ).ssl,
    false,
  );
});
test("desenvolvimento local permanece sem TLS, mas CA ou TLS explícito exige validação", () => {
  assert.equal(
    databaseConnectionOptions(
      readConfig({
        DATABASE_URL: "postgresql://localhost/licitabot_test",
        NODE_ENV: "test",
      }),
    ).ssl,
    false,
  );
  assert.deepEqual(
    databaseConnectionOptions(
      readConfig({
        DATABASE_URL: "postgresql://localhost/test?sslmode=require",
        NODE_ENV: "test",
      }),
    ).ssl,
    { rejectUnauthorized: true },
  );
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer, type Socket } from "node:net";
import { createSecureContext, TLSSocket } from "node:tls";
test("pg rejeita certificado autoassinado sem CA e aceita a CA fornecida sem desativar validação", async () => {
  const dir = mkdtempSync(join(tmpdir(), "licitabot-tls-"));
  const cert = join(dir, "cert.pem"),
    key = join(dir, "key.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  const context = createSecureContext({
    key: readFileSync(key),
    cert: readFileSync(cert),
  });
  const sockets = new Set<Socket>();
  // Minimal PostgreSQL SSL negotiation/authentication fixture; no queries or real credentials.
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.once("data", (data) => {
      if (data.length !== 8 || data.readInt32BE(4) !== 80877103) {
        socket.destroy();
        return;
      }
      socket.write("S");
      const secure = new TLSSocket(socket, {
        isServer: true,
        secureContext: context,
      });
      secure.on("error", () => {});
      secure.once("data", () =>
        secure.write(
          Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]),
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const url = `postgresql://localhost:${port}/licitabot_test?sslmode=require&uselibpqcompat=true`;
  const untrusted = new pg.Client({
    ...databaseConnectionOptions(production({ DATABASE_URL: url })),
    connectionTimeoutMillis: 2000,
  });
  const trusted = new pg.Client({
    ...databaseConnectionOptions(
      production({ DATABASE_URL: url, DATABASE_CA_CERT: cert }),
    ),
    connectionTimeoutMillis: 2000,
  });
  const mismatched = new pg.Client({
    ...databaseConnectionOptions(
      production({
        DATABASE_URL: url.replace("localhost", "127.0.0.1"),
        DATABASE_CA_CERT: cert,
      }),
    ),
    connectionTimeoutMillis: 2000,
  });
  try {
    await assert.rejects(mismatched.connect(), {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    await assert.rejects(untrusted.connect(), {
      code: "DEPTH_ZERO_SELF_SIGNED_CERT",
    });
    await trusted.connect();
    assert.equal(
      (trusted as any).connectionParameters.ssl.rejectUnauthorized,
      true,
    );
  } finally {
    await Promise.allSettled([
      untrusted.end(),
      trusted.end(),
      mismatched.end(),
    ]);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
