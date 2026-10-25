import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import { emailReady, whatsappReady } from "./config.js";
import {
  authenticate,
  verifyPassword,
  createSession,
  hashPassword,
} from "./auth.js";
import { transaction } from "./db.js";
import { portalStatus, portals } from "./portals.js";
import { recordActivity } from "./events.js";
import { webhooks } from "./webhooks.js";
import { gmailCallback, gmailRoutes } from "./gmail-routes.js";
const uuid = z.string().uuid();
const procurementSchema = z
  .object({
    portal: z.enum(portals),
    externalRef: z.string().trim().min(1).max(500),
    agency: z.string().trim().min(1).max(500),
    object: z.string().trim().min(1).max(2000),
  })
  .strict();
export function createApp(pool: pg.Pool, c: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== c.FRONTEND_ORIGIN) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    next();
  });
  app.use(
    cors({
      origin: c.FRONTEND_ORIGIN,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use("/oauth", gmailCallback(pool, c));
  app.use("/webhooks", webhooks(pool, c));
  app.use(express.json({ limit: "32kb" }));
  const dummy = hashPassword("not-a-user-password-random-dummy");
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const body = z
        .object({
          email: z.string().email().max(320),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      const user = (
        await pool.query("SELECT id,password_hash FROM users WHERE email=$1", [
          body.email.toLowerCase(),
        ])
      ).rows[0];
      const valid = await verifyPassword(
        body.password,
        user?.password_hash || (await dummy),
      );
      if (!valid || !user) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
      res
        .set("Cache-Control", "no-store")
        .json({ token: await createSession(pool, user.id), expiresIn: 43200 });
    },
  );
  app.use("/api", authenticate(pool), (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api/gmail", gmailRoutes(pool, c));
  app.post("/api/auth/logout", async (_req, res) => {
    await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
      res.locals.tokenHash,
    ]);
    res.status(204).end();
  });
  app.get("/api/me", async (_req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT id,email,email_alerts,whatsapp_phone,whatsapp_opt_in FROM users WHERE id=$1",
          [res.locals.userId],
        )
      ).rows[0],
    );
  });
  app.patch("/api/me", async (req, res) => {
    const body = z
      .object({
        emailAlerts: z.boolean(),
        whatsappOptIn: z.boolean(),
        whatsappPhone: z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/)
          .nullable(),
      })
      .strict()
      .parse(req.body);
    if (body.whatsappOptIn && !c.WHATSAPP_ENABLED) {
      res.status(400).json({ error: "whatsapp_disabled" });
      return;
    }
    if (body.whatsappOptIn && !body.whatsappPhone) {
      res.status(400).json({ error: "phone_required" });
      return;
    }
    await pool.query(
      "UPDATE users SET email_alerts=$2,whatsapp_opt_in=$3,whatsapp_phone=$4 WHERE id=$1",
      [
        res.locals.userId,
        body.emailAlerts,
        body.whatsappOptIn,
        body.whatsappPhone,
      ],
    );
    res.json({ status: "saved" });
  });
  app.get("/api/status", async (_req, res) => {
    const stats = (
      await pool.query(
        "SELECT portal,max(last_success_at) AS last_success_at,count(*)::int AS registered_count FROM procurements WHERE user_id=$1 GROUP BY portal",
        [res.locals.userId],
      )
    ).rows;
    const heartbeat =
      (
        await pool.query(
          "SELECT heartbeat_at FROM worker_health WHERE name='scheduler'",
        )
      ).rows[0]?.heartbeat_at || null;
    res.json({
      database: "ok",
      worker: {
        heartbeatAt: heartbeat,
        healthy: heartbeat
          ? Date.now() - new Date(heartbeat).getTime() < 60000
          : false,
      },
      providers: {
        email: emailReady(c)
          ? "configured_unverified"
          : "pending_configuration",
        whatsapp: !c.WHATSAPP_ENABLED
          ? "disabled"
          : whatsappReady(c)
            ? "configured_unverified"
            : "pending_configuration",
      },
      portals: portalStatus.map((portal) => ({
        ...portal,
        ...stats.find((s) => s.portal === portal.portal),
      })),
      monitoringActive: false,
    });
  });
  app.get("/api/procurements", async (_req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT * FROM procurements WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
          [res.locals.userId],
        )
      ).rows,
    ),
  );
  app.post("/api/procurements", async (req, res) => {
    const body = procurementSchema.parse(req.body);
    const result = await transaction(pool, async (db) => {
      const result = (
        await db.query(
          `INSERT INTO procurements(user_id,portal,external_ref,agency,object,source) VALUES($1,$2,$3,$4,$5,'manual') RETURNING *`,
          [
            res.locals.userId,
            body.portal,
            body.externalRef,
            body.agency,
            body.object,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO procurement_sessions(procurement_id,external_id,status,source) VALUES($1,'manual','Cadastrada manualmente','manual')",
        [result.id],
      );
      await recordActivity(db, {
        procurementId: result.id,
        userId: res.locals.userId,
        key: "created",
        kind: "registration",
        title: "Licitação cadastrada manualmente",
        body: "Informações não verificadas no portal. Integração pendente.",
        source: "manual",
      });
      return result;
    });
    res.status(201).json(result);
  });
  const own = async (id: string, userId: string) =>
    (
      await pool.query(
        "SELECT * FROM procurements WHERE id=$1 AND user_id=$2",
        [uuid.parse(id), userId],
      )
    ).rows[0];
  app.get("/api/procurements/:id", async (req, res) => {
    const procurement = await own(String(req.params.id), res.locals.userId);
    if (!procurement) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const id = procurement.id;
    const [sessions, messages, deadlines, history, activity] =
      await Promise.all([
        pool.query(
          "SELECT * FROM procurement_sessions WHERE procurement_id=$1 ORDER BY observed_at DESC LIMIT 100",
          [id],
        ),
        pool.query(
          "SELECT * FROM messages WHERE procurement_id=$1 ORDER BY occurred_at DESC LIMIT 100",
          [id],
        ),
        pool.query(
          "SELECT * FROM deadlines WHERE procurement_id=$1 ORDER BY due_at LIMIT 100",
          [id],
        ),
        pool.query(
          "SELECT * FROM query_history WHERE procurement_id=$1 ORDER BY started_at DESC LIMIT 50",
          [id],
        ),
        pool.query(
          "SELECT * FROM activity WHERE procurement_id=$1 ORDER BY created_at DESC LIMIT 100",
          [id],
        ),
      ]);
    res.json({
      procurement,
      sessions: sessions.rows,
      messages: messages.rows,
      deadlines: deadlines.rows,
      history: history.rows,
      activity: activity.rows,
    });
  });
  app.patch("/api/procurements/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = z
      .object({ monitoringEnabled: z.boolean() })
      .strict()
      .parse(req.body);
    const result = await pool.query(
      "UPDATE procurements SET monitoring_enabled=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, res.locals.userId, body.monitoringEnabled],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(result.rows[0]);
  });
  app.post("/api/procurements/:id/deadlines", async (req, res) => {
    const procurement = await own(String(req.params.id), res.locals.userId);
    if (!procurement) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = z
      .object({
        title: z.string().trim().min(1).max(500),
        dueAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(req.body);
    const deadline = (
      await pool.query(
        `INSERT INTO deadlines(procurement_id,external_id,title,due_at,source) VALUES($1,gen_random_uuid()::text,$2,$3,'manual') RETURNING *`,
        [procurement.id, body.title, body.dueAt],
      )
    ).rows[0];
    res.status(201).json(deadline);
  });
  app.patch("/api/deadlines/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = z.object({ completed: z.boolean() }).strict().parse(req.body);
    const result = await pool.query(
      "UPDATE deadlines d SET completed_at=CASE WHEN $3 THEN now() ELSE NULL END FROM procurements p WHERE d.id=$1 AND p.id=d.procurement_id AND p.user_id=$2 RETURNING d.*",
      [id, res.locals.userId, body.completed],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(result.rows[0]);
  });
  app.get("/api/notifications", async (_req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT n.id,n.channel,n.status,n.attempts,n.last_error,n.accepted_at,n.delivered_at,n.read_at,a.title,a.body,a.source,a.procurement_id FROM notifications n JOIN activity a ON a.id=n.activity_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 200",
          [res.locals.userId],
        )
      ).rows,
    ),
  );
  app.post("/api/notifications/:id/read", async (req, res) => {
    const result = await pool.query(
      "UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2 AND channel='panel' RETURNING id",
      [uuid.parse(req.params.id), res.locals.userId],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  });
  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "invalid_input",
          fields: error.issues.map((i) => i.path.join(".")),
        });
        return;
      }
      if (error?.code === "23505") {
        res.status(409).json({ error: "already_exists" });
        return;
      }
      if (error?.type === "entity.parse.failed") {
        res.status(400).json({ error: "invalid_json" });
        return;
      }
      if (error?.type === "entity.too.large") {
        res.status(413).json({ error: "body_too_large" });
        return;
      }
      console.error(
        "request_failed",
        /^[0-9A-Z]{5}$/.test(error?.code || "") ? error.code : "unexpected",
      );
      res.status(500).json({ error: "internal_error" });
    },
  );
  return app;
}
