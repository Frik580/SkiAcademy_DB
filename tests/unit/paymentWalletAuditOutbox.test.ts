import { describe, expect, it } from 'vitest';
import { canonicalPaymentWalletAuditFixtures } from '@ski-academy/shared-domain/testing';
import {
  AUDIT_CARDINALITY_LIMITS,
  ActivityLogSchema,
  DomainOutboxObligationSchema,
  KztMinorUnitsSchema,
  MonetaryEventSchema,
  PaymentSchema,
  ResourceClaimGuardSchema,
  ResourceClaimIdentityInputSchema,
  ResourceClaimSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  canonicalDeterministicHash,
  containsLegacyAvailabilityFields,
  containsLegacyFinancialFields,
  containsLegacyMutableActivityLogFields,
  derivePaymentStatus,
  deriveRetainedAmount,
  financialActivityLogEffectSummaryDuplicatesMonetaryDetail,
  domainOutboxIdFromCommand,
  intervalsConflict,
  isPaymentFullyFundedForService,
  monetaryEventIdFromCommandEffect,
  monetaryEventRecordsProvenanceAtEvent,
  resourceClaimIdFromIdentity,
  validateDeterministicIdentityInputs,
  writeOffDoesNotAuthorizeService,
  timestampFromDate,
} from '@ski-academy/shared-domain';

const timestamp = (value: string) => timestampFromDate(new Date(value));

const paymentMetadata = {
  revision: 1,
  eventRevision: 1,
  createdAt: timestamp('2026-01-01T00:00:00.000Z'),
  updatedAt: timestamp('2026-01-01T01:00:00.000Z'),
};

function basePayment(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: 'payment_test_01',
    subjectType: 'booking',
    subjectId: 'booking_test_01',
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
    ...paymentMetadata,
    ...overrides,
  };
}

describe('canonical payment wallet audit fixtures', () => {
  it('publishes paid, underpaid, wallet, monetary, claim, audit, and outbox fixtures', () => {
    expect(canonicalPaymentWalletAuditFixtures.payment.paymentStatus).toBe('paid');
    expect(canonicalPaymentWalletAuditFixtures.underpaidPayment.paymentStatus).toBe(
      'partially_paid'
    );
    expect(canonicalPaymentWalletAuditFixtures.wallet.balance).toBe(250_000);
    expect(canonicalPaymentWalletAuditFixtures.monetaryEvent.eventKind).toBe('booking_charge');
    expect(canonicalPaymentWalletAuditFixtures.activityLog.monetaryEventIds).toHaveLength(1);
  });
});

