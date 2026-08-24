import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AuditOutboxStagingPlan,
  type BookingId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';
import type { BookingCreationMode } from './bookingAuthorization';

export function buildCreateConfirmedBookingAuditPlan(input: {
  envelope: CommandEnvelope<'create_confirmed_booking'>;
  bookingId: BookingId;
  paymentId: PaymentId;
  monetaryEventIds: readonly MonetaryEventId[];
  bookingRevision: number;
  paymentRevision: number;
  mode: BookingCreationMode;
  underfunded: boolean;
  includeWalletEffect: boolean;
  notificationAccountId: AccountId;
  walletRevision?: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);
  const reasonCode =
    input.mode === 'administrator' && input.underfunded
      ? ('manual_override' as const)
      : ('self_service_booking' as const);
  const explanation =
    reasonCode === 'manual_override' ? input.envelope.intent.reasonExplanation : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_lifecycle_changed',
      subjectRef: bookingRef,
      summary: 'Confirmed booking created',
    },
    {
      kind: 'payment_state_changed',
      subjectRef: paymentRef,
      summary: 'Payment created for booking',
    },
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking resource claims acquired',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Booking confirmation notification queued',
    },
  ];

  const resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'] = [
    {
      subject: bookingRef,
      revision: AggregateRevisionSchema.parse(input.bookingRevision),
    },
    {
      subject: paymentRef,
      revision: AggregateRevisionSchema.parse(input.paymentRevision),
    },
    ...(input.includeWalletEffect && input.walletRevision !== undefined
      ? [
          {
            subject: canonicalReference('account', input.notificationAccountId),
            revision: AggregateRevisionSchema.parse(input.walletRevision),
          },
        ]
      : []),
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
      resultingRevisions,
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: {
          kind: 'account',
          id: input.notificationAccountId,
        },
        channel: 'in_app',
        templateId: 'booking_confirmed',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}
