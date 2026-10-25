import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Config } from "./config.js";
import {
  authorizeGmail,
  completeGmailAuthorization,
  sendGmail,
} from "./gmail.js";
export function gmailCallback(pool: pg.Pool, c: Config) {
  const router = Router();
  router.get("/gmail/callback", async (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    if (
      typeof req.query.state !== "string" ||
      typeof req.query.code !== "string" ||
      req.query.state.length > 200 ||
      req.query.code.length > 4096
    ) {
      res
        .status(400)
        .type("text")
        .send(
          "Autorização ausente ou recusada. Inicie novamente pelo painel autenticado.",
        );
      return;
    }
    try {
      await completeGmailAuthorization(
        pool,
        c,
        req.query.state,
        req.query.code,
      );
      res
        .type("text")
        .send(
          "Gmail autorizado. Feche esta janela e retorne ao painel. Nenhum envio de teste foi realizado automaticamente.",
        );
    } catch {
      res
        .status(400)
        .type("text")
        .send(
          "Não foi possível autorizar o Gmail. Confira a conta, o consentimento e a configuração; inicie uma nova autorização.",
        );
    }
  });
  return router;
}
export function gmailRoutes(pool: pg.Pool, c: Config) {
  const router = Router();
  router.use(async (_req, res, next) => {
    const user = (
      await pool.query("SELECT email FROM users WHERE id=$1", [
        res.locals.userId,
      ])
    ).rows[0];
    if (user?.email?.toLowerCase() !== c.GMAIL_SENDER_EMAIL.toLowerCase()) {
      res.status(403).json({ error: "gmail_operator_required" });
      return;
    }
    next();
  });
  router.get("/status", async (_req, res) => {
    const row = (
      await pool.query(
        "SELECT connected_at FROM gmail_accounts WHERE email=$1",
        [c.GMAIL_SENDER_EMAIL],
      )
    ).rows[0];
    res.json({
      provider: c.EMAIL_PROVIDER,
      authorized: Boolean(row),
      connectedAt: row?.connected_at || null,
      sender: c.GMAIL_SENDER_EMAIL,
      whatsappEnabled: c.WHATSAPP_ENABLED,
    });
  });
  router.post("/authorize", async (_req, res) => {
    try {
      res.json({
        authorizationUrl: await authorizeGmail(pool, c, res.locals.userId),
      });
    } catch {
      res.status(503).json({ error: "gmail_pending_configuration" });
    }
  });
  router.post("/disconnect", async (_req, res) => {
    await pool.query("DELETE FROM gmail_accounts WHERE email=$1", [
      c.GMAIL_SENDER_EMAIL,
    ]);
    res.status(204).end();
  });
  router.post(
    "/test",
    rateLimit({
      windowMs: 3600000,
      limit: 3,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (_req, res) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO gmail_test_runs(id,user_id) VALUES($1,$2)",
        [id, res.locals.userId],
      );
      const result = await sendGmail(pool, c, {
        id,
        channel: "email",
        email: c.GMAIL_SENDER_EMAIL,
        phone: null,
        title: "R&S LicitaBot — teste de configuração Gmail",
        body: "Este é um teste solicitado de envio pela Gmail API. Não indica monitoramento de licitações ativo.",
      });
      await pool.query(
        "UPDATE gmail_test_runs SET status=$2,provider_id=$3,error_code=$4 WHERE id=$1",
        [
          id,
          result.status,
          result.status === "provider_accepted" ? result.providerId : null,
          result.status === "provider_accepted" ? null : result.code,
        ],
      );
      res
        .status(
          result.status === "provider_accepted"
            ? 202
            : result.status === "pending_configuration"
              ? 503
              : 502,
        )
        .json({ id, ...result, delivered: false });
    },
  );
  return router;
}
