import { describe, expect, it } from 'vitest';
import {
  PaymentAccountingInvariantError,
  assertFinancialCorrectionHasEffect,
  planAdminRefundCorrection,
  planWriteOffCorrection,
  planCompensatingEventCorrection,
  assertFinancialCorrectionIssueSubjectMatchesPayment,
  resolveFinancialAdminIssueForCorrection,
  AdminIssueSchema,
  PaymentSchema,
  adminIssueIdFromDedupeKey,
  adminIssueDedupeKeyFromIdentity,
  financialReconciliationMismatchIdentity,
  timestampFromDate,
} from '@ski-academy/shared-domain';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const baseFields = {
  originalPrice: 100_000,
  price: 100_000,
  paidAmount: 100_000,
  refundedAmount: 0,
  retainedAmount: 100_000,
  settledAmount: 100_000,
  writtenOffAmount: 0,
  outstandingAmount: 0,
};

describe('financialCorrectionPolicy', () => {
  it('plans admin refund with wallet credit', () => {
    const plan = planAdminRefundCorrection({
      before: baseFields,
      refundAmount: 20_000,
      destination: 'wallet',
      walletAccountId: 'account_fin_01',
    });
    expect(plan.paymentProjection.refundedAmount).toBe(20_000);
    expect(plan.walletBalanceDelta).toBe(20_000);
    expect(plan.monetaryEvents[0]?.eventKind).toBe('refund_to_wallet');
  });

  it('rejects refund beyond retained', () => {
    expect(() =>
      planAdminRefundCorrection({
        before: { ...baseFields, paidAmount: 10_000, retainedAmount: 10_000, settledAmount: 10_000 },
        refundAmount: 20_000,
        destination: 'wallet',
        walletAccountId: 'account_fin_01',
      })
    ).toThrow(PaymentAccountingInvariantError);
  });

  it('plans write-off within outstanding', () => {
    const plan = planWriteOffCorrection({
      before: {
        ...baseFields,
        paidAmount: 30_000,
        retainedAmount: 30_000,
        settledAmount: 30_000,
        outstandingAmount: 70_000,
      },
      amount: 20_000,
    });
    expect(plan.paymentProjection.writtenOffAmount).toBe(20_000);
    expect(plan.paymentProjection.outstandingAmount).toBe(50_000);
  });

  it('rejects zero-effect compensating correction', () => {
    expect(() =>
      assertFinancialCorrectionHasEffect({
        paymentProjection: { ...baseFields, paymentStatus: 'paid' },
        monetaryEvents: [],
      })
    ).toThrow(PaymentAccountingInvariantError);
  });

  it('resolves financial reconciliation issue for admin correction', () => {
    const identity = financialReconciliationMismatchIdentity({
      subjectKind: 'booking',
      subjectId: 'booking_fin_01',
      reconciliationScope: 'payment_projection',
    });
    const issue = AdminIssueSchema.parse({
      issueId: adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity)),
      kind: 'financial_reconciliation_mismatch',
      subjectRef: { subjectKind: 'booking', bookingId: 'booking_fin_01' },
      reconciliationScope: 'payment_projection',
      lifecycle: { status: 'open', openedAt: decidedAt, lastDetectedAt: decidedAt },
      severity: 'urgent',
      blocksOutcome: false,
      blocksDelivery: false,
      dedupeKey: adminIssueDedupeKeyFromIdentity(identity),
      revision: 1,
      correlationId: 'correlation_issue',
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_issue',
        lastChangedByCommandId: 'command_issue',
        correlationId: 'correlation_issue',
      },
    });

    const resolved = resolveFinancialAdminIssueForCorrection(issue, {
      expectedRevision: 1,
      now: decidedAt,
      correlationId: 'correlation_resolve',
      commandId: 'command_resolve',
      reason: 'Corrected payment projection',
      actor: {
        actor: { kind: 'account', accountId: 'account_admin_01' },
        exercisedCapability: 'administrator',
      },
      coupledDomainCommand: true,
      paymentId: 'payment_fin_01',
      adminIssueId: issue.issueId,
    });

    expect(resolved.lifecycle.status).toBe('resolved');
  });

  it('emits compensating event with correctsEventId', () => {
    const plan = planCompensatingEventCorrection({
      before: baseFields,
      correctsEventId: 'monetary_event_bad_01',
      paymentEffect: { refundedAmountDelta: 5_000 },
    });
    expect(plan.monetaryEvents[0]?.correctsEventId).toBe('monetary_event_bad_01');
    expect(plan.monetaryEvents[0]?.eventKind).toBe('correction');
  });

  it('rejects unrelated admin issue subject for payment correction', () => {
    const identity = financialReconciliationMismatchIdentity({
      subjectKind: 'booking',
      subjectId: 'booking_other_01',
      reconciliationScope: 'payment_projection',
    });
    const issue = AdminIssueSchema.parse({
      issueId: adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity)),
      kind: 'financial_reconciliation_mismatch',
      subjectRef: { subjectKind: 'booking', bookingId: 'booking_other_01' },
      reconciliationScope: 'payment_projection',
      lifecycle: { status: 'open', openedAt: decidedAt, lastDetectedAt: decidedAt },
      severity: 'urgent',
      blocksOutcome: false,
      blocksDelivery: false,
      dedupeKey: adminIssueDedupeKeyFromIdentity(identity),
      revision: 1,
      correlationId: 'correlation_issue',
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_issue',
        lastChangedByCommandId: 'command_issue',
        correlationId: 'correlation_issue',
      },
    });
    const payment = PaymentSchema.parse({
      paymentId: 'payment_fin_01',
      subjectType: 'booking',
      subjectId: 'booking_fin_01',
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
    });

    expect(() =>
      assertFinancialCorrectionIssueSubjectMatchesPayment(
        'correlation_resolve',
        issue,
        payment
      )
    ).toThrow();
  });
});
