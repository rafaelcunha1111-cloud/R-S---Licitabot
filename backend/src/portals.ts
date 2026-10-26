import { z } from "zod";
import {
  publicSnapshotSchema,
  ComprasgovPublicConnector,
} from "./comprasgov.js";
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
  publicSnapshot: publicSnapshotSchema.optional(),
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
  supportsReference?(value: string): boolean;
  collect(input: {
    externalRef: string;
    cursor?: string;
    signal: AbortSignal;
  }): Promise<Collected>;
}
// Only the documented public data lookup is enabled, never session chat/login.
export const productionConnectors: ReadonlyMap<string, AuthorizedConnector> =
  new Map([["Comprasnet", new ComprasgovPublicConnector()]]);
export const portalStatus = portals.map((portal, index) => ({
  portal,
  priority: index + 1,
  status:
    portal === "Comprasnet"
      ? "public_contract_data_available"
      : "pending_authorized_integration",
  scope: portal === "Comprasnet" ? "public_contract_data" : "not_configured",
  collectsMessages: false,
  collectsSummons: false,
  reason:
    portal === "Comprasnet"
      ? "Consulta oficial de dados públicos de contratações disponível por ID. Não coleta mensagens, convocações ou sessão ao vivo."
      : "Documentação e autorização de acesso ainda não validadas.",
}));
