import { demoData } from "../server/data";
export type Session = ReturnType<typeof demoData>["sessions"][number] & {
  source?: "demo" | "manual";
};
export type Event = ReturnType<typeof demoData>["events"][number];
export type Snapshot = { sessions: Session[]; events: Event[]; read: string[] };
export const storageKey = "licitabot.workspace.v1";
export function initialSnapshot(): Snapshot {
  const d = demoData();
  return {
    sessions: d.sessions.map((s) => ({ ...s, source: "demo" })),
    events: d.events,
    read: [],
  };
}
export function validateSession(input: Session): Session {
  for (const key of [
    "number",
    "agency",
    "object",
    "portal",
    "status",
    "stage",
  ] as const)
    if (!input[key]?.trim() || input[key].length > 500)
      throw Error(
        "Preencha os campos obrigatórios (máximo de 500 caracteres).",
      );
  if (!Number.isFinite(Date.parse(input.deadline)))
    throw Error("Informe um prazo válido.");
  if (!Number.isFinite(input.value) || input.value < 0)
    throw Error("Informe um valor estimado válido.");
  return { ...input, source: "manual" };
}
export function upsertSession(snapshot: Snapshot, input: Session): Snapshot {
  const session = validateSession(input);
  const previous = snapshot.sessions.find((s) => s.id === session.id);
  const event: Event = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    kind: session.status === "Convocação" ? "summons" : "session",
    title:
      session.status === "Convocação"
        ? "Convocação registrada manualmente"
        : "Cadastro atualizado manualmente",
    text: `${session.stage}. Prazo informado: ${new Date(session.deadline).toLocaleString("pt-BR")}. Informação não verificada no portal.`,
    portal: session.portal,
    time: new Date().toISOString(),
  };
  return {
    ...snapshot,
    sessions: previous
      ? snapshot.sessions.map((s) => (s.id === session.id ? session : s))
      : [session, ...snapshot.sessions],
    events: [event, ...snapshot.events],
  };
}
export function deadlineAlerts(snapshot: Snapshot, now = Date.now()): Event[] {
  return snapshot.sessions
    .filter(
      (s) =>
        s.status !== "Encerrada" && Date.parse(s.deadline) <= now + 86400000,
    )
    .map((s) => ({
      id: `deadline:${s.id}:${s.deadline}`,
      sessionId: s.id,
      kind: "deadline",
      title:
        Date.parse(s.deadline) < now
          ? "Prazo vencido"
          : "Prazo nas próximas 24 horas",
      text: `${s.number}: ${s.stage}. ${s.source === "manual" ? "Cadastro manual, sem confirmação no portal." : "Prazo demonstrativo."}`,
      portal: s.portal,
      time: s.deadline,
    }));
}
