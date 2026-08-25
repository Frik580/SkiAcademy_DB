import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type BookingId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';
import type { AuditOutboxStagingPlan } from '@ski-academy/shared-domain';

export function buildRescheduleBookingAuditPlan(input: {
  envelope: CommandEnvelope<'reschedule_booking'>;
  bookingId: BookingId;
  bookingRevision: number;
  mode: 'client_self_service' | 'administrator';
  notificationAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const reasonCode =
    input.mode === 'administrator' ? ('manual_override' as const) : ('self_service_booking' as const);
  const explanation =
    reasonCode === 'manual_override' ? input.envelope.intent.reasonExplanation : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_schedule_changed',
      subjectRef: bookingRef,
      summary: 'Booking schedule changed',
    },
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking occurrence resource claims swapped',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Booking reschedule notification queued',
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
      affectedSubjects: [bookingRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
      ],
    },
    outboxObligations:
      input.notificationAccountId === undefined
        ? []
        : [
            {
              deliveryEffectOrdinal: 0,
              recipient: { kind: 'account', id: input.notificationAccountId },
              channel: 'in_app',
              templateId: 'booking_rescheduled',
              templateVersion: 'v1',
              renderInputs: { bookingId: input.bookingId },
              deliverySemantics: 'transactional',
            },
          ],
  };
}

export function buildBookingServiceChangeAuditPlan(input: {
  envelope: CommandEnvelope<'change_booking_instructor' | 'change_booking_duration'>;
  bookingId: BookingId;
  paymentId?: PaymentId;
  bookingRevision: number;
  paymentRevision?: number;
  monetaryEventIds: readonly MonetaryEventId[];
  walletAccountId?: AccountId;
  walletRevision?: number;
  includeWalletEffect: boolean;
  summary: string;
  notificationAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef =
    input.paymentId === undefined ? undefined : canonicalReference('payment', input.paymentId);

  const financialEffects: AuditOutboxStagingPlan['activityLog']['effects'] =
    input.monetaryEventIds.length > 0 && paymentRef !== undefined
      ? [
          {
            kind: 'payment_state_changed',
            subjectRef: paymentRef,
            summary: 'Payment adjusted for booking service change',
          },
          ...(input.includeWalletEffect && input.walletAccountId !== undefined
            ? [
                {
                  kind: 'wallet_balance_changed' as const,
                  subjectRef: canonicalReference('account', input.walletAccountId),
                  summary: 'Wallet adjusted for booking service change',
                },
              ]
            : []),
        ]
      : [];

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_service_changed',
      subjectRef: bookingRef,
      summary: input.summary,
    },
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking occurrence resource claims swapped',
    },
    ...financialEffects,
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Booking service change notification queued',
    },
  ];

  const affectedSubjects =
    paymentRef === undefined ? [bookingRef] : [bookingRef, paymentRef];
  const paymentRevisionEntry =
    input.paymentRevision !== undefined && paymentRef !== undefined
      ? [
          {
            subject: paymentRef,
            revision: AggregateRevisionSchema.parse(input.paymentRevision),
          },
        ]
      : [];
  const walletRevisionEntry =
    input.includeWalletEffect &&
    input.walletAccountId !== undefined &&
    input.walletRevision !== undefined
      ? [
          {
            subject: canonicalReference('account', input.walletAccountId),
            revision: AggregateRevisionSchema.parse(input.walletRevision),
          },
        ]
      : [];
  const resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'] = [
    {
      subject: bookingRef,
      revision: AggregateRevisionSchema.parse(input.bookingRevision),
    },
    ...paymentRevisionEntry,
    ...walletRevisionEntry,
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects,
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions,
    },
    outboxObligations:
      input.notificationAccountId === undefined
        ? []
        : [
            {
              deliveryEffectOrdinal: 0,
              recipient: { kind: 'account', id: input.notificationAccountId },
              channel: 'in_app',
              templateId: 'booking_service_changed',
              templateVersion: 'v1',
              renderInputs: { bookingId: input.bookingId },
              deliverySemantics: 'transactional',
            },
          ],
  };
}
