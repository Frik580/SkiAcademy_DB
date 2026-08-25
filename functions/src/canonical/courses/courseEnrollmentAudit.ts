import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type CourseId,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';
import type { CourseEnrollmentCreationMode } from './courseEnrollmentAuthorization';

export function buildCreateCourseEnrollmentsAuditPlan(input: {
  readonly envelope: CommandEnvelope<'create_course_enrollments'>;
  readonly courseId: CourseId;
  readonly courseRevision: number;
  readonly enrollmentIds: readonly CourseEnrollmentId[];
  readonly paymentIds: readonly PaymentId[];
  readonly monetaryEventIds: readonly MonetaryEventId[];
  readonly mode: CourseEnrollmentCreationMode;
  readonly underfunded: boolean;
  readonly includeWalletEffect: boolean;
  readonly notificationAccountId?: AccountId;
  readonly walletRevision?: number;
}): AuditOutboxStagingPlan {
  const primaryEnrollmentId = input.enrollmentIds[0]!;
  const primaryEnrollmentRef = canonicalReference('course_enrollment', primaryEnrollmentId);
  const courseRef = canonicalReference('course', input.courseId);
  const paymentRefs = input.paymentIds.map((paymentId) =>
    canonicalReference('payment', paymentId)
  );
  const enrollmentRefs = input.enrollmentIds.map((enrollmentId) =>
    canonicalReference('course_enrollment', enrollmentId)
  );

  const reasonCode =
    input.mode === 'administrator' && input.underfunded
      ? ('manual_override' as const)
      : input.mode === 'guest'
        ? ('other' as const)
        : ('self_service_booking' as const);
  const explanation =
    reasonCode === 'manual_override'
      ? 'Administrator course enrollment with temporary underpayment'
      : reasonCode === 'other'
        ? 'Guest course enrollment request'
        : undefined;

  const effects: AuditOutboxStagingPlan['activityLog']['effects'] = [
    {
      kind: 'course_enrollment_lifecycle_changed',
      subjectRef: primaryEnrollmentRef,
      summary: 'Course enrollment created',
    },
    ...paymentRefs.map((paymentRef) => ({
      kind: 'payment_state_changed' as const,
      subjectRef: paymentRef,
      summary: 'Payment created for course enrollment',
    })),
    ...(input.includeWalletEffect
      ? [
          {
            kind: 'wallet_balance_changed' as const,
            subjectRef: canonicalReference('account', input.notificationAccountId!),
            summary: 'Wallet debited for course enrollment',
          },
        ]
      : []),
    {
      kind: 'resource_claim_changed',
      subjectRef: primaryEnrollmentRef,
      summary: 'Course enrollment resource claims acquired',
    },
    {
      kind: 'outbox_obligation_created',
      subjectRef: primaryEnrollmentRef,
      summary: 'Course enrollment notification queued',
    },
  ];

  const resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'] = [
    {
      subject: courseRef,
      revision: AggregateRevisionSchema.parse(input.courseRevision),
    },
    ...enrollmentRefs.map((enrollmentRef) => ({
      subject: enrollmentRef,
      revision: AggregateRevisionSchema.parse(1),
    })),
    ...paymentRefs.map((paymentRef) => ({
      subject: paymentRef,
      revision: AggregateRevisionSchema.parse(1),
    })),
    ...(input.includeWalletEffect && input.walletRevision !== undefined
      ? [
          {
            subject: canonicalReference('account', input.notificationAccountId!),
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
        kind: 'course_enrollment',
        id: primaryEnrollmentId,
        subjectKey: `course_enrollment:${primaryEnrollmentId}`,
      },
      affectedSubjects: [courseRef, ...enrollmentRefs, ...paymentRefs],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions,
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: {
          kind: input.mode === 'guest' ? 'guest' : 'account',
          id:
            input.mode === 'guest'
              ? (envelopeGuestSubjectId(input.envelope) as string)
              : (input.notificationAccountId as string),
        },
        channel: 'in_app',
        templateId: 'course_enrollment_created',
        templateVersion: 'v1',
        renderInputs: { courseId: input.courseId, enrollmentId: primaryEnrollmentId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

function envelopeGuestSubjectId(
  envelope: CommandEnvelope<'create_course_enrollments'>
): import('@ski-academy/shared-domain').GuestSubjectId {
  const actor = envelope.context.actor;
  if (actor.kind !== 'guest') {
    throw new Error('Expected guest actor');
  }
  return actor.guestSubjectId;
}
