import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type Account,
  type CommandEnvelope,
  type CourseEnrollment,
  type Participant,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertAuthorizedParticipantManager,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export function assertAuthenticatedCourseCancellationAuthorization(
  envelope: CommandEnvelope<
    'request_course_enrollment_cancellation' | 'withdraw_course_enrollment'
  >,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantId: string;
  }>
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

  const access = assertAuthorizedParticipantManager(
    envelope,
    input,
    input.participantId as Participant['participantId']
  );
  if (!access.allowed) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (access.authority === 'self' && envelope.context.exercisedCapability !== 'account_owner') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (
    access.authority === 'parent_guardian' &&
    envelope.context.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertResolveCourseEnrollmentCancellationAuthorization(
  envelope: CommandEnvelope<'resolve_course_enrollment_cancellation'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);
  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}

export function assertTransferCourseEnrollmentAuthorization(
  envelope: CommandEnvelope<'transfer_course_enrollment'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);
  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}

export function assertConfirmedGuestCourseEnrollmentCannotSelfCancel(
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>,
  enrollment: CourseEnrollment
): void {
  if (
    envelope.context.source === 'guest_callable' &&
    enrollment.attribution.bookingOrigin === 'guest' &&
    enrollment.lifecycle.status === 'confirmed'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }
}

export function isAdministratorCourseEnrollmentCommand(envelope: CommandEnvelope): boolean {
  return administratorCapabilityExercisedByAccount(envelope.context);
}
