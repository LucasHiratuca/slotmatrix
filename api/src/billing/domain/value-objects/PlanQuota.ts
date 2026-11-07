import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

export type PlanCode = 'STARTER' | 'PRO' | 'ENTERPRISE';
export const PLAN_CODES: PlanCode[] = ['STARTER', 'PRO', 'ENTERPRISE'];

export interface PlanQuotaProps {
  plan: PlanCode;
  maxActiveResources: number | null; // null = ilimitado
  maxBookingsPerMonth: number | null; // null = ilimitado
  smartWaitlistEnabled: boolean;
  securityDepositEnabled: boolean;
  publicBookingPortalEnabled: boolean;
  vipWaitlistPriorityEnabled: boolean;
  exportableAuditLogs: boolean;
}

const CATALOG: Record<PlanCode, PlanQuotaProps> = {
  STARTER: {
    plan: 'STARTER',
    maxActiveResources: 5,
    maxBookingsPerMonth: 100,
    smartWaitlistEnabled: false,
    securityDepositEnabled: false,
    publicBookingPortalEnabled: false,
    vipWaitlistPriorityEnabled: false,
    exportableAuditLogs: false,
  },
  PRO: {
    plan: 'PRO',
    maxActiveResources: 40,
    maxBookingsPerMonth: null,
    smartWaitlistEnabled: true,
    securityDepositEnabled: true,
    publicBookingPortalEnabled: true,
    vipWaitlistPriorityEnabled: false,
    exportableAuditLogs: false,
  },
  ENTERPRISE: {
    plan: 'ENTERPRISE',
    maxActiveResources: null,
    maxBookingsPerMonth: null,
    smartWaitlistEnabled: true,
    securityDepositEnabled: true,
    publicBookingPortalEnabled: true,
    vipWaitlistPriorityEnabled: true,
    exportableAuditLogs: true,
  },
};

export class PlanQuota extends ValueObject<PlanQuotaProps> {
  private constructor(props: PlanQuotaProps) {
    super(props);
  }

  static forPlan(plan: PlanCode): PlanQuota {
    const props = CATALOG[plan];
    if (!props) throw new ValidationError(`Unknown plan: ${plan}`);
    return new PlanQuota(props);
  }

  get plan(): PlanCode { return this.props.plan; }
  get maxActiveResources(): number | null { return this.props.maxActiveResources; }
  get maxBookingsPerMonth(): number | null { return this.props.maxBookingsPerMonth; }
  get smartWaitlistEnabled(): boolean { return this.props.smartWaitlistEnabled; }
  get securityDepositEnabled(): boolean { return this.props.securityDepositEnabled; }
  get publicBookingPortalEnabled(): boolean { return this.props.publicBookingPortalEnabled; }
  get vipWaitlistPriorityEnabled(): boolean { return this.props.vipWaitlistPriorityEnabled; }
  get exportableAuditLogs(): boolean { return this.props.exportableAuditLogs; }
}
