import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  evaluateParticipantManagementAccess,
  isParticipantInstructorPairBlockedForNewService,
  type Account,
  type AccountId,
  type CommandContext,
  type CommandEnvelope,
  type InstructorId,
  type InstructorRelationship,
  type Participant,
  type ParticipantAccessTopology,
  participantBlockActorKey,
  type ParticipantBlock,
  type ParticipantBlockCreator,
  type ParticipantManagement,
  type ParticipantManagementActiveOwnerGuard,
  type ParticipantManagementId,
} from '@ski-academy/shared-domain';

export interface ParticipantAccessReadModel {
  readonly account?: Account;
  readonly participant?: Participant;
  readonly management?: ParticipantManagement;
  readonly activeOwnerGuard?: ParticipantManagementActiveOwnerGuard;
  readonly instructorRelationship?: InstructorRelationship;
  readonly participantBlock?: ParticipantBlock;
  readonly topology: ParticipantAccessTopology;
}

export function buildParticipantAccessTopology(
  input: Readonly<{
    account?: Account;
    participant?: Participant;
    management?: ParticipantManagement;
    activeOwnerGuard?: ParticipantManagementActiveOwnerGuard;
    instructorRelationship?: InstructorRelationship;
    participantBlock?: ParticipantBlock;
    additionalManagement?: readonly ParticipantManagement[];
    additionalRelationships?: readonly InstructorRelationship[];
    additionalBlocks?: readonly ParticipantBlock[];
  }>
): ParticipantAccessTopology {
  const accounts = input.account ? [input.account] : [];
  const participants = input.participant ? [input.participant] : [];
  const participantManagement = [
    ...(input.management ? [input.management] : []),
    ...(input.additionalManagement ?? []),
  ];
  const activeOwnerGuards = input.activeOwnerGuard ? [input.activeOwnerGuard] : [];
  const instructorRelationships = [
    ...(input.instructorRelationship ? [input.instructorRelationship] : []),
    ...(input.additionalRelationships ?? []),
  ];
  const participantBlocks = [
    ...(input.participantBlock ? [input.participantBlock] : []),
    ...(input.additionalBlocks ?? []),
  ];

  return {
    accounts,
    participants,
    participantManagement,
    activeOwnerGuards,
    instructorRelationships,
    participantBlocks,
  } as ParticipantAccessTopology;
}

export function buildParticipantAccessReadModel(
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    activeOwnerGuard?: ParticipantManagementActiveOwnerGuard;
    instructorRelationships?: readonly InstructorRelationship[];
    participantBlocks?: readonly ParticipantBlock[];
  }>
): ParticipantAccessTopology {
  return buildParticipantAccessTopology({
    account: input.account,
    participant: input.participant,
    management: input.management,
    activeOwnerGuard: input.activeOwnerGuard,
    additionalRelationships: input.instructorRelationships,
    additionalBlocks: input.participantBlocks,
  });
}

export function requireAccountActor(
  envelope: CommandEnvelope,
  field = 'actor'
): { readonly accountId: AccountId } {
  if (envelope.context.actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field, reason: 'conflict' },
    });
  }
  return { accountId: envelope.context.actor.accountId };
}

export function assertCapabilityMatchesManagementAuthority(
  envelope: CommandEnvelope,
  authority: 'self' | 'parent_guardian'
): void {
  const capability = envelope.context.exercisedCapability;
  if (authority === 'self' && capability !== 'account_owner') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (authority === 'parent_guardian' && capability !== 'parent_guardian') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertAuthorizedParticipantManager(
  envelope: CommandEnvelope,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
  }>,
  participantId: Participant['participantId']
): ReturnType<typeof evaluateParticipantManagementAccess> {
  const actor = requireAccountActor(envelope);
  const decision = evaluateParticipantManagementAccess(
    buildParticipantAccessTopology({
      account: input.account,
      participant: input.participant,
      management: input.management,
    }),
    {
      accountId: actor.accountId,
      participantId,
    }
  );
  if (!decision.allowed) {
    throw new CanonicalCommandError(
      decision.reason === 'unauthorized' ? 'forbidden' : 'invalid_transition',
      {
        correlationId: envelope.context.correlationId,
        ...(decision.reason === 'participant_inactive'
          ? { details: { resourceKind: 'participant', reason: 'conflict' } }
          : {}),
      }
    );
  }
  return decision;
}

