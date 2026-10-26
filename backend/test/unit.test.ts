import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { readConfig } from "../src/config.js";
import { hashPassword, verifyPassword, hashToken } from "../src/auth.js";
import { sendNotification } from "../src/providers.js";
import { validMetaSignature } from "../src/webhooks.js";
import { productionConnectors, portalStatus } from "../src/portals.js";
const config = readConfig({
  DATABASE_URL: "postgresql://localhost/licitabot_test",
  NODE_ENV: "test",
});
const message = {
  channel: "email" as const,
  id: "test-idempotency",
  email: "test@example.invalid",
  phone: null,
  title: "Alerta de teste",
  body: "Fixture de teste, não enviada.",
};
test("scrypt verifica senha, hashes e tokens não armazenam texto original", async () => {
  const hash = await hashPassword("fixture-password-only");
  assert.equal(await verifyPassword("fixture-password-only", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(hash.includes("fixture-password-only"), false);
  assert.equal(hashToken("test-token").length, 64);
});
test("configuração exige origem exata e HTTPS em produção", () => {
  assert.throws(() =>
    readConfig({
      DATABASE_URL: "postgresql://localhost/test",
      NODE_ENV: "production",
      FRONTEND_ORIGIN: "http://example.com",
    }),
  );
  assert.throws(() =>
    readConfig({
      DATABASE_URL: "postgresql://localhost/test",
      FRONTEND_ORIGIN: "https://example.com/path",
    }),
  );
  assert.equal(
    readConfig({
      ...process.env,
      DATABASE_URL: "postgresql://localhost/test",
      NODE_ENV: "production",
      FRONTEND_ORIGIN: "https://example.com",
    }).FRONTEND_ORIGIN,
    "https://example.com",
  );
});
test("provedor sem credenciais fica pendente e nunca chama rede", async () => {
  let called = false;
  const result = await sendNotification(config, message, async () => {
    called = true;
    throw Error();
  });
  assert.equal(result.status, "pending_configuration");
  assert.equal(called, false);
});
test("Resend envia idempotency-key, diferencia aceitação de entrega e respeita 429", async () => {
  const c = {
    ...config,
    RESEND_API_KEY: "test-placeholder",
    EMAIL_FROM: "test@example.invalid",
  };
  let key = "";
  const result = await sendNotification(c, message, async (_url, init) => {
    key = (init?.headers as Record<string, string>)["Idempotency-Key"];
    return new Response(JSON.stringify({ id: "provider-test" }), {
      status: 200,
    });
  });
  assert.equal(key, message.id);
  assert.equal(result.status, "provider_accepted");
  assert.deepEqual(
    await sendNotification(
      c,
      message,
      async () =>
        new Response("", { status: 429, headers: { "retry-after": "600" } }),
    ),
    { status: "retry", code: "rate_limited", retrySeconds: 600 },
  );
});
test("WhatsApp não reenvia automaticamente uma tentativa com resultado desconhecido", async () => {
  const c = {
    ...config,
    WHATSAPP_ENABLED: true,
    WHATSAPP_TOKEN: "test-placeholder",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_GRAPH_VERSION: "v25.0",
    WHATSAPP_TEMPLATE: "fixture",
  };
  const result = await sendNotification(
    c,
    { ...message, channel: "whatsapp", phone: "+5511999990000" },
    async () => {
      throw Error("timeout");
    },
  );
  assert.equal(result.status, "delivery_unknown");
});
test("webhook Meta exige assinatura válida sem aceitar corpo adulterado", () => {
  const secret = randomBytes(32).toString("hex");
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(validMetaSignature(body, signature, secret), true);
  assert.equal(validMetaSignature(Buffer.from("{}"), signature, secret), false);
  assert.equal(validMetaSignature(body, undefined, secret), false);
});
test("nenhum portal finge conexão ou sucesso sem homologação", () => {
  assert.equal(productionConnectors.size, 1);
  assert.equal(portalStatus.length, 7);
  assert.ok(
    portalStatus.every(
      (p) =>
        !p.collectsMessages &&
        (p.portal === "Comprasnet"
          ? p.status === "public_contract_data_available"
          : p.status === "pending_authorized_integration"),
    ),
  );
});