describe('Payment accounting equations', () => {
  it('accepts a fully paid booking payment', () => {
    expect(PaymentSchema.safeParse(basePayment()).success).toBe(true);
  });

  it('derives retainedAmount and paymentStatus consistently', () => {
    const fields = {
      originalPrice: KztMinorUnitsSchema.parse(100_000),
      price: KztMinorUnitsSchema.parse(100_000),
      paidAmount: KztMinorUnitsSchema.parse(30_000),
      refundedAmount: KztMinorUnitsSchema.parse(0),
      retainedAmount: KztMinorUnitsSchema.parse(30_000),
      settledAmount: KztMinorUnitsSchema.parse(30_000),
      writtenOffAmount: KztMinorUnitsSchema.parse(0),
      outstandingAmount: KztMinorUnitsSchema.parse(70_000),
    };
    expect(deriveRetainedAmount(fields.paidAmount, fields.refundedAmount)).toBe(30_000);
    expect(derivePaymentStatus(fields)).toBe('partially_paid');
    expect(isPaymentFullyFundedForService(fields)).toBe(false);
  });

  it('rejects invalid accounting equations', () => {
    expect(
      PaymentSchema.safeParse(
        basePayment({
          retainedAmount: 90_000,
          paymentStatus: 'paid',
        })
      ).success
    ).toBe(false);
    expect(
      PaymentSchema.safeParse(
        basePayment({
          price: 100_000,
          settledAmount: 40_000,
          writtenOffAmount: 10_000,
          outstandingAmount: 40_000,
          paymentStatus: 'partially_paid',
        })
      ).success
    ).toBe(false);
  });

  it('covers ADR goodwill refund and zero-price paid scenarios', () => {
    const goodwill = PaymentSchema.parse(
      basePayment({
        paidAmount: 100_000,
        refundedAmount: 20_000,
        retainedAmount: 80_000,
        settledAmount: 100_000,
        paymentStatus: 'partially_refunded',
      })
    );
    expect(derivePaymentStatus(goodwill)).toBe('partially_refunded');
    expect(isPaymentFullyFundedForService(goodwill)).toBe(false);
    expect(goodwill.settledAmount).toBe(100_000);

    const zeroPrice = PaymentSchema.parse(
      basePayment({
        originalPrice: 0,
        price: 0,
        paidAmount: 0,
        retainedAmount: 0,
        settledAmount: 0,
        paymentStatus: 'paid',
      })
    );
    expect(derivePaymentStatus(zeroPrice)).toBe('paid');
  });

  it('rejects paymentStatus that does not match derived status', () => {
    expect(
      PaymentSchema.safeParse(
        basePayment({
          paidAmount: 30_000,
          retainedAmount: 30_000,
          settledAmount: 30_000,
          outstandingAmount: 70_000,
          paymentStatus: 'paid',
        })
      ).success
    ).toBe(false);
  });

  it('requires monetary-event provenance and payment linkage', () => {
    expect(
      MonetaryEventSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.monetaryEvent,
        paymentId: undefined,
      }).success
    ).toBe(false);
    expect(
      MonetaryEventSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.monetaryEvent,
        sourceKind: 'manual_external',
        manualReference: undefined,
        payerAccountIdAtEvent: undefined,
      }).success
    ).toBe(false);
  });

  it('rejects refundedAmount greater than paidAmount', () => {
    expect(
      PaymentSchema.safeParse(
        basePayment({
          paidAmount: 30_000,
          refundedAmount: 40_000,
          retainedAmount: -10_000,
          settledAmount: 30_000,
          outstandingAmount: 70_000,
          paymentStatus: 'refunded',
        })
      ).success
    ).toBe(false);
  });

  it('rejects invalid settled, write-off, and outstanding combinations', () => {
    expect(
      PaymentSchema.safeParse(
        basePayment({
          settledAmount: 120_000,
          paymentStatus: 'paid',
        })
      ).success
    ).toBe(false);
    expect(
      PaymentSchema.safeParse(
        basePayment({
          writtenOffAmount: -1,
          outstandingAmount: 101_000,
          paymentStatus: 'partially_paid',
        })
      ).success
    ).toBe(false);
  });

  it('models cancellation with write-off without authorizing service', () => {
    const cancelled = PaymentSchema.parse(
      basePayment({
        paidAmount: 30_000,
        refundedAmount: 30_000,
        retainedAmount: 0,
        settledAmount: 30_000,
        writtenOffAmount: 70_000,
        outstandingAmount: 0,
        paymentStatus: 'refunded',
      })
    );
    expect(writeOffDoesNotAuthorizeService(cancelled)).toBe(true);
    expect(isPaymentFullyFundedForService(cancelled)).toBe(false);
  });
});

describe('Wallet and monetary-event boundaries', () => {
  it('rejects negative wallet balances and non-KZT currency', () => {
    expect(
      WalletSchema.safeParse({
        accountId: 'account_wallet_01',
        currency: 'KZT',
        balance: -1,
        ...paymentMetadata,
      }).success
    ).toBe(false);
    expect(
      WalletSchema.safeParse({
        accountId: 'account_wallet_01',
        currency: 'USD',
        balance: 100,
        ...paymentMetadata,
      }).success
    ).toBe(false);
  });

  it('requires strict KZT integer minor units', () => {
    expect(KztMinorUnitsSchema.safeParse(10.5).success).toBe(false);
    expect(KztMinorUnitsSchema.safeParse(-1).success).toBe(false);
  });

  it('keeps monetary events immutable and provenance-bearing', () => {
    const event = canonicalPaymentWalletAuditFixtures.monetaryEvent;
    expect(MonetaryEventSchema.safeParse({ ...event, paidAmount: 1 }).success).toBe(false);
    expect(
      monetaryEventRecordsProvenanceAtEvent({
        payerAccountIdAtEvent: event.payerAccountIdAtEvent,
        sourceKind: event.sourceKind,
        providerTransactionRef: event.providerTransactionRef,
        manualReference: event.manualReference,
      })
    ).toBe(true);
    expect(
      monetaryEventRecordsProvenanceAtEvent(
        {
          sourceKind: 'manual_external',
          manualReference: 'bank-transfer-001',
        },
        'account_fixture_01'
      )
    ).toBe(true);
  });

  it('detects legacy financial shapes and synthetic guest wallet fields', () => {
    expect(containsLegacyFinancialFields({ balanceUSD: 250 })).toBe(true);
    expect(containsLegacyFinancialFields({ guestWallet: 'school' })).toBe(true);
    expect(containsLegacyFinancialFields({ currency: 'KZT', balance: 0 })).toBe(false);
  });
});