export function assertAdministrator(
  envelope: CommandEnvelope
): { readonly accountId: AccountId } {
  const actor = requireAccountActor(envelope);
  if (!administratorCapabilityExercisedByAccount(envelope.context)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  return actor;
}

export function assertInstructorCapability(
  envelope: CommandEnvelope,
  instructorId: InstructorId
): void {
  requireAccountActor(envelope);
  if (envelope.context.exercisedCapability !== 'instructor') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const transportInstructorId = envelope.context.transportMetadata?.instructor_id;
  if (transportInstructorId !== undefined && transportInstructorId !== instructorId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field: 'instructorId', reason: 'conflict' },
    });
  }
}

export function assertNotAdministratorForBlockMutation(envelope: CommandEnvelope): void {
  if (administratorCapabilityExercisedByAccount(envelope.context)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertParticipantActive(
  envelope: CommandEnvelope,
  participant: Participant | undefined
): Participant {
  if (!participant || participant.lifecycle.status !== 'active') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
  return participant;
}

export function assertAccountActive(
  envelope: CommandEnvelope,
  account: Account | undefined
): Account {
  if (!account || account.lifecycle.status !== 'active') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
    });
  }
  return account;
}

export function evaluateNewServiceBlocked(
  topology: ParticipantAccessTopology,
  participantId: Participant['participantId'],
  instructorId: InstructorId
): boolean {
  return isParticipantInstructorPairBlockedForNewService(topology, {
    participantId,
    instructorId,
  });
}

export function blockCreatorMatchesActor(
  context: CommandContext,
  block: ParticipantBlock,
  input: Readonly<{
    participantManagementId?: ParticipantManagementId;
    instructorId?: InstructorId;
  }> = {}
): boolean {
  if (block.createdBy.kind === 'instructor') {
    if (context.exercisedCapability !== 'instructor') {
      return false;
    }
    const instructorId = input.instructorId ?? context.transportMetadata?.instructor_id;
    if (!instructorId || instructorId !== block.createdBy.instructorId) {
      return false;
    }
    return true;
  }

  if (context.actor.kind !== 'account') {
    return false;
  }

  if (
    context.exercisedCapability !== 'parent_guardian' &&
    context.exercisedCapability !== 'account_owner'
  ) {
    return false;
  }

  const participantManagementId = input.participantManagementId;
  if (
    !participantManagementId ||
    participantManagementId !== block.createdBy.participantManagementId ||
    block.createdBy.accountId !== context.actor.accountId
  ) {
    return false;
  }

  return (
    participantBlockActorKey(block.createdBy) ===
    participantBlockActorKey({
      kind: 'participant_manager',
      accountId: context.actor.accountId,
      participantManagementId,
    })
  );
}

export function participantBlockCreatorFromContext(
  context: CommandContext,
  input: Readonly<{
    participantManagementId: ParticipantManagementId;
    instructorId?: InstructorId;
  }>
): ParticipantBlockCreator {
  if (context.exercisedCapability === 'instructor') {
    const instructorId = input.instructorId ?? context.transportMetadata?.instructor_id;
    if (!instructorId) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: context.correlationId,
      });
    }
    if (input.instructorId) {
      return { kind: 'instructor', instructorId: input.instructorId };
    }
    return { kind: 'instructor', instructorId: instructorId as InstructorId };
  }

  if (context.actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: context.correlationId,
    });
  }

  return {
    kind: 'participant_manager',
    accountId: context.actor.accountId,
    participantManagementId: input.participantManagementId,
  };
}
