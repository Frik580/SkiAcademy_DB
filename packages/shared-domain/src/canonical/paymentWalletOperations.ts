import { z } from 'zod';
import {
  derivePaymentStatus,
  deriveRetainedAmount,
  validatePaymentAccounting,
  type PaymentAccountingFields,
  type PaymentStatus,
} from './paymentWallet';
import { KztMinorUnitsSchema, type KztMinorUnits } from './primitives';
import { MonetaryPaymentEffectSchema } from './paymentWallet';

export interface PaymentAccountingProjection extends PaymentAccountingFields {
  readonly paymentStatus: PaymentStatus;
}

export class PaymentAccountingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentAccountingInvariantError';
  }
}

export class InsufficientWalletFundsError extends Error {
  constructor(message = 'Wallet balance is insufficient') {
    super(message);
    this.name = 'InsufficientWalletFundsError';
  }
}

function projectPayment(fields: PaymentAccountingFields): PaymentAccountingProjection {
  const retainedAmount = deriveRetainedAmount(fields.paidAmount, fields.refundedAmount);
  const accounting: PaymentAccountingFields = { ...fields, retainedAmount };
  const issues: z.ZodIssue[] = [];
  validatePaymentAccounting(accounting, {
    addIssue: (issue) => {
      issues.push(issue as z.ZodIssue);
    },
  } as z.RefinementCtx);
  if (issues.length > 0) {
    throw new PaymentAccountingInvariantError(issues[0]?.message ?? 'Invalid payment accounting');
  }
  return {
    ...accounting,
    paymentStatus: derivePaymentStatus(accounting),
  };
}

function applyDeltas(
  current: PaymentAccountingFields,
  deltas: {
    readonly priceDelta?: number;
    readonly paidAmountDelta?: number;
    readonly refundedAmountDelta?: number;
    readonly settledAmountDelta?: number;
    readonly writtenOffAmountDelta?: number;
    readonly outstandingAmountDelta?: number;
  }
): PaymentAccountingFields {
  return {
    originalPrice: current.originalPrice,
    price: KztMinorUnitsSchema.parse(current.price + (deltas.priceDelta ?? 0)),
    paidAmount: KztMinorUnitsSchema.parse(current.paidAmount + (deltas.paidAmountDelta ?? 0)),
    refundedAmount: KztMinorUnitsSchema.parse(
      current.refundedAmount + (deltas.refundedAmountDelta ?? 0)
    ),
    retainedAmount: current.retainedAmount,
    settledAmount: KztMinorUnitsSchema.parse(
      current.settledAmount + (deltas.settledAmountDelta ?? 0)
    ),
    writtenOffAmount: KztMinorUnitsSchema.parse(
      current.writtenOffAmount + (deltas.writtenOffAmountDelta ?? 0)
    ),
    outstandingAmount: KztMinorUnitsSchema.parse(
      current.outstandingAmount + (deltas.outstandingAmountDelta ?? 0)
    ),
  };
}

export function creditWalletBalance(balance: KztMinorUnits, amount: KztMinorUnits): KztMinorUnits {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive');
  }
  return KztMinorUnitsSchema.parse(balance + amount);
}

export function debitWalletBalance(
  balance: KztMinorUnits,
  amount: KztMinorUnits
): KztMinorUnits {
  if (amount <= 0) {
    throw new Error('Debit amount must be positive');
  }
  if (balance < amount) {
    throw new InsufficientWalletFundsError();
  }
  return KztMinorUnitsSchema.parse(balance - amount);
}

export function applyRefundDelta(
  payment: PaymentAccountingFields,
  refundDelta: KztMinorUnits
): PaymentAccountingProjection {
  if (refundDelta <= 0) {
    throw new PaymentAccountingInvariantError('Refund delta must be positive');
  }
  if (refundDelta > payment.paidAmount - payment.refundedAmount) {
    throw new PaymentAccountingInvariantError('Refund exceeds available paid amount');
  }
  return projectPayment(
    applyDeltas(payment, {
      refundedAmountDelta: refundDelta,
    })
  );
}

export function applyWriteOffAmount(
  payment: PaymentAccountingFields,
  amount: KztMinorUnits
): PaymentAccountingProjection {
  if (amount <= 0) {
    throw new PaymentAccountingInvariantError('Write-off amount must be positive');
  }
  if (amount > payment.outstandingAmount) {
    throw new PaymentAccountingInvariantError('Write-off exceeds outstanding obligation');
  }
  return projectPayment(
    applyDeltas(payment, {
      writtenOffAmountDelta: amount,
      outstandingAmountDelta: -amount,
    })
  );
}

export interface ReplacementObligationFundingResult {
  readonly payment: PaymentAccountingProjection;
  readonly appliedAmount: KztMinorUnits;
  readonly remainder: KztMinorUnits;
}