describe('resource claim and guard contracts', () => {
  it('serializes deterministic claim identity from versioned inputs', () => {
    const identity = ResourceClaimIdentityInputSchema.parse({
      strategyVersion: 'claim:v1',
      claimKind: 'participant_booking_occurrence',
      resourceKind: 'participant',
      resourceId: 'participant_test_01',
      ownerKind: 'booking',
      ownerId: 'booking_test_01',
      occurrenceId: 'occurrence_test_01',
    });
    const claimId = resourceClaimIdFromIdentity(identity);
    expect(
      ResourceClaimSchema.parse({
        ...canonicalPaymentWalletAuditFixtures.resourceClaim,
        claimId,
        claimKind: identity.claimKind,
        resourceKind: identity.resourceKind,
        resourceId: identity.resourceId,
        ownerKind: identity.ownerKind,
        ownerId: identity.ownerId,
        occurrenceId: identity.occurrenceId,
      }).claimId
    ).toBe(claimId);
  });

  it('rejects non-canonical identity inputs such as email-shaped resource IDs', () => {
    expect(
      ResourceClaimIdentityInputSchema.safeParse({
        strategyVersion: 'claim:v1',
        claimKind: 'participant_booking_occurrence',
        resourceKind: 'participant',
        resourceId: 'user@example.com',
        ownerKind: 'booking',
        ownerId: 'booking_test_01',
        occurrenceId: 'occurrence_test_01',
      }).success
    ).toBe(false);
  });

  it('models exact interval overlap without treating adjacency as conflict', () => {
    const left = {
      startsAt: timestamp('2026-01-15T04:00:00.000Z'),
      endsAt: timestamp('2026-01-15T05:00:00.000Z'),
    };
    const adjacent = {
      startsAt: timestamp('2026-01-15T05:00:00.000Z'),
      endsAt: timestamp('2026-01-15T06:00:00.000Z'),
    };
    const overlapping = {
      startsAt: timestamp('2026-01-15T04:30:00.000Z'),
      endsAt: timestamp('2026-01-15T05:30:00.000Z'),
    };
    expect(intervalsConflict(left, adjacent)).toBe(false);
    expect(intervalsConflict(left, overlapping)).toBe(true);
  });

  it('rejects legacy availability shapes', () => {
    expect(containsLegacyAvailabilityFields({ availability_slots: [] })).toBe(true);
    expect(containsLegacyAvailabilityFields({ availability_hour_locks: {} })).toBe(true);
    expect(containsLegacyAvailabilityFields({ claimKind: 'instructor_booking_occurrence' })).toBe(
      false
    );
  });

  it('validates guard bucket keys against deterministic inputs', () => {
    expect(
      ResourceClaimGuardSchema.safeParse(canonicalPaymentWalletAuditFixtures.resourceClaimGuard)
        .success
    ).toBe(true);
  });
});

