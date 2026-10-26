import type pg from "pg";
import { recordActivity } from "./events.js";
import {
  publicSnapshotSchema,
  snapshotFingerprint,
  ComprasgovError,
  type PublicSnapshot,
} from "./comprasgov.js";
export async function saveComprasgovSnapshot(
  c: pg.PoolClient,
  procurement: { id: string; user_id: string },
  raw: PublicSnapshot,
) {
  const snapshot = publicSnapshotSchema.parse(raw);
  if (snapshotFingerprint(snapshot.data) !== snapshot.fingerprint)
    throw new ComprasgovError("comprasgov_invalid_response");
  await c.query("SELECT id FROM procurements WHERE id=$1 FOR UPDATE", [
    procurement.id,
  ]);
  const previous = (
    await c.query(
      "SELECT fingerprint FROM comprasgov_current WHERE procurement_id=$1",
      [procurement.id],
    )
  ).rows[0];
  const changed = previous?.fingerprint !== snapshot.fingerprint;
  if (changed) {
    const observation = (
      await c.query(
        "INSERT INTO comprasgov_observations(procurement_id,document,fingerprint,source_url,fetched_at) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [
          procurement.id,
          JSON.stringify(snapshot.data),
          snapshot.fingerprint,
          snapshot.sourceUrl,
          snapshot.fetchedAt,
        ],
      )
    ).rows[0];
    if (previous)
      await recordActivity(c, {
        procurementId: procurement.id,
        userId: procurement.user_id,
        key: "comprasgov-change:" + observation.id,
        kind: "public_data_update",
        title: "Alteração em dados públicos — Compras.gov.br",
        body: `Dados públicos da compra ${snapshot.data.idCompra} foram atualizados. Situação publicada: ${snapshot.data.situacaoCompraNomePncp || "não informada"}. Registro excluído na fonte: ${snapshot.data.contratacaoExcluida === true ? "sim" : "não indicado"}. Confira o registro oficial. Este aviso não é mensagem ou convocação do pregoeiro.`,
        source: "verified",
      });
  }
  await c.query(
    "INSERT INTO comprasgov_current(procurement_id,document,fingerprint,source_url,fetched_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(procurement_id) DO UPDATE SET document=excluded.document,fingerprint=excluded.fingerprint,source_url=excluded.source_url,fetched_at=excluded.fetched_at",
    [
      procurement.id,
      JSON.stringify(snapshot.data),
      snapshot.fingerprint,
      snapshot.sourceUrl,
      snapshot.fetchedAt,
    ],
  );
  await c.query(
    "UPDATE procurements SET agency=$2,object=$3,source='verified',verified_at=$4,updated_at=now() WHERE id=$1",
    [
      procurement.id,
      snapshot.data.orgaoEntidadeRazaoSocial,
      snapshot.data.objetoCompra,
      snapshot.fetchedAt,
    ],
  );
  return { changed, initial: !previous };
}
