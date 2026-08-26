import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AdminIssueId,
  type AuditOutboxStagingPlan,
  type CourseEnrollmentCancellationReasonCode,
  type CourseEnrollmentId,
  type CommandEnvelope,
  type CourseId,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildDirectClientCourseCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>;
  courseEnrollmentId: CourseEnrollmentId;
  paymentId: PaymentId;
  enrollmentRevision: number;
  paymentRevision: number;
  monetaryEventIds: readonly MonetaryEventId[];
  reasonCode: CourseEnrollmentCancellationReasonCode;
  walletRevision?: number;
  walletAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);
  const paymentRef = canonicalReference('payment', input.paymentId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: [enrollmentRef, paymentRef],
      effects: [
        {
          kind: 'course_enrollment_lifecycle_changed',
          subjectRef: enrollmentRef,
          summary: 'Course enrollment cancelled by account owner',
        },
        {
          kind: 'payment_state_changed',
          subjectRef: paymentRef,
          summary: 'Cancellation refund applied',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: enrollmentRef,
          summary: 'Course enrollment resource claims released',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: enrollmentRef,
          summary: 'Cancellation notification queued',
        },
      ],
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
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
              : input.courseEnrollmentId,
        },
        channel: 'in_app',
        templateId: 'course_enrollment_cancelled',
        templateVersion: 'v1',
        renderInputs: { courseEnrollmentId: input.courseEnrollmentId, reasonCode: input.reasonCode },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildPendingCourseCancellationRequestAuditPlan(input: {
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>;
  courseEnrollmentId: CourseEnrollmentId;
  enrollmentRevision: number;
  issue?: { readonly issueId: AdminIssueId; readonly revision: number; readonly effect: 'opened' | 'reused' };
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);
  const issueRef =
    input.issue === undefined ? undefined : canonicalReference('admin_issue', input.issue.issueId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: issueRef === undefined ? [enrollmentRef] : [enrollmentRef, issueRef],
      effects: [
        {
          kind: 'course_enrollment_lifecycle_changed',
          subjectRef: enrollmentRef,
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
          subjectRef: enrollmentRef,
          summary: 'Pending cancellation notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: input.issue === undefined ? [] : [input.issue.issueId],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
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
              : input.courseEnrollmentId,
        },
        channel: 'in_app',
        templateId: 'course_enrollment_pending_cancellation',
        templateVersion: 'v1',
        renderInputs: { courseEnrollmentId: input.courseEnrollmentId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildWithdrawCourseEnrollmentCancellationRequestAuditPlan(input: {
  envelope: CommandEnvelope<'withdraw_course_enrollment'>;
  courseEnrollmentId: CourseEnrollmentId;
  enrollmentRevision: number;
  resolvedIssue?: { readonly issueId: AdminIssueId; readonly revision: number };
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);
  const issueRef =
    input.resolvedIssue === undefined
      ? undefined
      : canonicalReference('admin_issue', input.resolvedIssue.issueId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'self_service_booking',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: issueRef === undefined ? [enrollmentRef] : [enrollmentRef, issueRef],
      effects: [
        {
          kind: 'course_enrollment_lifecycle_changed',
          subjectRef: enrollmentRef,
          summary: 'Cancellation request withdrawn',
        },
        ...(issueRef === undefined
          ? []
          : [
              {
                kind: 'admin_issue_resolved' as const,
                subjectRef: issueRef,
                summary: 'Unresolved pending cancellation issue resolved',
              },
            ]),
        {
          kind: 'outbox_obligation_created',
          subjectRef: enrollmentRef,
          summary: 'Cancellation withdrawal notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: input.resolvedIssue === undefined ? [] : [input.resolvedIssue.issueId],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
        },
        ...(issueRef && input.resolvedIssue
          ? [
              {
                subject: issueRef,
                revision: AggregateRevisionSchema.parse(input.resolvedIssue.revision),
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
              : input.courseEnrollmentId,
        },
        channel: 'in_app',
        templateId: 'course_enrollment_cancellation_withdrawn',
        templateVersion: 'v1',
        renderInputs: { courseEnrollmentId: input.courseEnrollmentId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildResolveCourseEnrollmentCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'resolve_course_enrollment_cancellation'>;
  courseEnrollmentId: CourseEnrollmentId;
  paymentId?: PaymentId;
  enrollmentRevision: number;
  paymentRevision?: number;
  monetaryEventIds: readonly MonetaryEventId[];
  walletRevision?: number;
  walletAccountId?: AccountId;
  issue?: { readonly issueId: AdminIssueId; readonly revision: number; readonly effect: 'opened' | 'reused' };
  resolvedPendingIssue?: { readonly issueId: AdminIssueId; readonly revision: number };
  summary: string;
  paymentEffectSummary?: string;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);
  const paymentRef =
    input.paymentId === undefined ? undefined : canonicalReference('payment', input.paymentId);
  const issueRef =
    input.issue === undefined ? undefined : canonicalReference('admin_issue', input.issue.issueId);
  const resolvedPendingRef =
    input.resolvedPendingIssue === undefined
      ? undefined
      : canonicalReference('admin_issue', input.resolvedPendingIssue.issueId);

  const effects: Array<AuditOutboxStagingPlan['activityLog']['effects'][number]> = [
    {
      kind: 'course_enrollment_lifecycle_changed',
      subjectRef: enrollmentRef,
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
      subjectRef: enrollmentRef,
      summary: 'Course enrollment resource claims released after cancellation',
    });
  }

  if (issueRef) {
    effects.push({
      kind: 'admin_issue_opened',
      subjectRef: issueRef,
      summary:
        input.issue?.effect === 'opened'
          ? 'Admin issue opened after rejection'
          : 'Admin issue reused after rejection',
    });
  }

  if (resolvedPendingRef) {
    effects.push({
      kind: 'admin_issue_resolved',
      subjectRef: resolvedPendingRef,
      summary: 'Unresolved pending cancellation issue resolved',
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
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: [
        enrollmentRef,
        ...(paymentRef ? [paymentRef] : []),
        ...(issueRef ? [issueRef] : []),
        ...(resolvedPendingRef ? [resolvedPendingRef] : []),
      ],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [
        ...(input.resolvedPendingIssue === undefined ? [] : [input.resolvedPendingIssue.issueId]),
        ...(input.issue === undefined ? [] : [input.issue.issueId]),
      ],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
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
        ...(resolvedPendingRef && input.resolvedPendingIssue
          ? [
              {
                subject: resolvedPendingRef,
                revision: AggregateRevisionSchema.parse(input.resolvedPendingIssue.revision),
              },
            ]
          : []),
      ],
    },
    outboxObligations: [],
  };
}

export function buildTransferCourseEnrollmentAuditPlan(input: {
  envelope: CommandEnvelope<'transfer_course_enrollment'>;
  courseEnrollmentId: CourseEnrollmentId;
  sourceCourseId: CourseId;
  targetCourseId: CourseId;
  enrollmentRevision: number;
  sourceCourseRevision: number;
  targetCourseRevision: number;
  paymentId?: PaymentId;
  paymentRevision?: number;
  monetaryEventIds: readonly MonetaryEventId[];
  walletRevision?: number;
  walletAccountId?: AccountId;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);
  const sourceCourseRef = canonicalReference('course', input.sourceCourseId);
  const targetCourseRef = canonicalReference('course', input.targetCourseId);
  const paymentRef =
    input.paymentId === undefined ? undefined : canonicalReference('payment', input.paymentId);

  const paymentEffects =
    paymentRef && input.monetaryEventIds.length > 0
      ? [
          {
            kind: 'payment_state_changed' as const,
            subjectRef: paymentRef,
            summary: 'Transfer price adjustment applied',
          },
          ...(input.walletRevision !== undefined && input.walletAccountId !== undefined
            ? [
                {
                  kind: 'wallet_balance_changed' as const,
                  subjectRef: canonicalReference('account', input.walletAccountId),
                  summary: 'Wallet adjusted for course transfer',
                },
              ]
            : []),
        ]
      : [];

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'course_enrollment_lifecycle_changed',
      subjectRef: enrollmentRef,
      summary: 'Course enrollment transferred to another course',
    },
    ...paymentEffects,
    {
      kind: 'resource_claim_changed',
      subjectRef: enrollmentRef,
      summary: 'Course enrollment resource claims moved to target course',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: enrollmentRef,
      summary: 'Course transfer notification queued',
    },
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: [
        enrollmentRef,
        sourceCourseRef,
        targetCourseRef,
        ...(paymentRef ? [paymentRef] : []),
      ],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
        },
        {
          subject: sourceCourseRef,
          revision: AggregateRevisionSchema.parse(input.sourceCourseRevision),
        },
        {
          subject: targetCourseRef,
          revision: AggregateRevisionSchema.parse(input.targetCourseRevision),
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
              : input.courseEnrollmentId,
        },
        channel: 'in_app',
        templateId: 'course_enrollment_transferred',
        templateVersion: 'v1',
        renderInputs: {
          courseEnrollmentId: input.courseEnrollmentId,
          sourceCourseId: input.sourceCourseId,
          targetCourseId: input.targetCourseId,
        },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildGuestCourseEnrollmentCancellationAuditPlan(input: {
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>;
  courseEnrollmentId: CourseEnrollmentId;
  enrollmentRevision: number;
  reasonCode: CourseEnrollmentCancellationReasonCode;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: 'Guest course enrollment cancellation',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: [enrollmentRef],
      effects: [
        {
          kind: 'course_enrollment_lifecycle_changed',
          subjectRef: enrollmentRef,
          summary: 'Guest course enrollment cancelled',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: enrollmentRef,
          summary: 'Guest course enrollment resource claims released',
        },
        {
          kind: 'outbox_obligation_created',
          subjectRef: enrollmentRef,
          summary: 'Guest cancellation notification queued',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'guest', id: input.courseEnrollmentId },
        channel: 'email',
        templateId: 'guest_course_enrollment_cancelled',
        templateVersion: 'v1',
        renderInputs: {
          courseEnrollmentId: input.courseEnrollmentId,
          reasonCode: input.reasonCode,
        },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildExpireGuestCourseEnrollmentReservationAuditPlan(input: {
  courseEnrollmentId: CourseEnrollmentId;
  enrollmentRevision: number;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.courseEnrollmentId);

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'scheduled_system_action',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.courseEnrollmentId,
        subjectKey: `course_enrollment:${input.courseEnrollmentId}`,
      },
      affectedSubjects: [enrollmentRef],
      effects: [
        {
          kind: 'course_enrollment_lifecycle_changed',
          subjectRef: enrollmentRef,
          summary: 'Guest course enrollment reservation expired',
        },
        {
          kind: 'resource_claim_changed',
          subjectRef: enrollmentRef,
          summary: 'Guest course enrollment claims released',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}