export function applyReplacementThenObligationFunding(
  payment: PaymentAccountingFields,
  fundingAmount: KztMinorUnits
): ReplacementObligationFundingResult {
  if (fundingAmount <= 0) {
    throw new PaymentAccountingInvariantError('Funding amount must be positive');
  }

  let remaining = fundingAmount;
  let paidAmount = payment.paidAmount;
  let settledAmount = payment.settledAmount;
  let outstandingAmount = payment.outstandingAmount;
  const retainedAmount = deriveRetainedAmount(payment.paidAmount, payment.refundedAmount);

  const replacementFunding = Math.min(remaining, settledAmount - retainedAmount);
  paidAmount = KztMinorUnitsSchema.parse(paidAmount + replacementFunding);
  remaining = KztMinorUnitsSchema.parse(remaining - replacementFunding);

  const obligationFunding = Math.min(remaining, outstandingAmount);
  paidAmount = KztMinorUnitsSchema.parse(paidAmount + obligationFunding);
  settledAmount = KztMinorUnitsSchema.parse(settledAmount + obligationFunding);
  outstandingAmount = KztMinorUnitsSchema.parse(outstandingAmount - obligationFunding);
  remaining = KztMinorUnitsSchema.parse(remaining - obligationFunding);

  if (remaining > 0) {
    throw new PaymentAccountingInvariantError('Unallocated funding remainder');
  }

  const projection = projectPayment({
    ...payment,
    paidAmount,
    settledAmount,
    outstandingAmount,
    retainedAmount: deriveRetainedAmount(paidAmount, payment.refundedAmount),
  });

  return {
    payment: projection,
    appliedAmount: fundingAmount,
    remainder: KztMinorUnitsSchema.parse(0),
  };
}

export function applyExternalPaymentFunding(
  payment: PaymentAccountingFields,
  amount: KztMinorUnits
): PaymentAccountingProjection {
  return applyReplacementThenObligationFunding(payment, amount).payment;
}

export interface PriceIncreaseResult {
  readonly payment: PaymentAccountingProjection;
  readonly priceDelta: KztMinorUnits;
}

export function applyPriceIncrease(
  payment: PaymentAccountingFields,
  delta: KztMinorUnits
): PriceIncreaseResult {
  if (delta <= 0) {
    throw new PaymentAccountingInvariantError('Price increase delta must be positive');
  }

  const increased = projectPayment(
    applyDeltas(payment, {
      priceDelta: delta,
      outstandingAmountDelta: delta,
    })
  );

  return { payment: increased, priceDelta: delta };
}

export interface PriceDecreaseResult {
  readonly payment: PaymentAccountingProjection;
  readonly refundDelta: KztMinorUnits;
}

export function applyPriceDecrease(
  payment: PaymentAccountingFields,
  newPrice: KztMinorUnits
): PriceDecreaseResult {
  if (newPrice < 0) {
    throw new PaymentAccountingInvariantError('New price must be non-negative');
  }
  if (newPrice >= payment.price) {
    throw new PaymentAccountingInvariantError('New price must be lower than current price');
  }

  const retainedBefore = deriveRetainedAmount(payment.paidAmount, payment.refundedAmount);
  let reduction = payment.price - newPrice;
  let outstandingAmount = payment.outstandingAmount;
  let writtenOffAmount = payment.writtenOffAmount;
  let settledAmount = payment.settledAmount;

  let cut = Math.min(reduction, outstandingAmount);
  outstandingAmount = KztMinorUnitsSchema.parse(outstandingAmount - cut);
  reduction = KztMinorUnitsSchema.parse(reduction - cut);

  cut = Math.min(reduction, writtenOffAmount);
  writtenOffAmount = KztMinorUnitsSchema.parse(writtenOffAmount - cut);
  reduction = KztMinorUnitsSchema.parse(reduction - cut);

  settledAmount = KztMinorUnitsSchema.parse(settledAmount - reduction);

  let refundedAmount = payment.refundedAmount;
  let paidAmount = payment.paidAmount;
  const additionalRefund = Math.max(0, retainedBefore - settledAmount);
  if (additionalRefund > 0) {
    refundedAmount = KztMinorUnitsSchema.parse(refundedAmount + additionalRefund);
    paidAmount = payment.paidAmount;
  }

  const projection = projectPayment({
    originalPrice: payment.originalPrice,
    price: newPrice,
    paidAmount,
    refundedAmount,
    retainedAmount: deriveRetainedAmount(paidAmount, refundedAmount),
    settledAmount,
    writtenOffAmount,
    outstandingAmount,
  });

  return { payment: projection, refundDelta: KztMinorUnitsSchema.parse(additionalRefund) };
}

export function applyPriceIncreaseWithFunding(
  payment: PaymentAccountingFields,
  delta: KztMinorUnits,
  fundingAmount: KztMinorUnits
): PaymentAccountingProjection {
  const increased = applyPriceIncrease(payment, delta);
  if (fundingAmount === 0) {
    return increased.payment;
  }
  return applyReplacementThenObligationFunding(increased.payment, fundingAmount).payment;
}

export function paymentEffectFromProjectionChange(
  before: PaymentAccountingFields,
  after: PaymentAccountingProjection
): z.output<typeof MonetaryPaymentEffectSchema> {
  const effect: Record<string, number> = {};
  if (after.price !== before.price) effect.priceDelta = after.price - before.price;
  if (after.paidAmount !== before.paidAmount) effect.paidAmountDelta = after.paidAmount - before.paidAmount;
  if (after.refundedAmount !== before.refundedAmount) {
    effect.refundedAmountDelta = after.refundedAmount - before.refundedAmount;
  }
  if (after.settledAmount !== before.settledAmount) {
    effect.settledAmountDelta = after.settledAmount - before.settledAmount;
  }
  if (after.writtenOffAmount !== before.writtenOffAmount) {
    effect.writtenOffAmountDelta = after.writtenOffAmount - before.writtenOffAmount;
  }
  if (after.outstandingAmount !== before.outstandingAmount) {
    effect.outstandingAmountDelta = after.outstandingAmount - before.outstandingAmount;
  }
  return MonetaryPaymentEffectSchema.parse(effect);
}

export function assertNonNegativeKzt(value: KztMinorUnits, field: string): void {
  if (value < 0) {
    throw new PaymentAccountingInvariantError(`${field} must be non-negative`);
  }
}
