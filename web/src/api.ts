export type PlanCode = 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PLAN_LIMITS_FALLBACK: Record<PlanCode, { maxActiveResources: number | null; label: string }> = {
  STARTER: { maxActiveResources: 5, label: 'STARTER' },
  PRO: { maxActiveResources: 40, label: 'PRO' },
  ENTERPRISE: { maxActiveResources: null, label: 'ENTERPRISE' },
};

export function normalizePlanCode(rawPlan?: string | null): PlanCode {
  const upper = (rawPlan ?? '').trim().toUpperCase();
  if (upper === 'PRO') return 'PRO';
  if (upper === 'ENTERPRISE') return 'ENTERPRISE';
  return 'STARTER';
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST';
  plan: PlanCode;
  subscriptionStatus: string | null;
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | null;
  subscription: {
    plan: PlanCode;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    externalCustomerId?: string | null;
  } | null;
  entitlements: {
    planLabel: string;
    subscriptionHealthy: boolean;
    isSubscriptionOperational?: boolean;
    maxActiveResources: number | null;
    maxBookingsPerMonth: number | null;
    smartWaitlistEnabled: boolean;
    securityDepositEnabled: boolean;
    publicBookingPortalEnabled: boolean;
    vipWaitlistPriorityEnabled: boolean;
    exportableAuditLogs: boolean;
  };
  quota: {
    resourcesUsed: number;
    resourcesMax: number | null;
    usagePercent: number;
  };
  usage?: {
    activeResources?: number;
    maxActiveResources?: number | null;
  };
}

export function resolveWorkspaceQuota(overview: WorkspaceOverview | null | undefined): {
  plan: PlanCode;
  status: string;
  activeResources: number;
  maxActiveResources: number | null;
  isAtQuotaLimit: boolean;
} {
  const plan = normalizePlanCode(overview?.subscription?.plan ?? overview?.entitlements?.planLabel);
  const status = overview?.subscription?.status ?? 'TRIALING';
  const activeResources =
    overview?.quota?.resourcesUsed ??
    overview?.usage?.activeResources ??
    0;

  const hasExplicitQuota =
    overview?.quota !== undefined && overview?.quota !== null && 'resourcesMax' in overview.quota;
  const hasExplicitEntitlement =
    overview?.entitlements !== undefined && overview?.entitlements !== null && 'maxActiveResources' in overview.entitlements;
  const hasExplicitUsage =
    overview?.usage !== undefined && overview?.usage !== null && 'maxActiveResources' in overview.usage;

  const maxActiveResources = hasExplicitQuota
    ? overview!.quota.resourcesMax
    : hasExplicitEntitlement
    ? overview!.entitlements.maxActiveResources
    : hasExplicitUsage
    ? (overview!.usage!.maxActiveResources ?? null)
    : PLAN_LIMITS_FALLBACK[plan].maxActiveResources;

  const isAtQuotaLimit =
    maxActiveResources !== null &&
    maxActiveResources !== undefined &&
    activeResources >= maxActiveResources;

  return {
    plan,
    status,
    activeResources,
    maxActiveResources,
    isAtQuotaLimit,
  };
}

export interface BookableResourceDto {
  id: string;
  name: string;
  category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
  status: 'ACTIVE' | 'IN_MAINTENANCE' | 'ARCHIVED';
  capabilities: string[];
  weeklyWindows: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  maintenanceBlocks: { id: string; startAt: string; endAt: string; reason: string }[];
  createdAt: string;
}

export interface ServiceProcedureDto {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  depositCents: number;
  currency: string;
  cancellationPolicy: {
    fullRefundThresholdHours: number;
    partialRefundThresholdHours: number;
    partialRetentionPercent: number;
  };
  requirements: {
    category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
    requiredCapabilities: string[];
    prepMinutes: number;
    cleanupMinutes: number;
  }[];
  active: boolean;
}

export interface BookingAllocationDto {
  resourceId: string;
  resourceName: string;
  category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
  serviceStartAt: string;
  serviceEndAt: string;
  prepMinutes: number;
  cleanupMinutes: number;
  effectiveStartAt: string;
  effectiveEndAt: string;
}

export interface BookingDto {
  id: string;
  procedureId: string;
  procedureName: string;
  clientName: string;
  clientEmail: string;
  startAt: string;
  endAt: string;
  status: 'PENDING_DEPOSIT' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'EXPIRED';
  priceCents: number;
  currency: string;
  depositCents: number;
  depositStatus: string;
  depositExpiresAt: string | null;
  retainedCents: number;
  refundedCents: number;
  cancellationReason: string | null;
  originWaitlistEntryId: string | null;
  allocations: BookingAllocationDto[];
  createdAt: string;
}

export interface WaitlistEntryDto {
  id: string;
  procedureId: string;
  clientName: string;
  clientEmail: string;
  desiredStartAt: string;
  desiredEndAt: string;
  priority: 'STANDARD' | 'VIP';
  status: 'WAITING' | 'OFFERED' | 'CLAIMED' | 'OFFER_EXPIRED' | 'CANCELLED';
  activeOffer: {
    offeredStartAt: string;
    offeredEndAt: string;
    slotStartAt?: string;
    slotEndAt?: string;
    reservedResourceIds: string[];
    offeredAt: string;
    expiresAt: string;
  } | null;
  claimedBookingId: string | null;
  createdAt: string;
}

export interface TimelineMatrixResponse {
  date: string;
  resources: {
    resource: BookableResourceDto;
    allocations: {
      bookingId: string;
      procedureName: string;
      clientName: string;
      bookingStatus: string;
      serviceStartAt: string;
      serviceEndAt: string;
      prepMinutes: number;
      cleanupMinutes: number;
      effectiveStartAt: string;
      effectiveEndAt: string;
    }[];
    waitlistOfferHolds: {
      waitlistEntryId: string;
      clientName: string;
      offeredStartAt: string;
      offeredEndAt: string;
      expiresAt: string;
    }[];
  }[];
}

export interface KpiSummaryDto {
  totalBookings: number;
  confirmedOrCompletedBookings: number;
  noShowCount: number;
  noShowRatePercent: number;
  protectedRevenueCents: number;
  waitlistRecoveredBookings: number;
  waitlistRecoveredRevenueCents: number;
  activeWaitlistOffers: number;
  waitingInQueue: number;
  utilizationByCategory: Record<
    string,
    { activeResources: number; occupiedMinutes: number; utilizationPercent: number }
  >;
}

export interface AdminMetricsDto {
  mrrCents: number;
  mrrFormatted: string;
  activeSubscriptionsCount: number;
  distribution: Record<string, { total: number; active: number }>;
  recentLogs: {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    userId: string;
    details: any;
    occurredAt: string;
  }[];
}

export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function formatMoneyBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents ?? 0) / 100);
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    workspaceId?: string | null;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.workspaceId) {
    headers['x-workspace-id'] = options.workspaceId;
  }

  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiHttpError(
      res.status,
      data.error ?? 'API_ERROR',
      data.message ?? `HTTP ${res.status}`,
    );
  }
  return data as T;
}
