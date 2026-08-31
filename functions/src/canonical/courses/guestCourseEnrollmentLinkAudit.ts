import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AuditOutboxStagingPlan,
  type AccountId,
  type CourseEnrollmentId,
  type ParticipantId,
  type PaymentId,
} from '@ski-academy/shared-domain';

export function buildLinkGuestCourseEnrollmentAuditPlan(input: {
  readonly linkedAccountId: AccountId;
  readonly enrollmentId: CourseEnrollmentId;
  readonly enrollmentRevision: number;
  readonly participantId: ParticipantId;
  readonly participantRevision: number;
  readonly managementRevision?: number;
  readonly paymentId: PaymentId;
  readonly paymentRevision: number;
  readonly participantChanged: boolean;
  readonly managementCreated: boolean;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.enrollmentId);
  const participantRef = canonicalReference('participant', input.participantId);
  const paymentRef = canonicalReference('payment', input.paymentId);

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'guest_course_enrollment_linked',
      subjectRef: enrollmentRef,
      summary: 'Guest course enrollment linked to account',
    },
    ...(input.managementCreated
      ? [
          {
            kind: 'participant_access_changed' as const,
            subjectRef: participantRef,
            summary: 'Participant management established for linked enrollment',
          },
        ]
      : []),
    ...(input.participantChanged
      ? [
          {
            kind: 'resource_claim_changed' as const,
            subjectRef: enrollmentRef,
            summary: 'Participant course day claims migrated for linked enrollment',
          },
        ]
      : []),
    {
      kind: 'payment_association_changed',
      subjectRef: paymentRef,
      summary: 'Payment payer account associated on guest enrollment link',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: enrollmentRef,
      summary: 'Guest course enrollment link notification queued',
    },
  ];

  const resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'] = [
    {
      subject: enrollmentRef,
      revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
    },
    {
      subject: participantRef,
      revision: AggregateRevisionSchema.parse(input.participantRevision),
    },
    {
      subject: paymentRef,
      revision: AggregateRevisionSchema.parse(input.paymentRevision),
    },
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'participant_management',
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.enrollmentId,
        subjectKey: `course_enrollment:${input.enrollmentId}`,
      },
      affectedSubjects: [enrollmentRef, participantRef, paymentRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions,
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: input.linkedAccountId },
        channel: 'in_app',
        templateId: 'guest_course_enrollment_linked',
        templateVersion: 'v1',
        renderInputs: {
          enrollmentId: input.enrollmentId,
          participantId: input.participantId,
        },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

export function buildLinkGuestCourseEnrollmentAsAdministratorAuditPlan(input: {
  readonly linkedAccountId: AccountId;
  readonly enrollmentId: CourseEnrollmentId;
  readonly enrollmentRevision: number;
  readonly previousParticipantId: ParticipantId;
  readonly participantId: ParticipantId;
  readonly participantRevision: number;
  readonly paymentId: PaymentId;
  readonly paymentRevision: number;
  readonly paymentAssociationChanged: boolean;
  readonly reasonExplanation: string;
}): AuditOutboxStagingPlan {
  const enrollmentRef = canonicalReference('course_enrollment', input.enrollmentId);
  const participantRef = canonicalReference('participant', input.participantId);
  const paymentRef = canonicalReference('payment', input.paymentId);

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'guest_course_enrollment_linked',
      subjectRef: enrollmentRef,
      summary: 'Guest course enrollment identity linked by administrator',
    },
    {
      kind: 'resource_claim_changed',
      subjectRef: enrollmentRef,
      summary: 'Participant course day claims migrated for admin guest identity link',
    },
    ...(input.paymentAssociationChanged
      ? [
          {
            kind: 'payment_association_changed' as const,
            subjectRef: paymentRef,
            summary: 'Payment payer account associated on admin guest enrollment link',
          },
        ]
      : []),
    {
      kind: 'outbox_obligation_created',
      subjectRef: enrollmentRef,
      summary: 'Guest course enrollment identity link notification queued',
    },
  ];

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'participant_management',
        explanation: input.reasonExplanation,
      },
      primarySubject: {
        kind: 'course_enrollment',
        id: input.enrollmentId,
        subjectKey: `course_enrollment:${input.enrollmentId}`,
      },
      affectedSubjects: [enrollmentRef, participantRef, paymentRef],
      effects,
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: enrollmentRef,
          revision: AggregateRevisionSchema.parse(input.enrollmentRevision),
        },
        {
          subject: participantRef,
          revision: AggregateRevisionSchema.parse(input.participantRevision),
        },
        {
          subject: paymentRef,
          revision: AggregateRevisionSchema.parse(input.paymentRevision),
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: input.linkedAccountId },
        channel: 'in_app',
        templateId: 'guest_course_enrollment_linked',
        templateVersion: 'v1',
        renderInputs: {
          enrollmentId: input.enrollmentId,
          previousParticipantId: input.previousParticipantId,
          participantId: input.participantId,
          accountId: input.linkedAccountId,
        },
        deliverySemantics: 'transactional',
      },
    ],
  };
}
