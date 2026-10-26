import test from "node:test";
import assert from "node:assert/strict";
import { notificationProvider } from "../src/queue.js";
import { readConfig } from "../src/config.js";
const config = readConfig({
  DATABASE_URL: "postgresql://localhost/test",
  NODE_ENV: "test",
  EMAIL_PROVIDER: "gmail",
});
const job = {
  channel: "email",
  provider: "resend" as const,
  status: "pending_configuration",
  attempts: 0,
  last_error: "provider_not_configured",
  accepted_at: null,
  provider_id: null,
};
test("fila acompanha troca para Gmail apenas quando bloqueada antes de qualquer tentativa de envio", () => {
  assert.equal(notificationProvider(job, config), "gmail");
  assert.equal(
    notificationProvider(
      { ...job, channel: "whatsapp", provider: "whatsapp" },
      config,
    ),
    "whatsapp",
  );
});
test("troca de provedor não reenvia mensagens já tentadas, aceitas ou de resultado incerto", () => {
  for (const changed of [
    { attempts: 1 },
    { provider_id: "fixture-provider" },
    { accepted_at: new Date() },
    { status: "delivery_unknown" },
    { last_error: "network_outcome_unknown" },
    { status: "retry" },
  ])
    assert.equal(
      notificationProvider({ ...job, ...changed }, config),
      "resend",
    );
});
