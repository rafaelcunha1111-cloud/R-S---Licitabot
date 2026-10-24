import { z } from "zod";
export const portals = [
  "Comprasnet",
  "BLL",
  "BNC",
  "Licitanet",
  "Licitar Digital",
  "Portal de Compras Públicas",
  "BBMNET",
] as const;
export const collectedSchema = z.object({
  cursor: z.string().max(1000).optional(),
  sessions: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        status: z.string().min(1).max(200),
      }),
    )
    .max(1000),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        kind: z.enum(["message", "summons"]),
        body: z.string().min(1).max(20000),
        occurredAt: z.string().datetime({ offset: true }),
      }),
    )
    .max(1000),
  deadlines: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        title: z.string().min(1).max(500),
        dueAt: z.string().datetime({ offset: true }),
      }),
    )
    .max(1000),
});
export type Collected = z.infer<typeof collectedSchema>;
export interface AuthorizedConnector {
  portal: (typeof portals)[number];
  collect(input: {
    externalRef: string;
    cursor?: string;
    signal: AbortSignal;
  }): Promise<Collected>;
}
// Intentionally empty. No endpoint, HTML scraping or login flow has been homologated.
export const productionConnectors: ReadonlyMap<string, AuthorizedConnector> =
  new Map();
export const portalStatus = portals.map((portal, index) => ({
  portal,
  priority: index + 1,
  status: "pending_authorized_integration",
  collectsMessages: false,
  collectsSummons: false,
  reason:
    portal === "Comprasnet"
      ? "Dados abertos de contratações não equivalem ao chat das sessões. Interface de mensagens/convocações não homologada."
      : "Documentação e autorização de acesso ainda não validadas.",
}));
