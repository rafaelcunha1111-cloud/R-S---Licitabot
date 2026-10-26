import type pg from "pg";
import { saveComprasgovSnapshot } from "./comprasgov-store.js";
import { ComprasgovError, comprasgovFailure } from "./comprasgov.js";
import { transaction } from "./db.js";
import { recordActivity } from "./events.js";
import {
  productionConnectors,
  collectedSchema,
  type AuthorizedConnector,
} from "./portals.js";
export const INTERVAL_MS = 300000;
export async function schedulerTick(
  pool: pg.Pool,
  adapters: ReadonlyMap<string, AuthorizedConnector> = productionConnectors,
) {
  // Single global scheduler lock: all portals share one in-flight request across replicas.
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (
      await lock.query("SELECT pg_try_advisory_lock(8173402) AS acquired")
    ).rows[0].acquired;
    if (!acquired) return;
    await lock.query(
      "UPDATE query_history SET status='error',finished_at=now(),error_code='worker_interrupted' WHERE status='running'",
    );
    const due = (
      await lock.query(
        "SELECT p.* FROM procurements p WHERE monitoring_enabled AND next_check_at<=now() AND NOT EXISTS (SELECT 1 FROM portal_cooldowns pc WHERE pc.portal=p.portal AND pc.until_at>now()) ORDER BY next_check_at LIMIT 20",
      )
    ).rows;
    for (const procurement of due) {
      const run = (
        await lock.query(
          "INSERT INTO query_history(procurement_id,status) VALUES($1,'running') RETURNING id",
          [procurement.id],
        )
      ).rows[0].id;
      const adapter = adapters.get(procurement.portal);
      const blockedCode = !adapter
        ? "pending_authorized_integration"
        : adapter.supportsReference &&
            !adapter.supportsReference(procurement.external_ref)
          ? "comprasgov_reference_required"
          : null;
      if (blockedCode) {
        await transaction(pool, async (c) => {
          await c.query(
            "UPDATE procurements SET next_check_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1",
            [procurement.id, blockedCode],
          );
          await c.query(
            "UPDATE query_history SET status='blocked',finished_at=now(),error_code=$2 WHERE id=$1",
            [run, blockedCode],
          );
        });
        continue;
      }
      try {
        const data = collectedSchema.parse(
          await adapter!.collect({
            externalRef: procurement.external_ref,
            cursor: procurement.cursor || undefined,
            signal: AbortSignal.timeout(20000),
          }),
        );
        await transaction(pool, async (c) => {
          let added = 0;
          if (data.publicSnapshot) {
            if (procurement.portal !== "Comprasnet")
              throw Error("invalid_public_source");
            await saveComprasgovSnapshot(c, procurement, data.publicSnapshot);
          }
          for (const session of data.sessions)
            await c.query(
              `INSERT INTO procurement_sessions(procurement_id,external_id,status,source) VALUES($1,$2,$3,'verified') ON CONFLICT(procurement_id,external_id) DO UPDATE SET status=excluded.status,source='verified',observed_at=now()`,
              [procurement.id, session.id, session.status],
            );
          for (const message of data.messages) {
            const result = await c.query(
              `INSERT INTO messages(procurement_id,external_id,kind,body,occurred_at,source) VALUES($1,$2,$3,$4,$5,'verified') ON CONFLICT DO NOTHING RETURNING id`,
              [
                procurement.id,
                message.id,
                message.kind,
                message.body,
                message.occurredAt,
              ],
            );
            if (result.rowCount) {
              added++;
              await recordActivity(c, {
                procurementId: procurement.id,
                userId: procurement.user_id,
                key: "message:" + message.id,
                kind: message.kind,
                title:
                  message.kind === "summons"
                    ? "Nova convocação verificada"
                    : "Nova mensagem verificada",
                body: message.body,
                source: "verified",
              });
            }
          }
          for (const deadline of data.deadlines)
            await c.query(
              `INSERT INTO deadlines(procurement_id,external_id,title,due_at,source) VALUES($1,$2,$3,$4,'verified') ON CONFLICT(procurement_id,external_id) DO UPDATE SET title=excluded.title,due_at=excluded.due_at,source='verified'`,
              [procurement.id, deadline.id, deadline.title, deadline.dueAt],
            );
          await c.query(
            "UPDATE procurements SET last_success_at=now(),last_error=NULL,consecutive_errors=0,cursor=$2,next_check_at=now()+interval '5 minutes' WHERE id=$1",
            [procurement.id, data.cursor || null],
          );
          await c.query(
            "UPDATE query_history SET status='success',finished_at=now(),new_messages=$2 WHERE id=$1",
            [run, added],
          );
        });
      } catch (error) {
        const failure =
          error instanceof ComprasgovError ? comprasgovFailure(error) : null;
        await transaction(pool, async (c) => {
          if (failure?.code === "comprasgov_rate_limited")
            await c.query(
              "INSERT INTO portal_cooldowns(portal,until_at) VALUES($1,now()+$2*interval '1 second') ON CONFLICT(portal) DO UPDATE SET until_at=GREATEST(portal_cooldowns.until_at,excluded.until_at)",
              [procurement.portal, failure.retrySeconds],
            );
          await c.query(
            "UPDATE procurements SET last_error=$2,consecutive_errors=consecutive_errors+1,next_check_at=now()+GREATEST($3,LEAST(3600,300*power(2,LEAST(consecutive_errors,4)))) * interval '1 second' WHERE id=$1",
            [
              procurement.id,
              failure?.code || "collection_failed",
              failure?.retrySeconds || 300,
            ],
          );
          await c.query(
            "UPDATE query_history SET status='error',error_code=$2,finished_at=now() WHERE id=$1",
            [run, failure?.code || "collection_failed"],
          );
        });
        if (failure?.code === "comprasgov_rate_limited") break;
      }
    }
  } finally {
    try {
      if (acquired) await lock.query("SELECT pg_advisory_unlock(8173402)");
    } finally {
      lock.release();
    }
  }
}
export async function deadlineTick(pool: pg.Pool) {
  await transaction(pool, async (c) => {
    const due = (
      await c.query(
        `WITH due AS (SELECT d.*,p.user_id,p.external_ref,'deadline:'||d.id::text||':'||floor(extract(epoch FROM d.due_at)*1000)::text||':'||CASE WHEN d.due_at<now() THEN 'overdue' ELSE 'upcoming' END AS alert_key FROM deadlines d JOIN procurements p ON p.id=d.procurement_id WHERE d.completed_at IS NULL AND d.due_at<=now()+interval '24 hours') SELECT * FROM due WHERE NOT EXISTS (SELECT 1 FROM activity a WHERE a.procurement_id=due.procurement_id AND a.event_key=due.alert_key) ORDER BY due_at LIMIT 500`,
      )
    ).rows;
    for (const deadline of due)
      await recordActivity(c, {
        procurementId: deadline.procurement_id,
        userId: deadline.user_id,
        key: deadline.alert_key,
        kind: "deadline",
        title: deadline.alert_key.endsWith("overdue")
          ? "Prazo vencido"
          : "Prazo em até 24 horas",
        body: `${deadline.external_ref}: ${deadline.title}. Origem: ${deadline.source}.`,
        source: deadline.source,
      });
  });
}
