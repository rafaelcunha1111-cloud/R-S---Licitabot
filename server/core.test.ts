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
import {
  initialSnapshot,
  upsertSession,
  deadlineAlerts,
  validateSession,
} from "../src/local.js";
test("cadastro manual persiste em snapshot serializável e edição não duplica sessão", () => {
  const initial = initialSnapshot();
  const session = {
    ...initial.sessions[0],
    id: "manual-1",
    status: "Convocação",
  };
  const created = upsertSession(initial, session);
  assert.equal(created.sessions.length, initial.sessions.length + 1);
  assert.equal(created.sessions[0].source, "manual");
  assert.equal(created.events[0].kind, "summons");
  const restored = JSON.parse(JSON.stringify(created));
  const updated = upsertSession(restored, { ...session, status: "Em análise" });
  assert.equal(updated.sessions.length, created.sessions.length);
  assert.equal(updated.sessions[0].status, "Em análise");
  assert.equal(initial.sessions.length, 5);
});
test("validação rejeita prazo inválido, valor negativo e campo obrigatório vazio", () => {
  const session = initialSnapshot().sessions[0];
  assert.throws(() => validateSession({ ...session, deadline: "invalid" }));
  assert.throws(() => validateSession({ ...session, value: -1 }));
  assert.throws(() => validateSession({ ...session, number: " " }));
});
test("alertas distinguem vencidos e próximos, ignoram encerrados e preservam identidade", () => {
  const now = Date.now();
  const initial = initialSnapshot();
  initial.sessions = [
    { ...initial.sessions[0], deadline: new Date(now - 60000).toISOString() },
  ];
  const alerts = deadlineAlerts(initial, now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "Prazo vencido");
  assert.equal(alerts[0].id, deadlineAlerts(initial, now + 1)[0].id);
  initial.sessions[0].deadline = new Date(now + 3600000).toISOString();
  assert.equal(
    deadlineAlerts(initial, now)[0].title,
    "Prazo nas próximas 24 horas",
  );
  initial.sessions[0].status = "Encerrada";
  assert.equal(deadlineAlerts(initial, now).length, 0);
});
