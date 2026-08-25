import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AuditOutboxStagingPlan,
  type BookingId,
  type BookingProposalId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildCreateProposalAuditPlan(input: {
  proposalId: BookingProposalId;
  proposalRevision: number;
  notificationAccountId: AccountId;
}): AuditOutboxStagingPlan {
  const proposalRef = canonicalReference('booking_proposal', input.proposalId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: 'Instructor booking proposal created',
      },
      primarySubject: {
        kind: 'booking_proposal',
        id: input.proposalId,
        subjectKey: `booking_proposal:${input.proposalId}`,
      },
      affectedSubjects: [proposalRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: proposalRef,
          summary: 'Booking proposal notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: proposalRef,
          revision: AggregateRevisionSchema.parse(input.proposalRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: input.notificationAccountId },
        channel: 'in_app',
        templateId: 'booking_proposal_created',
        templateVersion: 'v1',
        renderInputs: { bookingProposalId: input.proposalId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildAcceptProposalAuditPlan(input: {
  envelope: CommandEnvelope<'accept_booking_proposal'>;
  proposalId: BookingProposalId;
  proposalRevision: number;
  bookingId: BookingId;
  paymentId: PaymentId;
  monetaryEventIds: readonly MonetaryEventId[];
  bookingRevision: number;
  paymentRevision: number;
  notificationAccountId: AccountId;
  walletRevision?: number;
  includeWalletEffect: boolean;
  unavailable: boolean;
}): AuditOutboxStagingPlan {
  const proposalRef = canonicalReference('booking_proposal', input.proposalId);

  if (input.unavailable) {
    return {
      activityLog: {
        reason: {
          registryVersion: AUDIT_REASON_REGISTRY_VERSION,
          reasonCode: 'other',
          explanation: 'Booking proposal became unavailable during acceptance',
        },
        primarySubject: {
          kind: 'booking_proposal',
          id: input.proposalId,
          subjectKey: `booking_proposal:${input.proposalId}`,
        },
        affectedSubjects: [proposalRef],
        effects: [
          {
            kind: 'outbox_obligation_created',
            subjectRef: proposalRef,
            summary: 'Booking proposal unavailable notification queued',
          },
        ],
        monetaryEventIds: [],
        adminIssueIds: [],
        resultingRevisions: [
          {
            subject: proposalRef,
            revision: AggregateRevisionSchema.parse(input.proposalRevision),
          },
        ],
      },
      outboxObligations: [
        {
          deliveryEffectOrdinal: 0,
          recipient: { kind: 'account', id: input.notificationAccountId },
          channel: 'in_app',
          templateId: 'booking_proposal_unavailable',
          templateVersion: 'v1',
          renderInputs: { bookingProposalId: input.proposalId },
          deliverySemantics: 'transactional',
        },
      ],
    };
  }

  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);
  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'booking_lifecycle_changed',
      subjectRef: bookingRef,
      summary: 'Confirmed booking created from proposal acceptance',
    },
    {
      kind: 'payment_state_changed',
      subjectRef: paymentRef,
      summary: 'Payment created for accepted booking proposal',
    },
    {
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking resource claims acquired from proposal acceptance',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: bookingRef,
      summary: 'Booking proposal acceptance notification queued',
    },
  ];

  const resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'] = [
    {
      subject: proposalRef,
      revision: AggregateRevisionSchema.parse(input.proposalRevision),
    },
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
        reasonCode: 'self_service_booking',
        explanation: 'Account owner accepted instructor booking proposal',
      },
      primarySubject: {
        kind: 'booking_proposal',
        id: input.proposalId,
        subjectKey: `booking_proposal:${input.proposalId}`,
      },
      affectedSubjects: [proposalRef, bookingRef, paymentRef],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions,
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: input.notificationAccountId },
        channel: 'in_app',
        templateId: 'booking_proposal_accepted',
        templateVersion: 'v1',
        renderInputs: {
          bookingProposalId: input.proposalId,
          bookingId: input.bookingId,
        },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildCancelProposalAuditPlan(input: {
  proposalId: BookingProposalId;
  proposalRevision: number;
  lifecycle: 'declined' | 'cancelled';
  notificationAccountId: AccountId;
}): AuditOutboxStagingPlan {
  const proposalRef = canonicalReference('booking_proposal', input.proposalId);
  const summary =
    input.lifecycle === 'declined'
      ? 'Booking proposal declined by account owner'
      : 'Booking proposal withdrawn by instructor';

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: summary,
      },
      primarySubject: {
        kind: 'booking_proposal',
        id: input.proposalId,
        subjectKey: `booking_proposal:${input.proposalId}`,
      },
      affectedSubjects: [proposalRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: proposalRef,
          summary: 'Booking proposal cancellation notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: proposalRef,
          revision: AggregateRevisionSchema.parse(input.proposalRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: input.notificationAccountId },
        channel: 'in_app',
        templateId:
          input.lifecycle === 'declined' ? 'booking_proposal_declined' : 'booking_proposal_cancelled',
        templateVersion: 'v1',
        renderInputs: { bookingProposalId: input.proposalId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildExpireProposalAuditPlan(input: {
  proposalId: BookingProposalId;
  proposalRevision: number;
}): AuditOutboxStagingPlan {
  const proposalRef = canonicalReference('booking_proposal', input.proposalId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'scheduled_system_action',
      },
      primarySubject: {
        kind: 'booking_proposal',
        id: input.proposalId,
        subjectKey: `booking_proposal:${input.proposalId}`,
      },
      affectedSubjects: [proposalRef],
      effects: [
        {
          kind: 'outbox_obligation_created',
          subjectRef: proposalRef,
          summary: 'Booking proposal expiry notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: proposalRef,
          revision: AggregateRevisionSchema.parse(input.proposalRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}
