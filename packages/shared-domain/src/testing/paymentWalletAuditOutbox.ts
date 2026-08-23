import {
  ActivityLogSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DomainOutboxObligationSchema,
  MonetaryEventSchema,
  PaymentSchema,
  ResourceClaimGuardSchema,
  ResourceClaimSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  domainOutboxIdFromCommand,
  monetaryEventIdFromCommandEffect,
  resourceClaimIdFromIdentity,
  resourceClaimGuardBucketKeyFromIdentity,
  type ActivityLog,
  type DomainOutboxObligation,
  type MonetaryEvent,
  type Payment,
  type ResourceClaim,
  type ResourceClaimGuard,
  type Wallet,
} from '../canonical';
import { timestampFromDate } from '../canonical/primitives';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const updatedAt = timestampFromDate(new Date('2026-01-01T01:00:00.000Z'));
const intervalStartsAt = timestampFromDate(new Date('2026-01-15T04:00:00.000Z'));
const intervalEndsAt = timestampFromDate(new Date('2026-01-15T05:00:00.000Z'));

const commandId = CommandIdSchema.parse('command_payment_fixture_01');
const correlationId = CorrelationIdSchema.parse('correlation_payment_fixture_01');

const payment = PaymentSchema.parse({
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

const underpaidPayment = PaymentSchema.parse({
  ...payment,
  paymentId: 'payment_fixture_underpaid',
  paidAmount: 30_000,
  retainedAmount: 30_000,
  settledAmount: 30_000,
  outstandingAmount: 70_000,
  paymentStatus: 'partially_paid',
});

const wallet = WalletSchema.parse({
  accountId: 'account_fixture_01',
  currency: 'KZT',
  balance: 250_000,
  revision: 1,
  eventRevision: 1,
  createdAt,
  updatedAt,
});

const monetaryEvent = MonetaryEventSchema.parse({
  eventId: monetaryEventIdFromCommandEffect(commandId, 0),
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

const claimIdentity = {
  strategyVersion: 'claim:v1' as const,
  claimKind: 'instructor_booking_occurrence',
  resourceKind: 'instructor',
  resourceId: 'instructor_fixture_01',
  ownerKind: 'booking',
  ownerId: 'booking_fixture_01',
  occurrenceId: 'occurrence_fixture_01',
};

const resourceClaim = ResourceClaimSchema.parse({
  claimId: resourceClaimIdFromIdentity(claimIdentity),
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

const resourceClaimGuard = ResourceClaimGuardSchema.parse({
  guardId: 'guard_fixture_01',
  strategyVersion: 'guard:v1',
  bucketKey: resourceClaimGuardBucketKeyFromIdentity({
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

const activityLog = ActivityLogSchema.parse({
  schemaVersion: 'audit:v1',
  activityLogId: activityLogIdFromCommandId(commandId),
  command: { commandId, kind: 'create_booking' },
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
  outboxIds: [domainOutboxIdFromCommand(commandId, 0)],
  resultingRevisions: [{ subject: { kind: 'payment', id: payment.paymentId }, revision: 1 }],
  retentionPolicyVersion: 'audit-retention:v1',
});

const outboxObligation = DomainOutboxObligationSchema.parse({
  schemaVersion: 'outbox:v1',
  outboxId: domainOutboxIdFromCommand(commandId, 0),
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

export interface CanonicalPaymentWalletAuditFixtures {
  readonly payment: Payment;
  readonly underpaidPayment: Payment;
  readonly wallet: Wallet;
  readonly monetaryEvent: MonetaryEvent;
  readonly resourceClaim: ResourceClaim;
  readonly resourceClaimGuard: ResourceClaimGuard;
  readonly activityLog: ActivityLog;
  readonly outboxObligation: DomainOutboxObligation;
}

export const canonicalPaymentWalletAuditFixtures: CanonicalPaymentWalletAuditFixtures =
  Object.freeze({
    payment,
    underpaidPayment,
    wallet,
    monetaryEvent,
    resourceClaim,
    resourceClaimGuard,
    activityLog,
    outboxObligation,
  });
