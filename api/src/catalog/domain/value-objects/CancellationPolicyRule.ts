import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';
import { Money } from './Money';

export interface CancellationPolicyProps {
  fullRefundThresholdHours: number; // default 24h: >= 24h => 0% retido (100% reembolsado)
  partialRefundThresholdHours: number; // default 6h: [6h, 24h) => partialRetentionPercent retido
  partialRetentionPercent: number; // default 50%
}

export interface CancellationPenaltyOutcome {
  hoursBeforeStart: number;
  retained: Money;
  refunded: Money;
  tier: 'FULL_REFUND' | 'PARTIAL_RETENTION' | 'FULL_RETENTION' | 'NO_SHOW_RETENTION';
}

export class CancellationPolicyRule extends ValueObject<CancellationPolicyProps> {
  private constructor(props: CancellationPolicyProps) {
    super(props);
  }

  static create(input?: Partial<CancellationPolicyProps>): CancellationPolicyRule {
    const full = input?.fullRefundThresholdHours ?? 24;
    const partial = input?.partialRefundThresholdHours ?? 6;
    const pct = input?.partialRetentionPercent ?? 50;
    if (partial < 0 || full <= partial) {
      throw new ValidationError('fullRefundThresholdHours must be strictly greater than partialRefundThresholdHours >= 0');
    }
    if (!Number.isInteger(pct) || pct <= 0 || pct >= 100) {
      throw new ValidationError('partialRetentionPercent must be an integer between 1 and 99');
    }
    return new CancellationPolicyRule({
      fullRefundThresholdHours: full,
      partialRefundThresholdHours: partial,
      partialRetentionPercent: pct,
    });
  }

  static standard(): CancellationPolicyRule {
    return CancellationPolicyRule.create();
  }

  get fullRefundThresholdHours(): number { return this.props.fullRefundThresholdHours; }
  get partialRefundThresholdHours(): number { return this.props.partialRefundThresholdHours; }
  get partialRetentionPercent(): number { return this.props.partialRetentionPercent; }

  /** Calcula de forma determinística quanto do SecurityDeposit é retido vs. reembolsado no cancelamento. */
  evaluateCancellation(deposit: Money, bookingStartAt: Date, cancelledAt: Date): CancellationPenaltyOutcome {
    const hoursBeforeStart = (bookingStartAt.getTime() - cancelledAt.getTime()) / 3600_000;
    if (hoursBeforeStart >= this.props.fullRefundThresholdHours) {
      return {
        hoursBeforeStart,
        retained: Money.zero(deposit.currency),
        refunded: deposit,
        tier: 'FULL_REFUND',
      };
    }
    if (hoursBeforeStart >= this.props.partialRefundThresholdHours) {
      const retained = deposit.percentage(this.props.partialRetentionPercent);
      const refunded = deposit.subtract(retained);
      return {
        hoursBeforeStart,
        retained,
        refunded,
        tier: 'PARTIAL_RETENTION',
      };
    }
    return {
      hoursBeforeStart,
      retained: deposit,
      refunded: Money.zero(deposit.currency),
      tier: 'FULL_RETENTION',
    };
  }

  evaluateNoShow(deposit: Money): CancellationPenaltyOutcome {
    return {
      hoursBeforeStart: 0,
      retained: deposit,
      refunded: Money.zero(deposit.currency),
      tier: 'NO_SHOW_RETENTION',
    };
  }
}
