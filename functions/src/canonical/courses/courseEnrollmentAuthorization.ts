import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type Account,
  type AccountId,
  type CommandEnvelope,
  type Participant,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import {
  assertAccountActive,
  assertAdministrator,
  assertAuthorizedParticipantManager,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export type CourseEnrollmentCreationMode =
  | 'account_self_service'
  | 'administrator'
  | 'guest';

export interface CourseEnrollmentCreationAuthorization {
  readonly mode: CourseEnrollmentCreationMode;
  readonly actorAccountId?: AccountId;
  readonly payerAccountId?: AccountId;
  readonly bookedByAccountId?: AccountId;
}

export function resolveCourseEnrollmentCreationAuthorization(
  envelope: CommandEnvelope<'create_course_enrollments'>
): CourseEnrollmentCreationMode {
  if (envelope.context.actor.kind === 'guest') {
    if (
      envelope.context.source !== 'guest_callable' ||
      envelope.context.exercisedCapability !== 'guest'
    ) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return 'guest';
  }

  if (administratorCapabilityExercisedByAccount(envelope.context)) {
    if (envelope.context.source !== 'admin_callable') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    assertAdministrator(envelope);
    return 'administrator';
  }

  if (
    envelope.context.source !== 'client_callable' ||
    (envelope.context.exercisedCapability !== 'account_owner' &&
      envelope.context.exercisedCapability !== 'parent_guardian')
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  return 'account_self_service';
}

export function resolveManagedEnrollmentAuthorization(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  mode: CourseEnrollmentCreationMode,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
  }>
): CourseEnrollmentCreationAuthorization {
  if (mode === 'guest') {
    if (input.participant.management.kind !== 'unmanaged_guest') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    return { mode };
  }

  const actor = requireAccountActor(envelope);
  assertAccountActive(envelope, input.account);

  if (mode === 'administrator') {
    if (input.participant.management.kind !== 'managed') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    return {
      mode,
      actorAccountId: actor.accountId,
      payerAccountId: input.management.accountId,
      bookedByAccountId: input.management.accountId,
    };
  }

  const access = assertAuthorizedParticipantManager(
    envelope,
    input,
    input.participant.participantId
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

  return {
    mode,
    actorAccountId: actor.accountId,
    payerAccountId: actor.accountId,
    bookedByAccountId: actor.accountId,
  };
}

export function assertAdminEnrollmentUnderpaymentReason(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  outstandingAmount: number
): void {
  if (outstandingAmount <= 0) {
    return;
  }
  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}

export function assertManagedParticipantRecord(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  participant: Participant | undefined
): Participant {
  return assertParticipantActive(envelope, participant);
}
