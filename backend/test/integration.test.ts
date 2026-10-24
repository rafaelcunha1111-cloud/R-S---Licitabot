import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";
import { createPool } from "../src/db.js";
import { readConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { hashPassword, createSession } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { schedulerTick, deadlineTick } from "../src/scheduler.js";
import { dispatchOne } from "../src/queue.js";
import type { AuthorizedConnector } from "../src/portals.js";
const database = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL real: persistência, isolamento, worker, outbox e webhooks",
  { skip: !database },
  async (t) => {
    assert.ok(database);
    assert.match(
      new URL(database).pathname,
      /_test$/,
      "Use exclusivamente banco descartável terminado em _test",
    );
    const c = readConfig({
      DATABASE_URL: database,
      NODE_ENV: "test",
      FRONTEND_ORIGIN: "http://localhost:5173",
    });
    c.RESEND_WEBHOOK_SECRET = "whsec_" + randomBytes(32).toString("base64");
    const pool = createPool(c);
    await migrate(pool);
    await migrate(pool);
    await pool.query(
      "TRUNCATE users,auth_sessions,procurements,procurement_sessions,messages,deadlines,query_history,activity,notifications,delivery_receipts,worker_health CASCADE",
    );
    const user = (
      await pool.query(
        "INSERT INTO users(email,password_hash,email_alerts) VALUES($1,$2,true) RETURNING id",
        ["owner@example.invalid", await hashPassword("test-password-12345")],
      )
    ).rows[0].id;
    const other = (
      await pool.query(
        "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
        ["other@example.invalid", await hashPassword("test-password-12345")],
      )
    ).rows[0].id;
    const token = await createSession(pool, user);
    const otherToken = await createSession(pool, other);
    const server = createApp(pool, c).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    const url = "http://127.0.0.1:" + address.port;
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      bearer = token,
    ) {
      return fetch(url + path, {
        method,
        headers: {
          Authorization: "Bearer " + bearer,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    let id: string;
    try {
      await t.test(
        "API exige login, nega CORS externo e rejeita origem verified no cadastro",
        async () => {
          assert.equal((await fetch(url + "/api/status")).status, 401);
          assert.equal(
            (
              await fetch(url + "/health/live", {
                headers: { Origin: "https://untrusted.invalid" },
              })
            ).status,
            403,
          );
          const login = await request("/api/auth/login", "POST", {
            email: "owner@example.invalid",
            password: "test-password-12345",
          });
          assert.equal(login.status, 200);
          assert.equal(typeof (await login.json()).token, "string");
          assert.equal(
            (
              await request("/api/auth/login", "POST", {
                email: "owner@example.invalid",
                password: "wrong",
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("/api/procurements", "POST", {
                portal: "Comprasnet",
                externalRef: "TEST",
                agency: "Órgão de teste",
                object: "Fixture",
                source: "verified",
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "cadastro persiste manual, impede duplicidade e isola outro usuário",
        async () => {
          const body = {
            portal: "Comprasnet",
            externalRef: "TEST-001",
            agency: "Órgão de teste",
            object: "Fixture, não é licitação real",
          };
          const r = await request("/api/procurements", "POST", body);
          assert.equal(r.status, 201);
          const data = await r.json();
          id = data.id;
          assert.equal(data.source, "manual");
          assert.equal(data.last_success_at, null);
          assert.equal(
            (await request("/api/procurements", "POST", body)).status,
            409,
          );
          assert.equal(
            (
              await request(
                "/api/procurements/" + id,
                "GET",
                undefined,
                otherToken,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                "/api/procurements/" + id,
                "PATCH",
                { monitoringEnabled: false },
                otherToken,
              )
            ).status,
            404,
          );
          const second = createPool(c);
          try {
            assert.equal(
              (
                await second.query("SELECT id FROM procurements WHERE id=$1", [
                  id,
                ])
              ).rowCount,
              1,
            );
          } finally {
            await second.end();
          }
        },
      );
      await t.test(
        "conector pendente registra bloqueio sem sucesso e agenda mínimo de 5 minutos",
        async () => {
          await schedulerTick(pool);
          const result = (
            await pool.query("SELECT * FROM procurements WHERE id=$1", [id])
          ).rows[0];
          assert.equal(result.last_success_at, null);
          assert.equal(result.source, "manual");
          assert.equal(result.last_error, "pending_authorized_integration");
          assert.ok(
            new Date(result.next_check_at).getTime() > Date.now() + 290000,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT status FROM query_history WHERE procurement_id=$1",
                [id],
              )
            ).rows[0].status,
            "blocked",
          );
        },
      );
      let calls = 0;
      const fixture: AuthorizedConnector = {
        portal: "Comprasnet",
        async collect() {
          calls++;
          await new Promise((r) => setTimeout(r, 80));
          return {
            sessions: [{ id: "fixture-session", status: "Aberta" }],
            messages: [
              {
                id: "fixture-message",
                kind: "summons",
                body: "Fixture de convocação, apenas teste",
                occurredAt: new Date().toISOString(),
              },
            ],
            deadlines: [],
          };
        },
      };
      await t.test(
        "fixture de adaptador: lock entre réplicas e deduplicação transacional de convocação",
        async () => {
          await pool.query(
            "UPDATE procurements SET next_check_at=now() WHERE id=$1",
            [id],
          );
          const adapters = new Map([["Comprasnet", fixture]]);
          await Promise.all([
            schedulerTick(pool, adapters),
            schedulerTick(pool, adapters),
          ]);
          assert.equal(calls, 1);
          await pool.query(
            "UPDATE procurements SET next_check_at=now() WHERE id=$1",
            [id],
          );
          await schedulerTick(pool, adapters);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM messages WHERE procurement_id=$1",
                [id],
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM activity WHERE procurement_id=$1 AND kind='summons'",
                [id],
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT last_success_at FROM procurements WHERE id=$1",
                [id],
              )
            ).rows[0].last_success_at instanceof Date,
            true,
          );
        },
      );
      await t.test(
        "prazo manual gera alerta único, conclusão interrompe novos alertas",
        async () => {
          const r = await request(
            "/api/procurements/" + id + "/deadlines",
            "POST",
            {
              title: "Prazo teste",
              dueAt: new Date(Date.now() + 3600000).toISOString(),
            },
          );
          assert.equal(r.status, 201);
          const deadline = await r.json();
          await deadlineTick(pool);
          await deadlineTick(pool);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM activity WHERE kind='deadline'",
                [],
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await request(
                "/api/deadlines/" + deadline.id,
                "PATCH",
                { completed: true },
                otherToken,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request("/api/deadlines/" + deadline.id, "PATCH", {
                completed: true,
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "fila sem credenciais fica pendente sem fingir envio nem consumir tentativas",
        async () => {
          await dispatchOne(pool, c);
          const row = (
            await pool.query(
              "SELECT * FROM notifications WHERE channel='email' ORDER BY created_at LIMIT 1",
            )
          ).rows[0];
          assert.equal(row.status, "pending_configuration");
          assert.equal(row.attempts, 0);
          assert.equal(row.provider_id, null);
        },
      );
      await t.test(
        "fila concorrente previne dupla chamada e registra aceitação, nunca entrega presumida",
        async () => {
          await pool.query(
            "UPDATE notifications SET status='failed' WHERE channel='email'",
          );
          const job = (
            await pool.query(
              "UPDATE notifications SET status='queued',next_attempt_at=now() WHERE id=(SELECT id FROM notifications WHERE channel='email' LIMIT 1) RETURNING id",
            )
          ).rows[0];
          let sends = 0;
          const send = async () => {
            sends++;
            await new Promise((r) => setTimeout(r, 50));
            return {
              status: "provider_accepted" as const,
              providerId: "fixture-provider-id",
            };
          };
          await Promise.all([
            dispatchOne(pool, c, send),
            dispatchOne(pool, c, send),
          ]);
          assert.equal(sends, 1);
          const row = (
            await pool.query("SELECT * FROM notifications WHERE id=$1", [
              job.id,
            ])
          ).rows[0];
          assert.equal(row.status, "provider_accepted");
          assert.equal(row.delivered_at, null);
        },
      );
      await t.test(
        "webhook falsificado é negado; recibo assinado confirma entrega sem duplicidade",
        async () => {
          assert.equal(
            (
              await fetch(url + "/webhooks/resend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              })
            ).status,
            401,
          );
          const body = JSON.stringify({
            type: "email.delivered",
            data: { email_id: "fixture-provider-id" },
          });
          const timestamp = new Date();
          const eventId = "fixture-svix-id";
          const signature = new Webhook(c.RESEND_WEBHOOK_SECRET!).sign(
            eventId,
            timestamp,
            body,
          );
          const headers = {
            "Content-Type": "application/json",
            "svix-id": eventId,
            "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
            "svix-signature": signature,
          };
          for (let i = 0; i < 2; i++)
            assert.equal(
              (
                await fetch(url + "/webhooks/resend", {
                  method: "POST",
                  headers,
                  body,
                })
              ).status,
              204,
            );
          assert.equal(
            (
              await pool.query(
                "SELECT status FROM notifications WHERE provider_id='fixture-provider-id'",
              )
            ).rows[0].status,
            "delivered",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM delivery_receipts",
              )
            ).rows[0].count,
            1,
          );
        },
      );
      await t.test(
        "retry exponencial agenda reenvio e limita tentativas; logout revoga token",
        async () => {
          const id = (
            await pool.query(
              "UPDATE notifications SET status='queued',attempts=0,next_attempt_at=now() WHERE id=(SELECT id FROM notifications WHERE channel='email' AND provider_id IS NULL LIMIT 1) RETURNING id",
            )
          ).rows[0].id;
          await dispatchOne(pool, c, async () => ({
            status: "retry",
            code: "test_429",
            retrySeconds: 600,
          }));
          const row = (
            await pool.query("SELECT * FROM notifications WHERE id=$1", [id])
          ).rows[0];
          assert.equal(row.status, "retry");
          assert.ok(
            new Date(row.next_attempt_at).getTime() > Date.now() + 590000,
          );
          await pool.query(
            "UPDATE notifications SET next_attempt_at=now(),attempts=5 WHERE id=$1",
            [id],
          );
          await dispatchOne(pool, c, async () => {
            throw Error("must not send");
          });
          assert.equal(
            (
              await pool.query("SELECT status FROM notifications WHERE id=$1", [
                id,
              ])
            ).rows[0].status,
            "failed",
          );
          assert.equal((await request("/api/auth/logout", "POST")).status, 204);
          assert.equal((await request("/api/procurements")).status, 401);
        },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    }
  },
);
