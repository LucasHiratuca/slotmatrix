/** Porta de Context Mapping: catalog e scheduling só enxergam direitos concedidos, nunca faturas/gateways. */
export interface WorkspaceEntitlements {
  subscriptionHealthy: boolean;
  maxActiveResources: number | null;
  maxBookingsPerMonth: number | null;
  smartWaitlistEnabled: boolean;
  securityDepositEnabled: boolean;
  publicBookingPortalEnabled: boolean;
  vipWaitlistPriorityEnabled: boolean;
  exportableAuditLogs: boolean;
  planLabel: string;
}

export interface WorkspaceEntitlementPolicy {
  forWorkspace(tenantId: string): Promise<WorkspaceEntitlements>;
}
