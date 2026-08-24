"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalPaymentWalletAuditFixtures = void 0;
const canonical_1 = require("../canonical");
const primitives_1 = require("../canonical/primitives");
const createdAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T00:00:00.000Z'));
const updatedAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T01:00:00.000Z'));
const intervalStartsAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-15T04:00:00.000Z'));
const intervalEndsAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-15T05:00:00.000Z'));
const commandId = canonical_1.CommandIdSchema.parse('command_payment_fixture_01');
const correlationId = canonical_1.CorrelationIdSchema.parse('correlation_payment_fixture_01');
const payment = canonical_1.PaymentSchema.parse({
    paymentId: 'payment_fixture_01',
    subjectType: 'booking',
    subjectId: 'booking_fixture_01',
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
    payerAccountId: 'account_fixture_01',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt,
    updatedAt,
});
const underpaidPayment = canonical_1.PaymentSchema.parse({
    ...payment,
    paymentId: 'payment_fixture_underpaid',
    paidAmount: 30_000,
    retainedAmount: 30_000,
    settledAmount: 30_000,
    outstandingAmount: 70_000,
    paymentStatus: 'partially_paid',
});
const wallet = canonical_1.WalletSchema.parse({
    accountId: 'account_fixture_01',
    currency: 'KZT',
    balance: 250_000,
    revision: 1,
    eventRevision: 1,
    createdAt,
    updatedAt,
});
const monetaryEvent = canonical_1.MonetaryEventSchema.parse({
    eventId: (0, canonical_1.monetaryEventIdFromCommandEffect)(commandId, 0),
    eventKind: 'booking_charge',
    currency: 'KZT',
    paymentId: payment.paymentId,
    subjectType: 'booking',
    subjectId: 'booking_fixture_01',
    walletAccountId: wallet.accountId,
    paymentEffect: {
        paidAmountDelta: 100_000,
        settledAmountDelta: 100_000,
    },
    walletBalanceDelta: -100_000,
    sourceKind: 'wallet',
    payerAccountIdAtEvent: wallet.accountId,
    actor: { kind: 'account', accountId: wallet.accountId },
    commandId,
    correlationId,
    paymentEventRevision: 1,
    walletEventRevision: 1,
    occurredAt: createdAt,
    recordedAt: updatedAt,
});
const claimIdentity = canonical_1.ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'instructor_booking_occurrence',
    resourceKind: 'instructor',
    resourceId: 'instructor_fixture_01',
    ownerKind: 'booking',
    ownerId: 'booking_fixture_01',
    occurrenceId: 'occurrence_fixture_01',
});
const resourceClaim = canonical_1.ResourceClaimSchema.parse({
    claimId: (0, canonical_1.resourceClaimIdFromIdentity)(claimIdentity),
    strategyVersion: 'claim:v1',
    claimKind: claimIdentity.claimKind,
    resourceKind: claimIdentity.resourceKind,
    resourceId: claimIdentity.resourceId,
    ownerKind: claimIdentity.ownerKind,
    ownerId: claimIdentity.ownerId,
    occurrenceId: claimIdentity.occurrenceId,
    interval: { startsAt: intervalStartsAt, endsAt: intervalEndsAt },
    lifecycle: { status: 'active' },
    revision: 1,
    correlationId,
    lastChangedByCommandId: commandId,
    createdAt,
    updatedAt,
});
const resourceClaimGuard = canonical_1.ResourceClaimGuardSchema.parse({
    guardId: 'guard_fixture_01',
    strategyVersion: 'guard:v1',
    bucketKey: (0, canonical_1.resourceClaimGuardBucketKeyFromIdentity)({
        strategyVersion: 'guard:v1',
        resourceKind: 'instructor',
        resourceId: 'instructor_fixture_01',
        bucketStartSeconds: intervalStartsAt.seconds,
    }),
    resourceKind: 'instructor',
    resourceId: 'instructor_fixture_01',
    bucketStartAt: intervalStartsAt,
    entries: [
        {
            claimId: resourceClaim.claimId,
            ownerKind: 'booking',
            ownerId: 'booking_fixture_01',
            occurrenceId: 'occurrence_fixture_01',
            interval: { startsAt: intervalStartsAt, endsAt: intervalEndsAt },
            lifecycleStatus: 'active',
        },
    ],
    revision: 1,
    updatedAt,
    lastChangedByCommandId: commandId,
    correlationId,
});
const activityLog = canonical_1.ActivityLogSchema.parse({
    schemaVersion: 'audit:v1',
    activityLogId: (0, canonical_1.activityLogIdFromCommandId)(commandId),
    command: { commandId, kind: 'create_confirmed_booking' },
    actor: {
        kind: 'account',
        actorKey: 'account:account_fixture_01',
        accountId: 'account_fixture_01',
    },
    exercisedCapability: 'account_owner',
    source: 'client_callable',
    correlationId,
    decidedAt: createdAt,
    committedAt: updatedAt,
    reason: {
        registryVersion: 'reason:v1',
        reasonCode: 'self_service_booking',
    },
    primarySubject: {
        kind: 'booking',
        id: 'booking_fixture_01',
        subjectKey: 'booking:booking_fixture_01',
    },
    affectedSubjects: [{ kind: 'booking', id: 'booking_fixture_01' }],
    affectedSubjectKeys: ['booking:booking_fixture_01'],
    effects: [
        {
            kind: 'payment_state_changed',
            subjectRef: { kind: 'payment', id: payment.paymentId },
            summary: 'Payment created for booking',
        },
    ],
    monetaryEventIds: [monetaryEvent.eventId],
    adminIssueIds: [],
    outboxIds: [(0, canonical_1.domainOutboxIdFromCommand)(commandId, 0)],
    resultingRevisions: [{ subject: { kind: 'payment', id: payment.paymentId }, revision: 1 }],
    retentionPolicyVersion: 'audit-retention:v1',
});
const outboxObligation = canonical_1.DomainOutboxObligationSchema.parse({
    schemaVersion: 'outbox:v1',
    outboxId: (0, canonical_1.domainOutboxIdFromCommand)(commandId, 0),
    commandId,
    activityLogId: activityLog.activityLogId,
    deliveryEffectOrdinal: 0,
    recipient: { kind: 'account', id: 'account_fixture_01' },
    channel: 'in_app',
    templateId: 'booking_confirmed',
    templateVersion: 'v1',
    renderInputs: { bookingId: 'booking_fixture_01' },
    deliverySemantics: 'transactional',
    createdAt,
    delivery: { status: 'pending' },
});
exports.canonicalPaymentWalletAuditFixtures = Object.freeze({
    payment,
    underpaidPayment,
    wallet,
    monetaryEvent,
    resourceClaim,
    resourceClaimGuard,
    activityLog,
    outboxObligation,
});
