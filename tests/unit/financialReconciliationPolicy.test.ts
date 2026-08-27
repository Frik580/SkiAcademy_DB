import { describe, expect, it } from 'vitest';
import {
  PaymentSchema,
  MonetaryEventIdSchema,
  reconcilePaymentState,
  reconcileWalletState,
  foldPaymentAccountingFromEvents,
  financialReconciliationMismatchIdentity,
  adminIssueIdFromDedupeKey,
  adminIssueDedupeKeyFromIdentity,
  WalletSchema,
  timestampFromDate,
  type Payment,
} from '@ski-academy/shared-domain';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function seedPayment(overrides: Record<string, unknown> = {}): Payment {
  return PaymentSchema.parse({
    paymentId: 'payment_reconcile_01',
    subjectType: 'booking',
    subjectId: 'booking_reconcile_01',
    currency: 'KZT',
    originalPrice: 100_000,
    price: 100_000,
    paidAmount: 100_000,
    refundedAmount: 0,
    retainedAmount: 100_000,
    settledAmount: 100_000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    ...overrides,
  });
}

function corruptPayment(overrides: Partial<Payment>): Payment {
  return { ...seedPayment(), ...overrides };
}

describe('financialReconciliationPolicy', () => {
  it('reports no mismatch for valid payment projection', () => {
    const payment = seedPayment();
    const events = [
      {
        eventId: MonetaryEventIdSchema.parse('event_reconcile_01'),
        eventKind: 'external_payment' as const,
        currency: 'KZT' as const,
        paymentId: payment.paymentId,
        subjectType: 'booking' as const,
        subjectId: payment.subjectId,
        paymentEffect: {
          paidAmountDelta: 100_000,
          settledAmountDelta: 100_000,
          outstandingAmountDelta: -100_000,
        },
        sourceKind: 'manual_external' as const,
        manualReference: 'seed',
        actor: { kind: 'system' as const, systemActorId: 'system_reconcile' },
        commandId: 'command_seed',
        correlationId: 'correlation_seed',
        paymentEventRevision: 1,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      },
    ];
    const result = reconcilePaymentState({ payment, paymentEvents: events });
    expect(result.hasMismatch).toBe(false);
  });

  it('detects retained mismatch and impossible refunded > paid', () => {
    const payment = corruptPayment({
      paidAmount: 50_000,
      refundedAmount: 60_000,
      retainedAmount: 10_000,
      settledAmount: 50_000,
      outstandingAmount: 50_000,
      paymentStatus: 'partially_refunded',
    });
    const result = reconcilePaymentState({ payment, paymentEvents: [] });
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatches.some((m) => m.kind === 'impossible_refunded_exceeds_paid')).toBe(true);
    expect(result.mismatches.some((m) => m.kind === 'impossible_retained_mismatch')).toBe(true);
  });

  it('detects payment equation mismatch', () => {
    const payment = corruptPayment({
      settledAmount: 80_000,
      outstandingAmount: 0,
      price: 100_000,
    });
    const result = reconcilePaymentState({ payment, paymentEvents: [] });
    expect(result.mismatches.some((m) => m.kind === 'payment_equation_mismatch')).toBe(true);
  });

  it('detects projection mismatch against folded events', () => {
    const payment = seedPayment({
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
      paymentStatus: 'partially_paid',
    });
    const folded = foldPaymentAccountingFromEvents(payment.originalPrice, []);
    expect(folded.paidAmount).toBe(0);
    const result = reconcilePaymentState({ payment, paymentEvents: [] });
    expect(result.mismatches.some((m) => m.kind === 'payment_projection_mismatch')).toBe(true);
  });

  it('detects incremental requirement allocation mismatch', () => {
    const payment = corruptPayment({
      settledAmount: 50_000,
      retainedAmount: 50_000,
      paidAmount: 50_000,
      outstandingAmount: 50_000,
      paymentStatus: 'partially_paid',
      incrementalRequirements: [
        {
          incrementalRequirementId: 'incr_req_reconcile_01',
          participantId: 'participant_reconcile_01',
          createdAt: decidedAt,
          createdByCommandId: 'command_seed',
          requiredPriceDelta: 20_000,
          allocatedSettledAmount: 30_000,
          allocatedRetainedAmount: 30_000,
          state: 'active',
        },
      ],
    });
    const result = reconcilePaymentState({ payment, paymentEvents: [] });
    expect(result.mismatches.some((m) => m.kind === 'incremental_requirement_mismatch')).toBe(true);
  });

  it('uses deterministic financial reconciliation issue identity', () => {
    const identity = financialReconciliationMismatchIdentity({
      subjectKind: 'booking',
      subjectId: 'booking_reconcile_01',
      reconciliationScope: 'payment_projection',
    });
    const first = adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity));
    const second = adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity));
    expect(first).toBe(second);
  });

  it('detects wallet balance mismatch', () => {
    const wallet = WalletSchema.parse({
      accountId: 'account_reconcile_01',
      currency: 'KZT',
      balance: 10_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    });
    const result = reconcileWalletState({
      wallet,
      walletEvents: [
        {
          eventId: MonetaryEventIdSchema.parse('event_wallet_01'),
          eventKind: 'wallet_credit',
          currency: 'KZT',
          walletAccountId: wallet.accountId,
          walletBalanceDelta: 5_000,
          sourceKind: 'admin_adjustment',
          actor: { kind: 'system', systemActorId: 'system_reconcile' },
          commandId: 'command_seed',
          correlationId: 'correlation_seed',
          walletEventRevision: 1,
          occurredAt: decidedAt,
          recordedAt: decidedAt,
        },
      ],
    });
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatches[0]?.kind).toBe('wallet_balance_mismatch');
  });
});
