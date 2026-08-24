import { describe, expect, it } from 'vitest';
import {
  KztMinorUnitsSchema,
  applyExternalPaymentFunding,
  applyPriceDecrease,
  applyPriceIncrease,
  applyPriceIncreaseWithFunding,
  applyRefundDelta,
  applyReplacementThenObligationFunding,
  applyWriteOffAmount,
  creditWalletBalance,
  debitWalletBalance,
  deriveRetainedAmount,
  InsufficientWalletFundsError,
  isPaymentFullyFundedForService,
  PaymentAccountingInvariantError,
  writeOffDoesNotAuthorizeService,
} from '@ski-academy/shared-domain';

function basePayment(overrides: Record<string, number> = {}) {
  return {
    originalPrice: KztMinorUnitsSchema.parse(100_000),
    price: KztMinorUnitsSchema.parse(100_000),
    paidAmount: KztMinorUnitsSchema.parse(100_000),
    refundedAmount: KztMinorUnitsSchema.parse(0),
    retainedAmount: KztMinorUnitsSchema.parse(100_000),
    settledAmount: KztMinorUnitsSchema.parse(100_000),
    writtenOffAmount: KztMinorUnitsSchema.parse(0),
    outstandingAmount: KztMinorUnitsSchema.parse(0),
    ...overrides,
  };
}

describe('payment wallet operations', () => {
  it('credits and debits wallet balance without going negative', () => {
    expect(creditWalletBalance(10_000, 5_000)).toBe(15_000);
    expect(debitWalletBalance(10_000, 4_000)).toBe(6_000);
    expect(() => debitWalletBalance(10_000, 10_001)).toThrow(InsufficientWalletFundsError);
  });

  it('applies replacement then obligation funding order', () => {
    const partiallyRefunded = basePayment({
      paidAmount: 100_000,
      refundedAmount: 20_000,
      retainedAmount: 80_000,
      settledAmount: 100_000,
      outstandingAmount: 0,
    });
    const result = applyReplacementThenObligationFunding(partiallyRefunded, 15_000);
    expect(result.payment.paidAmount).toBe(115_000);
    expect(result.payment.settledAmount).toBe(100_000);
    expect(result.payment.retainedAmount).toBe(95_000);
  });

  it('applies external payment funding to outstanding obligation', () => {
    const underpaid = basePayment({
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
    });
    const funded = applyExternalPaymentFunding(underpaid, 20_000);
    expect(funded.paidAmount).toBe(50_000);
    expect(funded.settledAmount).toBe(50_000);
    expect(funded.outstandingAmount).toBe(50_000);
  });

  it('applies price increase without changing settled amount', () => {
    const payment = basePayment();
    const increased = applyPriceIncrease(payment, 10_000);
    expect(increased.payment.price).toBe(110_000);
    expect(increased.payment.outstandingAmount).toBe(10_000);
    expect(increased.payment.settledAmount).toBe(100_000);
  });

  it('applies price decrease and refunds retained excess without reducing settled history incorrectly', () => {
    const payment = basePayment();
    const decreased = applyPriceDecrease(payment, 80_000);
    expect(decreased.payment.price).toBe(80_000);
    expect(decreased.payment.settledAmount).toBe(80_000);
    expect(decreased.refundDelta).toBe(20_000);
    expect(decreased.payment.refundedAmount).toBe(20_000);
    expect(decreased.payment.retainedAmount).toBe(80_000);
  });

  it('refund delta does not reduce settled amount', () => {
    const payment = basePayment();
    const refunded = applyRefundDelta(payment, 20_000);
    expect(refunded.settledAmount).toBe(100_000);
    expect(refunded.refundedAmount).toBe(20_000);
    expect(refunded.retainedAmount).toBe(80_000);
  });

  it('write-off closes only outstanding obligation and never authorizes service', () => {
    const underpaid = basePayment({
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
    });
    const writtenOff = applyWriteOffAmount(underpaid, 70_000);
    expect(writtenOff.writtenOffAmount).toBe(70_000);
    expect(writtenOff.outstandingAmount).toBe(0);
    expect(isPaymentFullyFundedForService(writtenOff)).toBe(false);
    expect(writeOffDoesNotAuthorizeService(writtenOff)).toBe(true);
  });

  it('rejects impossible accounting transitions', () => {
    const payment = basePayment();
    expect(() => applyRefundDelta(payment, 150_000)).toThrow(PaymentAccountingInvariantError);
    expect(() => applyReplacementThenObligationFunding(basePayment(), 1)).toThrow(
      PaymentAccountingInvariantError
    );
  });

  it('evaluates full funding predicate exactly', () => {
    const funded = basePayment();
    expect(isPaymentFullyFundedForService(funded)).toBe(true);
    const goodwillRefund = applyRefundDelta(funded, 20_000);
    expect(isPaymentFullyFundedForService(goodwillRefund)).toBe(false);
    expect(deriveRetainedAmount(goodwillRefund.paidAmount, goodwillRefund.refundedAmount)).toBe(
      80_000
    );
  });

  it('funds price increase from wallet when requested', () => {
    const underpaid = basePayment({
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
    });
    const adjusted = applyPriceIncreaseWithFunding(underpaid, 10_000, 10_000);
    expect(adjusted.price).toBe(110_000);
    expect(adjusted.paidAmount).toBe(40_000);
    expect(adjusted.outstandingAmount).toBe(70_000);
  });
});
