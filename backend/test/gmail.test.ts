import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readConfig } from "../src/config.js";
import {
  encryptSecret,
  decryptSecret,
  gmailRaw,
  sendGmail,
  gmailScopes,
} from "../src/gmail.js";
import { sendNotification } from "../src/providers.js";
const key = randomBytes(32).toString("base64");
const config = readConfig({
  DATABASE_URL: "postgresql://localhost/licitabot_test",
  NODE_ENV: "test",
  EMAIL_PROVIDER: "gmail",
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-placeholder",
  GMAIL_REDIRECT_URI: "https://example.invalid/oauth/gmail/callback",
  GMAIL_TOKEN_ENCRYPTION_KEY: key,
});
const fixture = {
  id: "test-message-id",
  channel: "email" as const,
  email: "test@example.invalid",
  phone: null,
  title: "Teste — convocação",
  body: "Somente fixture de teste.",
};
test("tokens Gmail são criptografados com autenticação; chave errada e adulteração falham", () => {
  const encrypted = encryptSecret("fixture-token", key);
  assert.equal(encrypted.includes("fixture-token"), false);
  assert.equal(decryptSecret(encrypted, key), "fixture-token");
  assert.throws(() =>
    decryptSecret(encrypted, randomBytes(32).toString("base64")),
  );
  const parts = encrypted.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => decryptSecret(parts.join("."), key));
});
test("MIME Gmail codifica UTF-8 e rejeita injeção de cabeçalhos", () => {
  const raw = Buffer.from(gmailRaw(config, fixture), "base64url").toString();
  assert.match(raw, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.throws(() =>
    gmailRaw(config, {
      ...fixture,
      email: "test@example.invalid\r\nBcc: victim@example.invalid",
    }),
  );
  assert.ok(
    !gmailScopes.some(
      (scope) => scope.includes("gmail.read") || scope.includes("gmail.modify"),
    ),
  );
});
const pool = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as any;
test("sem OAuth autorizado Gmail fica pendente e não chama a rede", async () => {
  let called = false;
  assert.equal(
    (
      await sendGmail(pool([]), config, fixture, async () => {
        called = true;
        throw Error();
      })
    ).status,
    "pending_configuration",
  );
  assert.equal(called, false);
});
test("Gmail renova acesso, envia apenas ao endpoint oficial e registra aceitação sem presumir entrega", async () => {
  const destinations: string[] = [];
  const result = await sendGmail(
    pool([{ refresh_token_encrypted: encryptSecret("fixture-refresh", key) }]),
    config,
    fixture,
    async (url, init) => {
      destinations.push(String(url));
      if (destinations.length === 1)
        return new Response(JSON.stringify({ access_token: "fixture-access" }));
      assert.equal(
        (init?.headers as any).Authorization,
        "Bearer fixture-access",
      );
      return new Response(JSON.stringify({ id: "fixture-gmail-id" }));
    },
  );
  assert.deepEqual(destinations, [
    "https://oauth2.googleapis.com/token",
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  ]);
  assert.equal(result.status, "provider_accepted");
});
test("Gmail timeout após envio fica desconhecido, nunca retry cego", async () => {
  let calls = 0;
  const result = await sendGmail(
    pool([{ refresh_token_encrypted: encryptSecret("fixture-refresh", key) }]),
    config,
    fixture,
    async () => {
      if (++calls === 1)
        return new Response(JSON.stringify({ access_token: "fixture-access" }));
      throw Error("timeout");
    },
  );
  assert.equal(result.status, "delivery_unknown");
});
test("OAuth revogado exige reautorização sem expor resposta de token", async () => {
  const result = await sendGmail(
    pool([{ refresh_token_encrypted: encryptSecret("fixture-refresh", key) }]),
    config,
    fixture,
    async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
  );
  assert.deepEqual(result, {
    status: "pending_configuration",
    code: "gmail_reauthorization_required",
  });
});
test("WhatsApp desativado ignora credenciais presentes sem chamar a rede", async () => {
  const c = {
    ...config,
    WHATSAPP_TOKEN: "fixture",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_GRAPH_VERSION: "v25.0",
    WHATSAPP_TEMPLATE: "fixture",
  };
  let calls = 0;
  const result = await sendNotification(
    c,
    { ...fixture, channel: "whatsapp", phone: "+5511999990000" },
    async () => {
      calls++;
      throw Error();
    },
  );
  assert.equal(result.status, "pending_configuration");
  assert.equal(calls, 0);
});
