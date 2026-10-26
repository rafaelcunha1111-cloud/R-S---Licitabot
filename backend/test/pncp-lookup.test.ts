import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePncpControl,
  pncpLocation,
  pncpPreview,
  comprasgovErrorMessage,
} from "../../src/comprasgov-lookup.js";
import { comprasgovLookupSchema } from "../src/comprasgov.js";
const control = "00394684000153-1-000148/2026";
test("normaliza hífen antes do ano e separa localização PNCP sem inventar idCompra", () => {
  assert.equal(normalizePncpControl(control.replace("/", "-")), control);
  assert.equal(
    comprasgovLookupSchema.parse({
      type: "numeroControlePNCPCompra",
      code: control.replace("/", "-"),
    }).code,
    control,
  );
  assert.deepEqual(pncpLocation(control), {
    control,
    cnpj: "00394684000153",
    year: "2026",
    sequence: 148,
    publicUrl: "https://pncp.gov.br/app/editais/00394684000153/2026/148",
  });
  assert.equal(pncpLocation("https://untrusted.invalid"), undefined);
});
test("não encontrado significa ausência na base consultada, não inexistência da contratação", () => {
  const message = comprasgovErrorMessage({ code: "comprasgov_not_found" });
  assert.match(message.message, /não significa/);
  assert.match(message.message, /PNCP/);
});
test("prévia PNCP exige identificador correspondente e não abre URL insegura", () => {
  const data = {
    numeroControlePNCP: control,
    objetoCompra: "Fixture de teste",
    orgaoEntidade: { razaoSocial: "Órgão fixture" },
    linkSistemaOrigem: "javascript:alert(1)",
  };
  assert.equal(pncpPreview(data, "other"), undefined);
  assert.equal(pncpPreview(data, control)?.originUrl, undefined);
  assert.equal(
    pncpPreview(
      { ...data, linkSistemaOrigem: "https://source.example.invalid/processo" },
      control,
    )?.originUrl,
    "https://source.example.invalid/processo",
  );
  assert.equal(
    pncpPreview(
      {
        ...data,
        linkSistemaOrigem: "https://user:password@source.example.invalid",
      },
      control,
    )?.originUrl,
    undefined,
  );
});
