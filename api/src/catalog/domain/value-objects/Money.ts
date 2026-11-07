import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

export interface MoneyProps {
  amountCents: number;
  currency: string;
}

/** Aritmética monetária exata em centavos inteiros (sem erros de ponto flutuante). */
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static create(amountCents: number, currency = 'BRL'): Money {
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new ValidationError('Money amountCents must be a non-negative integer');
    }
    const curr = (currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(curr)) {
      throw new ValidationError('Currency must be a 3-letter ISO code');
    }
    return new Money({ amountCents, currency: curr });
  }

  static zero(currency = 'BRL'): Money {
    return Money.create(0, currency);
  }

  get amountCents(): number {
    return this.props.amountCents;
  }
  get currency(): string {
    return this.props.currency;
  }
  get isZero(): boolean {
    return this.props.amountCents === 0;
  }

  /** Calcula percentPercent (0..100) com arredondamento bancário inteiro em centavos. */
  percentage(percent: number): Money {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new ValidationError('Percentage must be between 0 and 100');
    }
    return Money.create(Math.round((this.props.amountCents * percent) / 100), this.props.currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this.props.amountCents + other.amountCents, this.props.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (other.amountCents > this.props.amountCents) {
      throw new ValidationError('Cannot subtract into negative Money');
    }
    return Money.create(this.props.amountCents - other.amountCents, this.props.currency);
  }

  private assertSameCurrency(other: Money) {
    if (this.props.currency !== other.currency) {
      throw new ValidationError(`Currency mismatch: ${this.props.currency} vs ${other.currency}`);
    }
  }
}
