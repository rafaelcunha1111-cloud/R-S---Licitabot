import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomBytes } from "node:crypto";
import {
  oauthDiagnostic,
  googleExchangeError,
} from "../src/gmail-diagnostics.js";
import { readConfig } from "../src/config.js";
import { gmailCallback } from "../src/gmail-routes.js";
import { completeGmailAuthorization, encryptSecret } from "../src/gmail.js";
const key = randomBytes(32).toString("base64");
const config = readConfig({
  DATABASE_URL: "postgresql://localhost/licitabot_test",
  NODE_ENV: "test",
  GMAIL_CLIENT_ID: "fixture-client",
  GMAIL_CLIENT_SECRET: "fixture-secret",
  GMAIL_TOKEN_ENCRYPTION_KEY: key,
  GMAIL_REDIRECT_URI: "https://example.invalid/oauth/gmail/callback",
});
test("diagnóstico só divulga códigos permitidos, nunca erro ou descrição externa", () => {
  assert.equal(
    oauthDiagnostic(Error("invalid_oauth_state")).code,
    "invalid_oauth_state",
  );
  const unsafe = "sensitive-fixture-value";
  const result = oauthDiagnostic(Error(unsafe));
  assert.equal(result.code, "oauth_internal_error");
  assert.ok(!JSON.stringify(result).includes(unsafe));
  assert.equal(
    googleExchangeError({ error: "invalid_client", error_description: unsafe })
      .message,
    "oauth_invalid_client",
  );
  assert.equal(
    googleExchangeError({ error: unsafe }).message,
    "oauth_exchange_failed",
  );
  assert.equal(
    googleExchangeError({ error: "__proto__" }).message,
    "oauth_exchange_failed",
  );
});
test("troca OAuth distingue cliente incorreto, código inválido e rede sem expor resposta Google", async () => {
  const pool = {
    query: async () => ({
      rows: [
        {
          user_id: "fixture-user",
          verifier_encrypted: encryptSecret("fixture-verifier", key),
        },
      ],
    }),
  } as any;
  for (const [provider, expected] of [
    ["invalid_client", "oauth_invalid_client"],
    ["invalid_grant", "oauth_invalid_grant"],
    ["redirect_uri_mismatch", "oauth_redirect_mismatch"],
  ])
    await assert.rejects(
      completeGmailAuthorization(
        pool,
        config,
        "fixture-state",
        "fixture-code",
        async () =>
          new Response(
            JSON.stringify({
              error: provider,
              error_description: "not-to-be-returned",
            }),
            { status: 400 },
          ),
      ),
      { message: expected },
    );
  await assert.rejects(
    completeGmailAuthorization(
      pool,
      config,
      "fixture-state",
      "fixture-code",
      async () => {
        throw Error("not-to-be-returned");
      },
    ),
    { message: "oauth_token_network_error" },
  );
});
test("callback responde diagnóstico seguro sem refletir código, state ou falha SQL", async () => {
  const app = express();
  app.use(
    "/oauth",
    gmailCallback(
      {
        query: async () => {
          throw Error("private-database-detail-fixture");
        },
      } as any,
      config,
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/oauth/gmail/callback?state=private-state-fixture&code=private-code-fixture`,
    );
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /oauth_state_storage_failed/);
    for (const value of [
      "private-state-fixture",
      "private-code-fixture",
      "private-database-detail-fixture",
    ])
      assert.ok(!body.includes(value));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
