import {
  CanonicalCommandError,
  compareCanonicalTimestamps,
  guestSubjectIdFromCourseEnrollmentId,
  isGuestReservationExpired,
  type CommandEnvelope,
  type Course,
  type CourseEnrollment,
  type GuestSubjectId,
} from '@ski-academy/shared-domain';
import { requireAccountActor, assertAdministrator } from '../participantAccess/participantAccessAuthorization';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';

const LINKABLE_LIFECYCLE_STATUSES = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
] as const);

export function assertLinkGuestCourseEnrollmentAuthorization(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (
    envelope.context.exercisedCapability !== 'account_owner' &&
    envelope.context.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
}

export function assertLinkableGuestCourseEnrollmentLifecycle(
  envelope: CommandEnvelope,
  enrollment: CourseEnrollment,
  now: ReturnType<typeof import('@ski-academy/shared-domain').timestampFromDate>
): void {
  if (!LINKABLE_LIFECYCLE_STATUSES.has(enrollment.lifecycle.status as 'pending')) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'conflict' },
    });
  }
  if (
    enrollment.lifecycle.status === 'pending' &&
    isGuestReservationExpired({
      now,
      reservationExpiresAt: enrollment.lifecycle.reservationExpiresAt,
    })
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
    });
  }
}

export function assertDurableGuestCourseEnrollmentAttribution(
  envelope: CommandEnvelope,
  enrollment: CourseEnrollment
): GuestSubjectId {
  if (enrollment.attribution.bookingOrigin !== 'guest') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }
  if (enrollment.attribution.bookedBy.kind !== 'guest') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }
  const expectedGuestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollment.enrollmentId);
  if (enrollment.attribution.bookedBy.guestSubjectId !== expectedGuestSubjectId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }
  return expectedGuestSubjectId;
}

export function verifyGuestCourseEnrollmentLinkCredential(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>,
  input: {
    readonly guestSubjectId: GuestSubjectId;
    readonly guestActionSecret: string | undefined;
    readonly now: ReturnType<typeof import('@ski-academy/shared-domain').timestampFromDate>;
    readonly expiresAt: import('@ski-academy/shared-domain').CanonicalTimestamp;
  }
): void {
  const { nonce, signature } = envelope.intent.guestLinkCredential;
  if (!input.guestActionSecret) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }
  const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
    secret: input.guestActionSecret,
    nonce,
    signature,
    now: input.now,
    expectedEnrollmentId: envelope.intent.enrollmentId,
    expectedGuestSubjectId: input.guestSubjectId,
    expectedPurpose: 'link_guest_course_enrollment',
    expiresAt: input.expiresAt,
  });
  if (!verification.valid) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertGuestAccountLinkIdempotency(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>,
  enrollment: CourseEnrollment,
  actorAccountId: import('@ski-academy/shared-domain').AccountId,
  linkedParticipantId: import('@ski-academy/shared-domain').ParticipantId
): 'first_link' | 'idempotent_replay' {
  const existing = enrollment.guestAccountLink;
  if (!existing) {
    return 'first_link';
  }
  const nonce = envelope.intent.guestLinkCredential.nonce;
  if (
    existing.linkedAccountId === actorAccountId &&
    existing.linkedParticipantId === linkedParticipantId &&
    existing.credentialNonce === nonce
  ) {
    return 'idempotent_replay';
  }
  if (existing.credentialNonce === undefined) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (existing.linkedAccountId !== actorAccountId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (existing.linkedParticipantId !== linkedParticipantId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantTarget', reason: 'conflict' },
    });
  }
  if (existing.credentialNonce !== nonce) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }
  return 'idempotent_replay';
}

export function assertParticipantChangingLinkAllowed(
  envelope: CommandEnvelope,
  enrollment: CourseEnrollment,
  course: Course,
  now: ReturnType<typeof import('@ski-academy/shared-domain').timestampFromDate>
): void {
  if (compareCanonicalTimestamps(now, course.startAt) >= 0) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'conflict' },
    });
  }
  const recordedDays = enrollment.attendanceSummary?.recordedDayCount ?? 0;
  if (recordedDays > 0) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'conflict' },
    });
  }
}

export function managementAuthorityMatchesCapability(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>,
  managementAuthority: 'self' | 'parent_guardian'
): void {
  const capability = envelope.context.exercisedCapability;
  if (capability === 'account_owner' && managementAuthority !== 'self') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (capability === 'parent_guardian' && managementAuthority !== 'parent_guardian') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertLinkGuestCourseEnrollmentAsAdministratorAuthorization(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account_as_administrator'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
  if (!envelope.intent.reasonExplanation.trim()) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}
