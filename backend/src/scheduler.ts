import type pg from "pg";
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
        "SELECT * FROM procurements WHERE monitoring_enabled AND next_check_at<=now() ORDER BY next_check_at LIMIT 20",
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
      if (!adapter) {
        await transaction(pool, async (c) => {
          await c.query(
            "UPDATE procurements SET next_check_at=now()+interval '5 minutes',last_error='pending_authorized_integration' WHERE id=$1",
            [procurement.id],
          );
          await c.query(
            "UPDATE query_history SET status='blocked',finished_at=now(),error_code='pending_authorized_integration' WHERE id=$1",
            [run],
          );
        });
        continue;
      }
      try {
        const data = collectedSchema.parse(
          await adapter.collect({
            externalRef: procurement.external_ref,
            cursor: procurement.cursor || undefined,
            signal: AbortSignal.timeout(20000),
          }),
        );
        await transaction(pool, async (c) => {
          let added = 0;
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
      } catch {
        await transaction(pool, async (c) => {
          await c.query(
            "UPDATE procurements SET last_error='collection_failed',consecutive_errors=consecutive_errors+1,next_check_at=now()+LEAST(3600,300*power(2,LEAST(consecutive_errors,4))) * interval '1 second' WHERE id=$1",
            [procurement.id],
          );
          await c.query(
            "UPDATE query_history SET status='error',error_code='collection_failed',finished_at=now() WHERE id=$1",
            [run],
          );
        });
      }
    }
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(8173402)");
    lock.release();
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
