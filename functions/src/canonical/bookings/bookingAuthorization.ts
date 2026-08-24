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
  buildParticipantAccessTopology,
  evaluateNewServiceBlocked,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export type BookingCreationMode = 'account_self_service' | 'administrator';

export interface BookingCreationAuthorization {
  readonly mode: BookingCreationMode;
  readonly actorAccountId: AccountId;
  readonly payerAccountId: AccountId;
  readonly bookedByAccountId: AccountId;
}

export function resolveBookingCreationAuthorization(
  envelope: CommandEnvelope<'create_confirmed_booking'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
  }>
): BookingCreationAuthorization {
  const actor = requireAccountActor(envelope);
  assertAccountActive(envelope, input.account);

  if (administratorCapabilityExercisedByAccount(envelope.context)) {
    if (envelope.context.source !== 'admin_callable') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    assertAdministrator(envelope);
    if (input.participant.management.kind !== 'managed') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    const payerAccountId = envelope.intent.payerAccountId ?? input.management.accountId;
    if (payerAccountId !== input.management.accountId && payerAccountId !== actor.accountId) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { field: 'payerAccountId', reason: 'conflict' },
      });
    }
    return {
      mode: 'administrator',
      actorAccountId: actor.accountId,
      payerAccountId,
      bookedByAccountId: input.management.accountId,
    };
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

  const payerAccountId = envelope.intent.payerAccountId ?? actor.accountId;
  if (payerAccountId !== actor.accountId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field: 'payerAccountId', reason: 'conflict' },
    });
  }

  return {
    mode: 'account_self_service',
    actorAccountId: actor.accountId,
    payerAccountId,
    bookedByAccountId: actor.accountId,
  };
}

export function assertIndividualBookingParticipantCount(
  envelope: CommandEnvelope<'create_confirmed_booking'>
): void {
  if (envelope.intent.participantIds.length !== 1) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'unsupported' },
    });
  }
}

export function assertBookingScheduleContext(
  envelope: CommandEnvelope<'create_confirmed_booking'>
): void {
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
}

export function assertNoActiveServiceBlock(
  envelope: CommandEnvelope<'create_confirmed_booking'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantBlocks: readonly import('@ski-academy/shared-domain').ParticipantBlock[];
  }>,
  instructorId: import('@ski-academy/shared-domain').InstructorId
): void {
  const topology = buildParticipantAccessTopology({
    account: input.account,
    participant: input.participant,
    management: input.management,
    additionalBlocks: input.participantBlocks,
  });
  if (
    evaluateNewServiceBlocked(topology, input.participant.participantId, instructorId)
  ) {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
}

export function assertAdminUnderpaymentReason(
  envelope: CommandEnvelope<'create_confirmed_booking'>,
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

export function assertParticipantRecord(
  envelope: CommandEnvelope<'create_confirmed_booking'>,
  participant: Participant | undefined
): Participant {
  return assertParticipantActive(envelope, participant);
}
