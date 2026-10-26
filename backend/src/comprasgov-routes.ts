import { searchSchema, searchComprasgov } from "./comprasgov-search.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type pg from "pg";
import { transaction } from "./db.js";
import {
  fetchComprasgov,
  comprasgovLookupSchema,
  comprasgovReference,
  comprasgovFailure,
  ComprasgovError,
  type ComprasgovLookup,
  type PublicSnapshot,
} from "./comprasgov.js";
import { saveComprasgovSnapshot } from "./comprasgov-store.js";
export function comprasgovRoutes(
  pool: pg.Pool,
  fetchContract: (
    lookup: ComprasgovLookup,
    signal: AbortSignal,
  ) => Promise<PublicSnapshot> = fetchComprasgov,
) {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  async function withLock<T>(fn: () => Promise<T>) {
    const lock = await pool.connect();
    let acquired = false;
    try {
      acquired = (
        await lock.query("SELECT pg_try_advisory_lock(8173402) AS acquired")
      ).rows[0].acquired;
      if (!acquired) throw new ComprasgovError("comprasgov_busy");
      const cooldown = (
        await lock.query(
          "SELECT until_at FROM portal_cooldowns WHERE portal='Comprasnet' AND until_at>now()",
        )
      ).rows[0];
      if (cooldown)
        throw new ComprasgovError(
          "comprasgov_rate_limited",
          Math.max(
            300,
            Math.ceil(
              (new Date(cooldown.until_at).getTime() - Date.now()) / 1000,
            ),
          ),
        );
      try {
        return await fn();
      } catch (error) {
        if (
          error instanceof ComprasgovError &&
          error.code === "comprasgov_rate_limited"
        )
          await lock.query(
            "INSERT INTO portal_cooldowns(portal,until_at) VALUES('Comprasnet',now()+$1*interval '1 second') ON CONFLICT(portal) DO UPDATE SET until_at=GREATEST(portal_cooldowns.until_at,excluded.until_at)",
            [error.retrySeconds],
          );
        throw error;
      }
    } finally {
      try {
        if (acquired) await lock.query("SELECT pg_advisory_unlock(8173402)");
      } finally {
        lock.release();
      }
    }
  }
  router.get("/search", async (req, res, next) => {
    try {
      const input = searchSchema.parse(req.query);
      res.json(await withLock(() => searchComprasgov(input)));
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      const failure = comprasgovFailure(error);
      if (failure.code === "comprasgov_rate_limited") res.set("Retry-After", String(failure.retrySeconds));
      res.status(failure.code === "comprasgov_rate_limited" ? 429 : 502).json({error:failure.code});
    }
  });
  router.get("/contract", async (req, res, next) => {
    try {
      const lookup = comprasgovLookupSchema.parse(req.query);
      const snapshot = await withLock(() =>
        fetchContract(lookup, AbortSignal.timeout(20000)),
      );
      res.json({
        scope: "public_contract_data",
        ...snapshot,
        collectsMessages: false,
        collectsSummons: false,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(error);
        return;
      }
      const failure = comprasgovFailure(error);
      if (failure.code === "comprasgov_rate_limited")
        res.set("Retry-After", String(failure.retrySeconds));
      res
        .status(
          failure.code === "comprasgov_not_found"
            ? 404
            : failure.code === "comprasgov_rate_limited"
              ? 429
              : 502,
        )
        .json({ error: failure.code });
    }
  });
  router.post("/import", async (req, res, next) => {
    try {
      const body = z
        .object({
          lookup: comprasgovLookupSchema,
          monitorPublic: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      const result = await withLock(async () => {
        const snapshot = await fetchContract(
          body.lookup,
          AbortSignal.timeout(20000),
        );
        return transaction(pool, async (c) => {
          const row = (
            await c.query(
              "INSERT INTO procurements(user_id,portal,external_ref,agency,object,source,verified_at,last_success_at,monitoring_enabled,next_check_at) VALUES($1,'Comprasnet',$2,$3,$4,'verified',$5,$5,$6,now()+interval '5 minutes') RETURNING *",
              [
                res.locals.userId,
                comprasgovReference({
                  type: "idCompra",
                  code: snapshot.data.idCompra,
                }),
                snapshot.data.orgaoEntidadeRazaoSocial,
                snapshot.data.objetoCompra,
                snapshot.fetchedAt,
                body.monitorPublic,
              ],
            )
          ).rows[0];
          await saveComprasgovSnapshot(c, row, snapshot);
          await c.query(
            "INSERT INTO query_history(procurement_id,status,finished_at) VALUES($1,'success',now())",
            [row.id],
          );
          return row;
        });
      });
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError || (error as any)?.code === "23505") {
        next(error);
        return;
      }
      const failure = comprasgovFailure(error);
      if (failure.code === "comprasgov_rate_limited")
        res.set("Retry-After", String(failure.retrySeconds));
      res
        .status(failure.code === "comprasgov_rate_limited" ? 429 : 502)
        .json({ error: failure.code });
    }
  });
  return router;
}
