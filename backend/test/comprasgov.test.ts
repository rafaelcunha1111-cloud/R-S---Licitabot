import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fetchComprasgov,
  COMPRASGOV_ORIGIN,
  COMPRASGOV_LOOKUP,
  comprasgovLookupSchema,
  parseComprasgovReference,
  comprasgovReference,
  publicPurchaseSchema,
  snapshotFingerprint,
} from "../src/comprasgov.js";
const record = {
  idCompra: "17013105000172023",
  numeroControlePNCP: "00394460000141-1-001631/2023",
  orgaoEntidadeRazaoSocial: "Órgão fixture de teste",
  objetoCompra: "Fixture de contrato, não são dados reais",
  situacaoCompraNomePncp: "Fixture A",
  dataAtualizacaoPncp: "2024-01-02T07:00:02",
};
const lookup = { type: "idCompra" as const, code: record.idCompra };
const signal = () => AbortSignal.timeout(2000);
const payload = (resultado: unknown[], total = resultado.length) =>
  JSON.stringify({
    resultado,
    totalRegistros: total,
    totalPaginas: total ? 1 : 0,
    paginasRestantes: 0,
  });
test("contrato OpenAPI oficial documenta endpoint, parâmetros e resposta utilizados", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../contracts/comprasgov-public.openapi.json", import.meta.url),
      "utf8",
    ),
  );
  const op = spec.paths[COMPRASGOV_LOOKUP].get;
  assert.equal(spec.servers[0].url, COMPRASGOV_ORIGIN);
  assert.deepEqual(
    op.parameters
      .filter((p: any) => p.required)
      .map((p: any) => p.name)
      .sort(),
    ["codigo", "tipo"],
  );
  assert.deepEqual(
    op.parameters.find((p: any) => p.name === "tipo").schema.enum,
    ["idCompra", "numeroControlePNCPCompra"],
  );
  assert.ok(!op.security);
});
test("cliente consulta apenas host e endpoint oficiais; preserva horários sem inventar fuso ou mensagens", async () => {
  const result = await fetchComprasgov(
    lookup,
    signal(),
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, COMPRASGOV_ORIGIN);
      assert.equal(url.pathname, COMPRASGOV_LOOKUP);
      assert.equal(url.searchParams.get("codigo"), record.idCompra);
      assert.equal(init?.redirect, "error");
      assert.equal((init?.headers as any).Authorization, undefined);
      return new Response(payload([record]));
    },
  );
  assert.equal(result.data.dataAtualizacaoPncp, record.dataAtualizacaoPncp);
  assert.equal(
    result.fingerprint,
    snapshotFingerprint(publicPurchaseSchema.parse(record)),
  );
});
test("referências oficiais não aceitam URL arbitrária ou referência manual sem vínculo", () => {
  const value = comprasgovReference(lookup);
  assert.deepEqual(parseComprasgovReference(value), lookup);
  assert.throws(() => parseComprasgovReference("TESTE-001"));
  assert.throws(() =>
    comprasgovLookupSchema.parse({
      type: "idCompra",
      code: "https://untrusted.invalid",
    }),
  );
  assert.throws(() =>
    parseComprasgovReference("comprasgov:idCompra:17013105000172023?other=1"),
  );
});
test("ausência de registro não vira sucesso e resposta de outro identificador é rejeitada", async () => {
  await assert.rejects(
    fetchComprasgov(lookup, signal(), async () => new Response(payload([]))),
    { message: "comprasgov_not_found" },
  );
  await assert.rejects(
    fetchComprasgov(
      { type: "idCompra", code: "17013105000182023" },
      signal(),
      async () => new Response(payload([record])),
    ),
    { message: "comprasgov_unexpected_record" },
  );
  await assert.rejects(
    fetchComprasgov(
      lookup,
      signal(),
      async () => new Response(payload([record], 100)),
    ),
    { message: "comprasgov_invalid_response" },
  );
});
test("falhas, autenticação e rate limit preservam estado real e respeitam Retry-After", async () => {
  for (const status of [401, 403])
    await assert.rejects(
      fetchComprasgov(
        lookup,
        signal(),
        async () => new Response("", { status }),
      ),
      { message: "comprasgov_access_denied" },
    );
  await assert.rejects(
    fetchComprasgov(
      lookup,
      signal(),
      async () =>
        new Response("", { status: 429, headers: { "retry-after": "1200" } }),
    ),
    (e: any) => e.code === "comprasgov_rate_limited" && e.retrySeconds === 1200,
  );
  await assert.rejects(
    fetchComprasgov(lookup, signal(), async () => new Response("<html/>")),
    { message: "comprasgov_invalid_response" },
  );
  await assert.rejects(
    fetchComprasgov(
      lookup,
      signal(),
      async () => new Response("x".repeat(2097153)),
    ),
    { message: "comprasgov_response_too_large" },
  );
});
