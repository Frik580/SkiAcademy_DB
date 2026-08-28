import {
  CourseEnrollmentIdSchema,
  ParticipantIdSchema,
  canonicalDeterministicHash,
  courseEnrollmentIdFromCommandParticipant,
  type CourseEnrollmentId,
  type IdempotencyKey,
  type ParticipantId,
} from '@ski-academy/shared-domain';

export function createLogicalEnrollmentAttemptId(): CourseEnrollmentId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return CourseEnrollmentIdSchema.parse(
      `enrollment_${crypto.randomUUID().replace(/-/g, '')}`
    );
  }
  return CourseEnrollmentIdSchema.parse(
    `enrollment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export function deriveGuestParticipantIdForEnrollment(enrollmentId: string): ParticipantId {
  return ParticipantIdSchema.parse(
    canonicalDeterministicHash(['participant:v1', 'guest_course_enrollment', enrollmentId])
  );
}

export function deriveAuthenticatedCreateEnrollmentIdempotencyKey(
  courseId: string,
  participantIds: readonly string[]
): IdempotencyKey {
  const participantPart = [...participantIds].sort().join(',');
  return `create-course-enrollment:${courseId}:${participantPart}` as IdempotencyKey;
}

export function deriveGuestCreateEnrollmentIdempotencyKey(enrollmentId: string): IdempotencyKey {
  return `create-guest-course-enrollment:${enrollmentId}` as IdempotencyKey;
}

export function deriveWithdrawEnrollmentIdempotencyKey(
  enrollmentId: string,
  expectedRevision: number
): IdempotencyKey {
  return `withdraw-course-enrollment:${enrollmentId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveRequestCancellationIdempotencyKey(
  enrollmentId: string,
  expectedRevision: number
): IdempotencyKey {
  return `request-course-enrollment-cancellation:${enrollmentId}:${expectedRevision}` as IdempotencyKey;
}

export function resolveEnrollmentIdsForAuthenticatedCommand(input: {
  readonly commandId: string;
  readonly participantIds: readonly string[];
}): readonly CourseEnrollmentId[] {
  return input.participantIds.map((participantId) =>
    courseEnrollmentIdFromCommandParticipant({
      commandId: input.commandId as never,
      participantId: ParticipantIdSchema.parse(participantId),
    })
  );
}
