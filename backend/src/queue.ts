import type pg from "pg";
import { transaction } from "./db.js";
import { emailProvider, type Config } from "./config.js";
import { sendGmail } from "./gmail.js";
import {
  sendNotification,
  type Delivery,
  type SendResult,
} from "./providers.js";
type PendingJob = {
  channel: string;
  provider?: "gmail" | "resend" | "whatsapp" | null;
  status: string;
  attempts: number;
  last_error?: string | null;
  accepted_at?: unknown;
  provider_id?: string | null;
};
export function notificationProvider(
  row: PendingJob,
  c: Config,
): "gmail" | "resend" | "whatsapp" {
  if (row.channel !== "email") return "whatsapp";
  const selected = emailProvider(c);
  // Only untouched jobs blocked before any send may follow a provider configuration change.
  const canRebind =
    row.status === "pending_configuration" &&
    row.last_error === "provider_not_configured" &&
    row.attempts === 0 &&
    !row.accepted_at &&
    !row.provider_id;
  return canRebind ? selected : row.provider || selected;
}
export async function dispatchOne(
  pool: pg.Pool,
  c: Config,
  send: (c: Config, n: Delivery) => Promise<SendResult> = sendNotification,
) {
  await pool.query(
    `UPDATE notifications SET status=CASE WHEN provider='resend' AND created_at>now()-interval '23 hours' THEN 'retry' ELSE 'delivery_unknown' END,last_error='lease_expired',next_attempt_at=now() WHERE status='processing' AND locked_at<now()-interval '2 minutes'`,
  );
  const job = await transaction(pool, async (db) => {
    const result = await db.query(
      `SELECT n.*,a.title,a.body,u.email,u.whatsapp_phone,u.email_alerts,u.whatsapp_opt_in FROM notifications n JOIN activity a ON a.id=n.activity_id JOIN users u ON u.id=n.user_id WHERE n.channel!='panel' AND n.status IN ('queued','retry','pending_configuration') AND n.next_attempt_at<=now() ORDER BY n.created_at FOR UPDATE OF n SKIP LOCKED LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return;
    if (row.attempts >= 5) {
      await db.query(
        "UPDATE notifications SET status='failed',last_error='max_attempts' WHERE id=$1",
        [row.id],
      );
      return;
    }
    if (
      (row.channel === "email" && !row.email_alerts) ||
      (row.channel === "whatsapp" && !row.whatsapp_opt_in)
    ) {
      await db.query(
        "UPDATE notifications SET status='failed',last_error='recipient_opted_out' WHERE id=$1",
        [row.id],
      );
      return;
    }
    const provider = notificationProvider(row, c);
    if (
      provider === "resend" &&
      row.channel === "email" &&
      row.attempts > 0 &&
      Date.now() - new Date(row.created_at).getTime() > 23 * 3600000
    ) {
      await db.query(
        "UPDATE notifications SET status='delivery_unknown',last_error='idempotency_window_expired' WHERE id=$1",
        [row.id],
      );
      return;
    }
    await db.query(
      "UPDATE notifications SET status='processing',locked_at=now(),attempts=attempts+1,provider=$2 WHERE id=$1",
      [row.id, provider],
    );
    return {
      ...row,
      provider,
    };
  });
  if (!job) return false;
  let result: SendResult;
  try {
    const sender =
      job.provider === "gmail"
        ? (cfg: Config, delivery: Delivery) => sendGmail(pool, cfg, delivery)
        : send;
    result =
      job.channel === "whatsapp" && !c.WHATSAPP_ENABLED
        ? { status: "pending_configuration", code: "whatsapp_disabled" }
        : await sender(c, {
            id: job.id,
            provider: job.provider,
            channel: job.channel,
            email: c.ALERT_RECIPIENT_EMAIL || job.email,
            phone: job.whatsapp_phone,
            title: job.title,
            body: job.body,
          });
  } catch {
    result = {
      status: job.provider === "resend" ? "retry" : "delivery_unknown",
      code: "unexpected_sender_error",
    };
  }
  const delay =
    result.status === "pending_configuration"
      ? 300
      : result.status === "retry"
        ? result.retrySeconds || Math.min(3600, 60 * 2 ** job.attempts)
        : 0;
  await pool.query(
    `UPDATE notifications SET status=$2,provider_id=$3,last_error=$4,locked_at=NULL,next_attempt_at=now()+$5*interval '1 second',accepted_at=CASE WHEN $2='provider_accepted' THEN now() ELSE accepted_at END,attempts=CASE WHEN $2='pending_configuration' THEN attempts-1 ELSE attempts END WHERE id=$1`,
    [
      job.id,
      result.status,
      result.status === "provider_accepted" ? result.providerId : null,
      result.status === "provider_accepted" ? null : result.code,
      delay,
    ],
  );
  // Reconcile signed receipts arriving before provider acceptance is committed.
  if (result.status === "provider_accepted" && job.provider !== "gmail")
    await pool.query(
      `UPDATE notifications n SET status=r.status,delivered_at=CASE WHEN r.status='delivered' THEN r.received_at ELSE NULL END FROM (SELECT DISTINCT ON (channel,provider_id) * FROM delivery_receipts ORDER BY channel,provider_id,(status='delivered') DESC,received_at DESC) r WHERE n.id=$1 AND r.provider_id=n.provider_id AND r.channel=n.channel`,
      [job.id],
    );
  return true;
}
