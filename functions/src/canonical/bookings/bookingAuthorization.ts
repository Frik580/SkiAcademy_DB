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
    participants: readonly Participant[];
    managements: readonly ParticipantManagement[];
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
    if (
      input.participants.length === 0 ||
      input.participants.some((participant) => participant.management.kind !== 'managed') ||
      input.managements.length !== input.participants.length
    ) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    const managedAccountIds = new Set(input.managements.map((management) => management.accountId));
    if (managedAccountIds.size !== 1) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    const managedAccountId = input.managements[0]!.accountId;
    const payerAccountId = envelope.intent.payerAccountId ?? managedAccountId;
    if (payerAccountId !== managedAccountId && payerAccountId !== actor.accountId) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { field: 'payerAccountId', reason: 'conflict' },
      });
    }
    return {
      mode: 'administrator',
      actorAccountId: actor.accountId,
      payerAccountId,
      bookedByAccountId: managedAccountId,
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

  const authorities = input.participants.map((participant, index) => {
    const management = input.managements[index];
    if (!management) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    const access = assertAuthorizedParticipantManager(
      envelope,
      { account: input.account, participant, management },
      participant.participantId
    );
    if (!access.allowed) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return access.authority;
  });
  const requiresGuardianCapability = authorities.some(
    (authority) => authority === 'parent_guardian'
  );
  const expectedCapability = requiresGuardianCapability ? 'parent_guardian' : 'account_owner';
  if (envelope.context.exercisedCapability !== expectedCapability) {
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

export function normalizeBookingParticipantIds(
  envelope: CommandEnvelope<'create_confirmed_booking'>
): CommandEnvelope<'create_confirmed_booking'>['intent']['participantIds'] {
  const unique = new Set(envelope.intent.participantIds);
  if (unique.size !== envelope.intent.participantIds.length) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'conflict' },
    });
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
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
  if (evaluateNewServiceBlocked(topology, input.participant.participantId, instructorId)) {
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

export type PaymentStartGateActorMode = 'system' | 'administrator';

export function resolvePaymentStartGateAuthorization(
  envelope: CommandEnvelope<'enforce_payment_start_gate'>
): PaymentStartGateActorMode {
  const { actor, exercisedCapability, source } = envelope.context;
  if (
    actor.kind === 'system' &&
    exercisedCapability === 'system' &&
    (source === 'scheduler' || source === 'system_reconciliation')
  ) {
    return 'system';
  }
  if (
    actor.kind === 'account' &&
    exercisedCapability === 'administrator' &&
    source === 'admin_callable'
  ) {
    return 'administrator';
  }
  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}
