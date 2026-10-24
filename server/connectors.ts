export const portalNames = [
  "Comprasnet",
  "BLL",
  "BNC",
  "Licitanet",
  "Licitar Digital",
  "Portal de Compras Públicas",
  "BBMNET",
] as const;
export type Portal = (typeof portalNames)[number];
export interface PortalEvent {
  id: string;
  externalId: string;
  portal: Portal;
  kind: "message" | "summons" | "deadline" | "session";
  occurredAt: string;
  text: string;
}
export interface AccessContext {
  tenantId: string;
  credentialReference: string;
  signal?: AbortSignal;
}
export interface PortalConnector {
  portal: Portal;
  authenticate(context: AccessContext): Promise<void>;
  fetchEvents(
    context: AccessContext,
    cursor?: string,
  ): Promise<{ events: PortalEvent[]; cursor?: string }>;
}
// No speculative endpoints or automated login. Enable adapters only after authorized access is documented.
export const connectors = portalNames.map((portal) => ({
  portal,
  status: "not_configured" as const,
  mode: "official_access_required" as const,
  capabilities: [] as string[],
}));
export class UnconfiguredConnector implements PortalConnector {
  constructor(public portal: Portal) {}
  async authenticate(_context: AccessContext): Promise<void> {
    throw new Error(
      `Integração ${this.portal} não configurada: requer acesso autorizado e documentação oficial.`,
    );
  }
  async fetchEvents(
    _context: AccessContext,
    _cursor?: string,
  ): Promise<{ events: PortalEvent[]; cursor?: string }> {
    throw new Error("Conector desabilitado até homologação do acesso.");
  }
}