describe('Activity Log and outbox contracts', () => {
  it('links audit and outbox records deterministically to the command', () => {
    const commandId = 'command_audit_test_01';
    expect(activityLogIdFromCommandId(commandId)).toBe(
      canonicalDeterministicHash(['audit:v1', commandId])
    );
    expect(domainOutboxIdFromCommand(commandId, 0)).toBe(
      canonicalDeterministicHash(['outbox:v1', commandId, '0'])
    );
    expect(monetaryEventIdFromCommandEffect(commandId, 0)).toBe(
      canonicalDeterministicHash(['monetary:v1', commandId, '0'])
    );
  });

  it('enforces Activity Log cardinality and envelope limits', () => {
    const record = canonicalPaymentWalletAuditFixtures.activityLog;
    expect(record.effects.length).toBeLessThanOrEqual(AUDIT_CARDINALITY_LIMITS.effects);
    expect(record.monetaryEventIds.length).toBeLessThanOrEqual(
      AUDIT_CARDINALITY_LIMITS.monetaryEventIds
    );
    expect(record.outboxIds.length).toBeLessThanOrEqual(
      AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand
    );
  });

  it('rejects outboxId and activityLogId mismatches and ordinal overflow', () => {
    expect(
      DomainOutboxObligationSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.outboxObligation,
        outboxId: 'wrong_outbox_id',
      }).success
    ).toBe(false);
    expect(
      ActivityLogSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.activityLog,
        activityLogId: 'wrong_activity_log_id',
      }).success
    ).toBe(false);
    expect(
      DomainOutboxObligationSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.outboxObligation,
        deliveryEffectOrdinal: 31,
        outboxId: domainOutboxIdFromCommand(
          canonicalPaymentWalletAuditFixtures.outboxObligation.commandId,
          31
        ),
      }).success
    ).toBe(true);
    expect(
      DomainOutboxObligationSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.outboxObligation,
        deliveryEffectOrdinal: 32,
      }).success
    ).toBe(false);
  });

  it('rejects Activity Log effects that duplicate monetary detail in summaries', () => {
    const rejectSummaries = [
      'paidAmount=100000 retainedAmount=100000',
      'charged 100000 KZT',
      'refunded 5000 KZT',
      'balance 120000 KZT',
    ];
    const effectKinds = ['payment_state_changed', 'booking_lifecycle_changed'] as const;

    for (const summary of rejectSummaries) {
      expect(financialActivityLogEffectSummaryDuplicatesMonetaryDetail(summary)).toBe(true);
      for (const kind of effectKinds) {
        expect(
          ActivityLogSchema.safeParse({
            ...canonicalPaymentWalletAuditFixtures.activityLog,
            effects: [{ kind, summary }],
          }).success
        ).toBe(false);
      }
    }
  });

  it('allows legitimate non-monetary numeric semantics in Activity Log effect summaries', () => {
    const allowSummaries = [
      'Payment created after reschedule to 2026-01-15',
      'Wallet balance changed for revision 3',
      'Payment state updated for booking BK-100000',
    ];
    const effectKinds = ['payment_state_changed', 'booking_lifecycle_changed'] as const;

    for (const summary of allowSummaries) {
      expect(financialActivityLogEffectSummaryDuplicatesMonetaryDetail(summary)).toBe(false);
      for (const kind of effectKinds) {
        expect(
          ActivityLogSchema.safeParse({
            ...canonicalPaymentWalletAuditFixtures.activityLog,
            effects: [
              {
                kind,
                subjectRef:
                  kind === 'payment_state_changed'
                    ? {
                        kind: 'payment',
                        id: canonicalPaymentWalletAuditFixtures.payment.paymentId,
                      }
                    : undefined,
                summary,
              },
            ],
          }).success
        ).toBe(true);
      }
    }
  });

  it('rejects legacy mutable audit shapes', () => {
    expect(containsLegacyMutableActivityLogFields({ updatedAt: 'now' })).toBe(true);
    expect(containsLegacyMutableActivityLogFields({ monetaryDeltas: { paid: 1 } })).toBe(true);
    expect(containsLegacyMutableActivityLogFields({ schemaVersion: 'audit:v1' })).toBe(false);
  });

  it('keeps outbox obligations within per-command limits', () => {
    expect(
      DomainOutboxObligationSchema.safeParse({
        ...canonicalPaymentWalletAuditFixtures.outboxObligation,
        deliveryEffectOrdinal: 32,
      }).success
    ).toBe(false);
  });
});

describe('deterministic identity validation helper', () => {
  it('flags personal data in deterministic identity inputs through refinement', () => {
    const issues: Array<{ path: (string | number)[]; message: string }> = [];
    validateDeterministicIdentityInputs(
      { resourceId: '+1-555-0100' },
      {
        addIssue(issue) {
          issues.push({ path: issue.path ?? [], message: issue.message });
        },
      }
    );
    expect(issues).toHaveLength(1);
  });
});
