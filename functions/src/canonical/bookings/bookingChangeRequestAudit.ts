import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AuditOutboxStagingPlan,
  type BookingChangeRequestId,
  type BookingId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildCreateBookingChangeRequestAuditPlan(input: {
  envelope: CommandEnvelope<'create_booking_change_request'>;
  bookingChangeRequestId: BookingChangeRequestId;
  bookingId: BookingId;
  changeRequestRevision: number;
  notificationAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const changeRequestRef = canonicalReference('booking_change_request', input.bookingChangeRequestId);
  const bookingRef = canonicalReference('booking', input.bookingId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: input.envelope.intent.reason,
      },
      primarySubject: {
        kind: 'booking_change_request',
        id: input.bookingChangeRequestId,
        subjectKey: `booking_change_request:${input.bookingChangeRequestId}`,
      },
      affectedSubjects: [changeRequestRef, bookingRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: changeRequestRef,
          summary: 'Booking change request notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: changeRequestRef,
          revision: AggregateRevisionSchema.parse(input.changeRequestRevision),
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
              templateId: 'booking_change_request_created',
              templateVersion: 'v1',
              renderInputs: {
                bookingChangeRequestId: input.bookingChangeRequestId,
                bookingId: input.bookingId,
              },
              deliverySemantics: 'transactional',
            },
          ],
  };
}

export function buildWithdrawBookingChangeRequestAuditPlan(input: {
  envelope: CommandEnvelope<'withdraw_booking_change_request'>;
  bookingChangeRequestId: BookingChangeRequestId;
  bookingId: BookingId;
  changeRequestRevision: number;
  notificationAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const changeRequestRef = canonicalReference('booking_change_request', input.bookingChangeRequestId);
  const bookingRef = canonicalReference('booking', input.bookingId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: 'Instructor withdrew booking change request',
      },
      primarySubject: {
        kind: 'booking_change_request',
        id: input.bookingChangeRequestId,
        subjectKey: `booking_change_request:${input.bookingChangeRequestId}`,
      },
      affectedSubjects: [changeRequestRef, bookingRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: changeRequestRef,
          summary: 'Booking change request withdrawal notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: changeRequestRef,
          revision: AggregateRevisionSchema.parse(input.changeRequestRevision),
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
              templateId: 'booking_change_request_withdrawn',
              templateVersion: 'v1',
              renderInputs: {
                bookingChangeRequestId: input.bookingChangeRequestId,
                bookingId: input.bookingId,
              },
              deliverySemantics: 'transactional',
            },
          ],
  };
}

export function buildResolveBookingChangeRequestAuditPlan(input: {
  envelope: CommandEnvelope<'resolve_booking_change_request'>;
  bookingChangeRequestId: BookingChangeRequestId;
  bookingId: BookingId;
  changeRequestRevision: number;
  bookingRevision?: number;
  paymentId?: PaymentId;
  paymentRevision?: number;
  monetaryEventIds: readonly MonetaryEventId[];
  walletRevision?: number;
  walletAccountId?: AccountId;
  notificationAccountId?: AccountId;
  resolution: CommandEnvelope<'resolve_booking_change_request'>['intent']['resolution'];
}): AuditOutboxStagingPlan {
  const changeRequestRef = canonicalReference('booking_change_request', input.bookingChangeRequestId);
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef =
    input.paymentId === undefined ? undefined : canonicalReference('payment', input.paymentId);

  const effects: Array<AuditOutboxStagingPlan['activityLog']['effects'][number]> = [];

  if (input.resolution === 'rescheduled') {
    effects.push(
      {
        kind: 'booking_schedule_changed',
        subjectRef: bookingRef,
        summary: 'Booking rescheduled after change request resolution',
      },
      {
        kind: 'resource_claim_changed',
        subjectRef: bookingRef,
        summary: 'Booking occurrence resource claims swapped',
      }
    );
  }

  if (input.resolution === 'booking_cancelled') {
    effects.push(
      {
        kind: 'booking_lifecycle_changed',
        subjectRef: bookingRef,
        summary: 'Booking cancelled after change request resolution',
      },
      {
        kind: 'payment_state_changed',
        subjectRef: paymentRef ?? bookingRef,
        summary: 'Change-request cancellation refund applied',
      },
      {
        kind: 'resource_claim_changed',
        subjectRef: bookingRef,
        summary: 'Booking resource claims released after cancellation',
      }
    );
  }

  effects.push({
    kind: 'outbox_obligation_created',
    subjectRef: changeRequestRef,
    summary: 'Booking change request resolution notification queued',
  });

  const explanation =
    input.envelope.intent.reasonExplanation?.trim() ??
    'Booking change request resolved with no booking change';
  const reasonCode =
    input.envelope.intent.reasonExplanation?.trim() !== undefined ? 'manual_override' : 'other';

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode,
        explanation,
      },
      primarySubject: {
        kind: 'booking_change_request',
        id: input.bookingChangeRequestId,
        subjectKey: `booking_change_request:${input.bookingChangeRequestId}`,
      },
      affectedSubjects: [
        changeRequestRef,
        bookingRef,
        ...(paymentRef ? [paymentRef] : []),
      ],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: changeRequestRef,
          revision: AggregateRevisionSchema.parse(input.changeRequestRevision),
        },
        ...(input.bookingRevision === undefined
          ? []
          : [
              {
                subject: bookingRef,
                revision: AggregateRevisionSchema.parse(input.bookingRevision),
              },
            ]),
        ...(paymentRef && input.paymentRevision !== undefined
          ? [
              {
                subject: paymentRef,
                revision: AggregateRevisionSchema.parse(input.paymentRevision),
              },
            ]
          : []),
        ...(input.walletRevision !== undefined && input.walletAccountId !== undefined
          ? [
              {
                subject: canonicalReference('account', input.walletAccountId),
                revision: AggregateRevisionSchema.parse(input.walletRevision),
              },
            ]
          : []),
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
              templateId: 'booking_change_request_resolved',
              templateVersion: 'v1',
              renderInputs: {
                bookingChangeRequestId: input.bookingChangeRequestId,
                bookingId: input.bookingId,
                resolution: input.resolution,
              },
              deliverySemantics: 'transactional',
            },
          ],
  };
}
