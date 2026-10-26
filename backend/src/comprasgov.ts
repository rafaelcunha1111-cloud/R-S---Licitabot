import { z } from "zod";
import { createHash } from "node:crypto";
import type { AuthorizedConnector } from "./portals.js";
export const COMPRASGOV_ORIGIN = "https://dadosabertos.compras.gov.br";
export const COMPRASGOV_LOOKUP =
  "/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id";
export const comprasgovLookupSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("idCompra"),
    code: z
      .string()
      .trim()
      .regex(/^\d{17}$/),
  }),
  z.object({
    type: z.literal("numeroControlePNCPCompra"),
    code: z
      .string()
      .trim()
      .transform((value) =>
        value.replace(/^(\d{14}-1-\d{6})-(\d{4})$/, "$1/$2"),
      )
      .pipe(z.string().regex(/^\d{14}-1-\d{6}\/\d{4}$/)),
  }),
]);
export type ComprasgovLookup = z.infer<typeof comprasgovLookupSchema>;
export const publicPurchaseSchema = z.object({
  idCompra: z.string().regex(/^\d{17}$/),
  numeroControlePNCP: z.string().regex(/^\d{14}-1-\d{6}\/\d{4}$/),
  orgaoEntidadeRazaoSocial: z.string().min(1).max(1000),
  objetoCompra: z.string().min(1).max(30000),
  unidadeOrgaoCodigoUnidade: z.string().max(100).nullable().optional(),
  numeroCompra: z.string().max(100).nullable().optional(),
  modalidadeNome: z.string().max(500).nullable().optional(),
  situacaoCompraNomePncp: z.string().max(500).nullable().optional(),
  valorTotalEstimado: z.number().finite().nullable().optional(),
  valorTotalHomologado: z.number().finite().nullable().optional(),
  dataAtualizacaoPncp: z.string().max(100).nullable().optional(),
  dataPublicacaoPncp: z.string().max(100).nullable().optional(),
  dataAberturaPropostaPncp: z.string().max(100).nullable().optional(),
  dataEncerramentoPropostaPncp: z.string().max(100).nullable().optional(),
  contratacaoExcluida: z.boolean().nullable().optional(),
});
export const publicSnapshotSchema = z.object({
  data: publicPurchaseSchema,
  sourceUrl: z
    .string()
    .url()
    .refine((u) => {
      const url = new URL(u);
      return (
        url.origin === COMPRASGOV_ORIGIN && url.pathname === COMPRASGOV_LOOKUP
      );
    }),
  fetchedAt: z.string().datetime(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;
export class ComprasgovError extends Error {
  constructor(
    public code: string,
    public retrySeconds = 300,
  ) {
    super(code);
  }
}
const safeCodes = new Set([
  "comprasgov_reference_required",
  "comprasgov_not_found",
  "comprasgov_access_denied",
  "comprasgov_rate_limited",
  "comprasgov_unavailable",
  "comprasgov_invalid_response",
  "comprasgov_response_too_large",
  "comprasgov_unexpected_record",
  "comprasgov_busy",
]);
export function comprasgovFailure(error: unknown) {
  return error instanceof ComprasgovError && safeCodes.has(error.code)
    ? error
    : new ComprasgovError("comprasgov_unavailable");
}
export function comprasgovReference(lookup: ComprasgovLookup) {
  return `comprasgov:${lookup.type}:${lookup.code}`;
}
export function parseComprasgovReference(value: string): ComprasgovLookup {
  const match = /^comprasgov:(idCompra|numeroControlePNCPCompra):(.+)$/.exec(
    value,
  );
  const parsed =
    match &&
    comprasgovLookupSchema.safeParse({ type: match[1], code: match[2] });
  if (!parsed || !parsed.success)
    throw new ComprasgovError("comprasgov_reference_required");
  return parsed.data;
}
export function snapshotFingerprint(
  data: z.infer<typeof publicPurchaseSchema>,
) {
  return createHash("sha256")
    .update(JSON.stringify(publicPurchaseSchema.parse(data)))
    .digest("hex");
}
export async function fetchComprasgov(
  lookup: ComprasgovLookup,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<PublicSnapshot> {
  const input = comprasgovLookupSchema.parse(lookup);
  const url = new URL(COMPRASGOV_LOOKUP, COMPRASGOV_ORIGIN);
  url.searchParams.set("tipo", input.type);
  url.searchParams.set("codigo", input.code);
  let response: Response;
  try {
    response = await request(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
  } catch {
    throw new ComprasgovError("comprasgov_unavailable");
  }
  if (response.status === 401 || response.status === 403)
    throw new ComprasgovError("comprasgov_access_denied");
  if (response.status === 429) {
    const raw = response.headers.get("retry-after");
    let delay =
      raw && /^\d+$/.test(raw)
        ? Number(raw)
        : raw
          ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
          : 300;
    if (!Number.isFinite(delay)) delay = 300;
    throw new ComprasgovError(
      "comprasgov_rate_limited",
      Math.min(86400, Math.max(300, delay)),
    );
  }
  if (response.status === 404)
    throw new ComprasgovError("comprasgov_not_found");
  if (!response.ok) throw new ComprasgovError("comprasgov_unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new ComprasgovError("comprasgov_invalid_response");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.length;
      if (total > 2097152) {
        await reader.cancel();
        throw new ComprasgovError("comprasgov_response_too_large");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    throw comprasgovFailure(error);
  } finally {
    reader.releaseLock();
  }
  let data: z.infer<typeof publicPurchaseSchema>;
  try {
    const body = z
      .object({
        resultado: z.array(publicPurchaseSchema).max(1),
        totalRegistros: z.number().int().nonnegative(),
        totalPaginas: z.number().int().nonnegative(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (body.resultado.length === 0) {
      if (body.totalRegistros !== 0)
        throw new ComprasgovError("comprasgov_invalid_response");
      throw new ComprasgovError("comprasgov_not_found");
    }
    if (body.totalRegistros !== 1 || body.totalPaginas !== 1)
      throw new ComprasgovError("comprasgov_invalid_response");
    data = body.resultado[0];
  } catch (error) {
    if (error instanceof ComprasgovError) throw error;
    throw new ComprasgovError("comprasgov_invalid_response");
  }
  if (
    (input.type === "idCompra" ? data.idCompra : data.numeroControlePNCP) !==
    input.code
  )
    throw new ComprasgovError("comprasgov_unexpected_record");
  return {
    data,
    sourceUrl: url.toString(),
    fetchedAt: new Date().toISOString(),
    fingerprint: snapshotFingerprint(data),
  };
}
export class ComprasgovPublicConnector implements AuthorizedConnector {
  readonly portal = "Comprasnet" as const;
  supportsReference(value: string) {
    try {
      parseComprasgovReference(value);
      return true;
    } catch {
      return false;
    }
  }

  async collect(input: {
    externalRef: string;
    cursor?: string;
    signal: AbortSignal;
  }) {
    const snapshot = await fetchComprasgov(
      parseComprasgovReference(input.externalRef),
      input.signal,
    );
    return {
      sessions: [],
      messages: [],
      deadlines: [],
      publicSnapshot: snapshot,
    };
  }
}
