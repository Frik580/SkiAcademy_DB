import { describe, expect, it } from 'vitest';
import {
  PaymentAccountingInvariantError,
  PaymentSchema,
  assertFinancialCorrectionHasEffect,
  assertWalletCorrectionDoesNotOverdraw,
  derivePaymentStatus,
  deriveRetainedAmount,
  foldPaymentAccountingFromEvents,
  planAdminRefundCorrection,
  planCompensatingEventCorrection,
  planReverseWriteOffCorrection,
  planWriteOffCorrection,
  rebuildPaymentProjectionFromEvents,
  timestampFromDate,
  validatePaymentAccounting,
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

function assertPaymentEquations(fields: typeof baseFields): void {
  expect(fields.retainedAmount).toBe(fields.paidAmount - fields.refundedAmount);
  expect(fields.price).toBe(fields.settledAmount + fields.writtenOffAmount + fields.outstandingAmount);
  const issues: string[] = [];
  validatePaymentAccounting(fields, {
    addIssue: (issue) => {
      issues.push(String(issue.message));
    },
  } as never);
  expect(issues).toEqual([]);
}

const correctionScenarios = [
  {
    name: 'admin refund',
    apply: () =>
      planAdminRefundCorrection({
        before: baseFields,
        refundAmount: 15_000,
        destination: 'wallet',
        walletAccountId: 'account_fin_01',
      }),
  },
  {
    name: 'write-off',
    apply: () =>
      planWriteOffCorrection({
        before: {
          ...baseFields,
          paidAmount: 40_000,
          retainedAmount: 40_000,
          settledAmount: 40_000,
          outstandingAmount: 60_000,
        },
        amount: 25_000,
      }),
  },
  {
    name: 'reverse write-off',
    apply: () =>
      planReverseWriteOffCorrection({
        before: {
          ...baseFields,
          paidAmount: 40_000,
          retainedAmount: 40_000,
          settledAmount: 40_000,
          writtenOffAmount: 20_000,
          outstandingAmount: 40_000,
        },
        amount: 10_000,
      }),
  },
  {
    name: 'compensating event',
    apply: () =>
      planCompensatingEventCorrection({
        before: baseFields,
        correctsEventId: 'monetary_event_seed_01',
        paymentEffect: { refundedAmountDelta: 5_000 },
        walletBalanceDelta: 5_000,
        walletAccountId: 'account_fin_01',
      }),
  },
] as const;

describe('financial conservation', () => {
  for (const scenario of correctionScenarios) {
    it(`preserves payment equations after ${scenario.name}`, () => {
      const plan = scenario.apply();
      assertFinancialCorrectionHasEffect(plan);
      assertPaymentEquations(plan.paymentProjection);
    });
  }

  it('rejects refund beyond retained across stepped amounts', () => {
    const partiallyRefunded = planAdminRefundCorrection({
      before: baseFields,
      refundAmount: 20_000,
      destination: 'wallet',
      walletAccountId: 'account_fin_01',
    });
    assertPaymentEquations(partiallyRefunded.paymentProjection);
    expect(() =>
      planAdminRefundCorrection({
        before: partiallyRefunded.paymentProjection,
        refundAmount: 90_000,
        destination: 'wallet',
        walletAccountId: 'account_fin_01',
      })
    ).toThrow(PaymentAccountingInvariantError);
  });

  it('rejects write-off beyond unpaid obligation', () => {
    const partiallyPaid = {
      ...baseFields,
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
    };
    expect(() => planWriteOffCorrection({ before: partiallyPaid, amount: 80_000 })).toThrow(
      PaymentAccountingInvariantError
    );
  });

  it('rejects reverse write-off that would make writeoff negative', () => {
    expect(() =>
      planReverseWriteOffCorrection({
        before: { ...baseFields, writtenOffAmount: 5_000, outstandingAmount: 95_000 },
        amount: 10_000,
      })
    ).toThrow();
  });

  it('rejects wallet debit beyond balance', () => {
    expect(() => assertWalletCorrectionDoesNotOverdraw(3_000, -5_000)).toThrow();
  });

  it('fold + rebuild conserves derivable accounting fields', () => {
    const events = [
      {
        eventId: 'event_01',
        eventKind: 'wallet_debit' as const,
        currency: 'KZT' as const,
        paymentId: 'payment_conservation_01',
        subjectType: 'booking' as const,
        subjectId: 'booking_conservation_01',
        paymentEffect: {
          paidAmountDelta: 60_000,
          settledAmountDelta: 60_000,
          outstandingAmountDelta: -60_000,
        },
        sourceKind: 'wallet' as const,
        actor: { kind: 'account' as const, accountId: 'account_fin_01' },
        commandId: 'command_01',
        correlationId: 'correlation_01',
        paymentEventRevision: 1,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      },
      {
        eventId: 'event_02',
        eventKind: 'refund_to_wallet' as const,
        currency: 'KZT' as const,
        paymentId: 'payment_conservation_01',
        subjectType: 'booking' as const,
        subjectId: 'booking_conservation_01',
        paymentEffect: {
          refundedAmountDelta: 10_000,
        },
        sourceKind: 'admin_adjustment' as const,
        actor: { kind: 'account' as const, accountId: 'account_admin' },
        commandId: 'command_02',
        correlationId: 'correlation_02',
        paymentEventRevision: 2,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      },
    ];
    const folded = foldPaymentAccountingFromEvents(100_000, events);
    expect(folded.retainedAmount).toBe(deriveRetainedAmount(folded.paidAmount, folded.refundedAmount));
    assertPaymentEquations(folded);

    const payment = PaymentSchema.parse({
      paymentId: 'payment_conservation_01',
      subjectType: 'booking',
      subjectId: 'booking_conservation_01',
      currency: 'KZT',
      payerAccountId: 'account_fin_01',
      incrementalRequirements: [
        {
          incrementalRequirementId: 'incr_req_01',
          participantId: 'participant_01',
          createdAt: decidedAt,
          createdByCommandId: 'command_party',
          requiredPriceDelta: 10_000,
          allocatedSettledAmount: 5_000,
          allocatedRetainedAmount: 5_000,
          state: 'active',
        },
      ],
      revision: 1,
      eventRevision: 2,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      ...folded,
      paymentStatus: derivePaymentStatus(folded),
    });
    const rebuilt = rebuildPaymentProjectionFromEvents(payment, events);
    expect(rebuilt.paidAmount).toBe(folded.paidAmount);
    expect(rebuilt.refundedAmount).toBe(folded.refundedAmount);
    expect(rebuilt.settledAmount).toBe(folded.settledAmount);
    expect(rebuilt.outstandingAmount).toBe(folded.outstandingAmount);
    expect(payment.incrementalRequirements).toHaveLength(1);
  });
});
