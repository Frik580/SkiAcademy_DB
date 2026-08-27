import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type BookingCancellationReasonCode,
  type BookingId,
  type CommandEnvelope,
  type ParticipantId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildCreateGuestBookingRequestAuditPlan(input: {
  envelope: CommandEnvelope<'create_guest_booking_request'>;
  bookingId: BookingId;
  paymentId: PaymentId;
  bookingRevision: number;
  paymentRevision: number;
  participantId?: ParticipantId;
  participantRevision?: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);
  const participantRef =
    input.participantId === undefined
      ? undefined
      : canonicalReference('participant', input.participantId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: 'Guest lesson reservation requested',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [
        bookingRef,
        paymentRef,
        ...(participantRef ? [participantRef] : []),
      ],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Guest booking reservation created',
        },
        {
          kind: 'payment_state_changed',
          subjectRef: paymentRef,
          summary: 'Payment created for guest booking',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: bookingRef,
          summary: 'Guest booking resource claims acquired',
        },
        ...(participantRef
          ? [
              {
                kind: 'participant_access_changed' as const,
                subjectRef: participantRef,
                summary: 'Guest participant provisioned for booking',
              },
            ]
          : []),
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Guest reservation notification queued',
        },
      ],
      monetaryEventIds: [],
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
        ...(participantRef && input.participantRevision !== undefined
          ? [
              {
                subject: participantRef,
                revision: AggregateRevisionSchema.parse(input.participantRevision),
              },
            ]
          : []),
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'guest', id: input.bookingId },
        channel: 'email',
        templateId: 'guest_booking_pending',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildConfirmGuestBookingAuditPlan(input: {
  bookingId: BookingId;
  bookingRevision: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: 'Administrator confirmed guest booking',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Guest booking confirmed',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Guest booking confirmation notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'guest', id: input.bookingId },
        channel: 'email',
        templateId: 'guest_booking_confirmed',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildExpireGuestReservationAuditPlan(input: {
  bookingId: BookingId;
  bookingRevision: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
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
      affectedSubjects: [bookingRef],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Guest reservation expired',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: bookingRef,
          summary: 'Guest reservation claims released',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildPendingGuestCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'request_booking_cancellation'>;
  bookingId: BookingId;
  bookingRevision: number;
  reasonCode: BookingCancellationReasonCode;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const reasonCode =
    input.reasonCode === 'guest_cancelled' ? ('other' as const) : ('manual_override' as const);
  const explanation =
    input.reasonCode === 'guest_cancelled'
      ? 'Guest cancelled pending reservation'
      : 'Administrator rejected pending guest reservation';

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode,
        explanation,
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Guest pending booking cancelled',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: bookingRef,
          summary: 'Guest pending booking claims released',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildLinkGuestBookingAuditPlan(input: {
  bookingId: BookingId;
  participantId: ParticipantId;
  bookingRevision: number;
  participantRevision: number;
  managementRevision: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const participantRef = canonicalReference('participant', input.participantId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'participant_management',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef, participantRef],
      effects: [
        {
          kind: 'participant_access_changed',
          subjectRef: participantRef,
          summary: 'Guest booking participant linked to account',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Guest booking link notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
        {
          subject: participantRef,
          revision: AggregateRevisionSchema.parse(input.participantRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'guest', id: input.bookingId },
        channel: 'in_app',
        templateId: 'guest_booking_linked',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId, participantId: input.participantId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}
