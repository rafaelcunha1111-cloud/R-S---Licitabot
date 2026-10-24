import { Router, raw } from "express";
import { Webhook } from "svix";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type pg from "pg";
import type { Config } from "./config.js";
import { transaction } from "./db.js";
export function validMetaSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(body).digest(),
  );
}
async function receipt(
  pool: pg.Pool,
  key: string,
  channel: string,
  providerId: string,
  status: string,
) {
  await transaction(pool, async (c) => {
    await c.query(
      "INSERT INTO delivery_receipts(event_key,channel,provider_id,status) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [key, channel, providerId, status],
    );
    await c.query(
      `UPDATE notifications SET status=$3,delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END WHERE channel=$1 AND provider_id=$2 AND status NOT IN ('delivered')`,
      [channel, providerId, status],
    );
  });
}
export function webhooks(pool: pg.Pool, c: Config) {
  const router = Router();
  router.post(
    "/resend",
    raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      if (!c.RESEND_WEBHOOK_SECRET) {
        res.status(503).json({ error: "pending_configuration" });
        return;
      }
      let event: any;
      try {
        new Webhook(c.RESEND_WEBHOOK_SECRET).verify(req.body.toString("utf8"), {
          "svix-id": String(req.headers["svix-id"] || ""),
          "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
          "svix-signature": String(req.headers["svix-signature"] || ""),
        });
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        res.status(401).end();
        return;
      }
      if (!event || typeof event.type !== "string") {
        res.status(400).end();
        return;
      }
      const status =
        event.type === "email.delivered"
          ? "delivered"
          : ["email.bounced", "email.failed", "email.complained"].includes(
                event.type,
              )
            ? "delivery_failed"
            : undefined;
      if (status && typeof event.data?.email_id === "string")
        await receipt(
          pool,
          "resend:" + String(req.headers["svix-id"]),
          "email",
          event.data.email_id,
          status,
        );
      res.status(204).end();
    },
  );
  router.get("/whatsapp", (req, res) => {
    if (!c.WHATSAPP_VERIFY_TOKEN) {
      res.status(503).end();
      return;
    }
    const provided = String(req.query["hub.verify_token"] || "");
    const equal = timingSafeEqual(
      createHash("sha256").update(provided).digest(),
      createHash("sha256").update(c.WHATSAPP_VERIFY_TOKEN).digest(),
    );
    if (
      req.query["hub.mode"] === "subscribe" &&
      equal &&
      typeof req.query["hub.challenge"] === "string"
    )
      res.type("text").send(req.query["hub.challenge"]);
    else res.status(403).end();
  });
  router.post(
    "/whatsapp",
    raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      if (!c.WHATSAPP_APP_SECRET) {
        res.status(503).end();
        return;
      }
      if (
        !Buffer.isBuffer(req.body) ||
        !validMetaSignature(
          req.body,
          req.headers["x-hub-signature-256"] as string,
          c.WHATSAPP_APP_SECRET,
        )
      ) {
        res.status(401).end();
        return;
      }
      let event: any;
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        res.status(400).end();
        return;
      }
      if (
        event.object === "whatsapp_business_account" &&
        Array.isArray(event.entry)
      )
        for (const entry of event.entry)
          for (const change of entry.changes || [])
            for (const item of change.value?.statuses || []) {
              if (
                typeof item.id === "string" &&
                ["delivered", "read", "failed"].includes(item.status)
              ) {
                const status =
                  item.status === "failed" ? "delivery_failed" : "delivered";
                await receipt(
                  pool,
                  `whatsapp:${item.id}:${item.status}:${item.timestamp}`,
                  "whatsapp",
                  item.id,
                  status,
                );
              }
            }
      res.status(204).end();
    },
  );
  return router;
}
