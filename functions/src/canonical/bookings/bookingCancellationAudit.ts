import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AdminIssueId,
  type AuditOutboxStagingPlan,
  type BookingCancellationReasonCode,
  type BookingId,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildDirectClientCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'request_booking_cancellation'>;
  bookingId: BookingId;
  paymentId: PaymentId;
  bookingRevision: number;
  paymentRevision: number;
  monetaryEventIds: readonly MonetaryEventId[];
  reasonCode: BookingCancellationReasonCode;
  walletRevision?: number;
  walletAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef = canonicalReference('payment', input.paymentId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects: [bookingRef, paymentRef],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Booking cancelled by account owner',
        },
        {
          kind: 'payment_state_changed',
          subjectRef: paymentRef,
          summary: 'Cancellation refund applied',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: bookingRef,
          summary: 'Booking resource claims released',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Cancellation notification queued',
        },
      ],
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
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: {
          kind: 'account',
          id:
            input.envelope.context.actor.kind === 'account'
              ? input.envelope.context.actor.accountId
              : input.bookingId,
        },
        channel: 'in_app',
        templateId: 'booking_cancelled',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId, reasonCode: input.reasonCode },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildPendingCancellationRequestAuditPlan(input: {
  envelope: CommandEnvelope<'request_booking_cancellation'>;
  bookingId: BookingId;
  bookingRevision: number;
  issue?: { readonly issueId: AdminIssueId; readonly revision: number; readonly effect: 'opened' | 'reused' };
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const issueRef =
    input.issue === undefined ? undefined : canonicalReference('admin_issue', input.issue.issueId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
      },
      primarySubject: {
        kind: 'booking',
        id: input.bookingId,
        subjectKey: `booking:${input.bookingId}`,
      },
      affectedSubjects:
        issueRef === undefined ? [bookingRef] : [bookingRef, issueRef],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: bookingRef,
          summary: 'Late cancellation request submitted',
        },
        ...(issueRef === undefined
          ? []
          : [
              {
                kind: 'admin_issue_opened' as const,
                subjectRef: issueRef,
                summary:
                  input.issue?.effect === 'opened'
                    ? 'Unresolved pending cancellation issue opened'
                    : 'Unresolved pending cancellation issue reused',
              },
            ]),
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Pending cancellation notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: input.issue === undefined ? [] : [input.issue.issueId],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
        ...(input.issue === undefined
          ? []
          : [
              {
                subject: issueRef!,
                revision: AggregateRevisionSchema.parse(input.issue.revision),
              },
            ]),
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: {
          kind: 'account',
          id:
            input.envelope.context.actor.kind === 'account'
              ? input.envelope.context.actor.accountId
              : input.bookingId,
        },
        channel: 'in_app',
        templateId: 'booking_pending_cancellation',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildWithdrawCancellationRequestAuditPlan(input: {
  envelope: CommandEnvelope<'withdraw_booking_cancellation_request'>;
  bookingId: BookingId;
  bookingRevision: number;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
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
          summary: 'Cancellation request withdrawn',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: bookingRef,
          summary: 'Cancellation withdrawal notification queued',
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
        recipient: {
          kind: 'account',
          id:
            input.envelope.context.actor.kind === 'account'
              ? input.envelope.context.actor.accountId
              : input.bookingId,
        },
        channel: 'in_app',
        templateId: 'booking_cancellation_withdrawn',
        templateVersion: 'v1',
        renderInputs: { bookingId: input.bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildResolveCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'resolve_booking_cancellation'>;
  bookingId: BookingId;
  paymentId?: PaymentId;
  bookingRevision: number;
  paymentRevision?: number;
  monetaryEventIds: readonly MonetaryEventId[];
  walletRevision?: number;
  walletAccountId?: AccountId;
  issue?: { readonly issueId: AdminIssueId; readonly revision: number; readonly effect: 'opened' | 'reused' };
  summary: string;
  paymentEffectSummary?: string;
}): AuditOutboxStagingPlan {
  const bookingRef = canonicalReference('booking', input.bookingId);
  const paymentRef =
    input.paymentId === undefined ? undefined : canonicalReference('payment', input.paymentId);
  const issueRef =
    input.issue === undefined ? undefined : canonicalReference('admin_issue', input.issue.issueId);

  const effects: Array<AuditOutboxStagingPlan['activityLog']['effects'][number]> = [
    {
      kind: 'booking_lifecycle_changed',
      subjectRef: bookingRef,
      summary: input.summary,
    },
  ];

  if (paymentRef && input.paymentEffectSummary) {
    effects.push({
      kind: 'payment_state_changed',
      subjectRef: paymentRef,
      summary: input.paymentEffectSummary,
    });
  }

  if (input.monetaryEventIds.length > 0) {
    effects.push({
      kind: 'resource_claim_changed',
      subjectRef: bookingRef,
      summary: 'Booking resource claims released after cancellation',
    });
  }

  if (issueRef) {
    effects.push({
      kind: 'admin_issue_opened',
      subjectRef: issueRef,
      summary:
        input.issue?.effect === 'opened'
          ? 'Missing attendance issue opened after rejection'
          : 'Missing attendance issue reused after rejection',
    });
  }

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
      affectedSubjects: [bookingRef, ...(paymentRef ? [paymentRef] : []), ...(issueRef ? [issueRef] : [])],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: input.issue === undefined ? [] : [input.issue.issueId],
      resultingRevisions: [
        {
          subject: bookingRef,
          revision: AggregateRevisionSchema.parse(input.bookingRevision),
        },
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
        ...(issueRef && input.issue
          ? [
              {
                subject: issueRef,
                revision: AggregateRevisionSchema.parse(input.issue.revision),
              },
            ]
          : []),
      ],
    },
    outboxObligations: [],
  };
}
