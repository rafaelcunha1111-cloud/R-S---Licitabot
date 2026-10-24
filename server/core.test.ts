import test from "node:test";
import assert from "node:assert/strict";
import { demoData } from "./data.js";
import {
  portalNames,
  connectors,
  UnconfiguredConnector,
} from "./connectors.js";
test("dashboard mantém referências de eventos válidas e prazos futuros", () => {
  const data = demoData();
  assert.equal(data.demo, true);
  assert.ok(data.sessions.length > 0);
  const ids = new Set(data.sessions.map((s) => s.id));
  assert.equal(ids.size, data.sessions.length);
  for (const event of data.events) assert.ok(ids.has(event.sessionId));
  for (const session of data.sessions) {
    assert.ok(
      portalNames.includes(session.portal as (typeof portalNames)[number]),
    );
    assert.ok(Date.parse(session.deadline) > Date.parse(data.generatedAt));
  }
});
test("todos os sete portais ficam desabilitados sem acesso homologado", async () => {
  assert.equal(connectors.length, 7);
  assert.equal(new Set(connectors.map((c) => c.portal)).size, 7);
  for (const c of connectors) {
    assert.equal(c.status, "not_configured");
    const adapter = new UnconfiguredConnector(c.portal);
    const context = { tenantId: "test", credentialReference: "test-reference" };
    await assert.rejects(adapter.authenticate(context), /não configurada/);
    await assert.rejects(adapter.fetchEvents(context), /desabilitado/);
  }
});
