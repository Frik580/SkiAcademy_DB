import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type BookingId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';
import type { AuditOutboxStagingPlan } from '@ski-academy/shared-domain';

export function buildChangeBookingPartyAuditPlan(input: {
  envelope: CommandEnvelope<'change_booking_party'>;
  bookingId: BookingId;
  bookingRevision: number;
  paymentId: PaymentId;
  paymentRevision: number;
  mode: 'client_self_service' | 'administrator';
  monetaryEventIds: readonly MonetaryEventId[];
  includeWalletEffect: boolean;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);
  const reasonCode =
    input.mode === 'administrator' ? ('manual_override' as const) : ('self_service_booking' as const);
  const explanation =
    reasonCode === 'manual_override' ? input.envelope.intent.reasonExplanation : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_party_changed',
      subjectRef: bookingRef,
      summary: 'Booking party composition changed',
    },
    {
      kind: 'payment_state_changed',
      subjectRef: paymentRef,
      summary: 'Payment adjusted for booking party change',
    },
    ...(input.includeWalletEffect
      ? [
          {
            kind: 'wallet_balance_changed' as const,
            subjectRef: paymentRef,
            summary: 'Wallet adjusted for booking party change',
          },
        ]
      : []),
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking participant resource claims updated',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Booking party change notification queued',
    },
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode,
        ...(explanation === undefined ? {} : { explanation }),
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef, paymentRef],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
        {
          subject: paymentRef,
          revision: AggregateRevisionSchema.parse(input.paymentRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildRollbackUnpaidBookingPartyAdditionsAuditPlan(input: {
  envelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'>;
  bookingId: BookingId;
  bookingRevision: number;
  paymentId: PaymentId;
  paymentRevision: number;
  monetaryEventIds: readonly MonetaryEventId[];
  includeWalletEffect: boolean;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);
  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_party_changed',
      subjectRef: bookingRef,
      summary: 'Unpaid booking party additions rolled back',
    },
    {
      kind: 'payment_state_changed',
      subjectRef: paymentRef,
      summary: 'Payment adjusted after unpaid party addition rollback',
    },
    ...(input.includeWalletEffect
      ? [
          {
            kind: 'wallet_balance_changed' as const,
            subjectRef: paymentRef,
            summary: 'Wallet adjusted after unpaid party addition rollback',
          },
        ]
      : []),
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Rolled back participant resource claims released',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Party rollback notification queued',
    },
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'scheduled_system_action',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef, paymentRef],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
        {
          subject: paymentRef,
          revision: AggregateRevisionSchema.parse(input.paymentRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}
