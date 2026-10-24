import type pg from "pg";
export async function recordActivity(
  c: pg.PoolClient,
  input: {
    procurementId: string;
    userId: string;
    key: string;
    kind: string;
    title: string;
    body: string;
    source: "manual" | "verified";
  },
) {
  const result = await c.query(
    `INSERT INTO activity(procurement_id,event_key,kind,title,body,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
    [
      input.procurementId,
      input.key,
      input.kind,
      input.title,
      input.body,
      input.source,
    ],
  );
  if (!result.rows[0]) return;
  const id = result.rows[0].id;
  const user = (
    await c.query(
      "SELECT email_alerts,whatsapp_opt_in FROM users WHERE id=$1",
      [input.userId],
    )
  ).rows[0];
  for (const channel of [
    "panel",
    ...(user.email_alerts ? ["email"] : []),
    ...(user.whatsapp_opt_in ? ["whatsapp"] : []),
  ]) {
    await c.query(
      `INSERT INTO notifications(user_id,activity_id,channel,status) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [input.userId, id, channel, channel === "panel" ? "delivered" : "queued"],
    );
  }
}
