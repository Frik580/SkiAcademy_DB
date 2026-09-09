import {
  CanonicalCommandError,
  duplicateParticipantIndexes,
  evaluateInstructorParticipantAccess,
  isBookingProposalAcceptanceAllowedBeforeStart,
  isBookingProposalExpired,
  isTerminalBookingProposalStatus,
  proposalParticipantIds,
  resolveBookingProposalExpiresAt,
  resolveClientCallableCapabilityFromPartyAuthorities,
  type Account,
  type AccountId,
  type BookingProposal,
  type BookingScopedParticipantAccessEvidence,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type InstructorId,
  type Participant,
  type ParticipantAccessTopology,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import {
  assertAccountActive,
  assertAuthorizedParticipantManager,
  assertInstructorCapability,
  assertParticipantActive,
  buildParticipantAccessTopology,
  evaluateNewServiceBlocked,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export type CancelBookingProposalActor = 'instructor' | 'participant_manager';

export interface AcceptBookingProposalAuthorization {
  readonly actorAccountId: AccountId;
  readonly payerAccountId: AccountId;
  readonly bookedByAccountId: AccountId;
}

export function assertBookingProposalScheduleContext(
  envelope: CommandEnvelope<'create_booking_proposal'>
): void {
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
}

export function assertCreateProposalAuthorization(
  envelope: CommandEnvelope<'create_booking_proposal'>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertInstructorCapability(envelope, envelope.intent.instructorId);
  assertBookingProposalScheduleContext(envelope);
}

export function assertCreateProposalParty(envelope: CommandEnvelope<'create_booking_proposal'>): {
  readonly participantIds: CommandEnvelope<'create_booking_proposal'>['intent']['participantIds'];
} {
  const participantIds = envelope.intent.participantIds;
  if (participantIds.length < 1) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'required' },
    });
  }
  if (duplicateParticipantIndexes(participantIds).length > 0) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'conflict' },
    });
  }
  return { participantIds };
}

export function assertProposalPartyWithinMaxParticipants(
  envelope: CommandEnvelope,
  input: Readonly<{
    participantCount: number;
    maxParticipantsPerLesson: number;
  }>
): void {
  if (input.participantCount > input.maxParticipantsPerLesson) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'conflict' },
    });
  }
}

export function assertProposalPartySharesManagingAccount(
  envelope: CommandEnvelope,
  managements: readonly ParticipantManagement[]
): ParticipantManagement['accountId'] {
  const accountIds = new Set(managements.map((management) => management.accountId));
  if (accountIds.size !== 1 || managements.length === 0) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
  return managements[0]!.accountId;
}

export function assertAcceptProposalAuthorization(
  envelope: CommandEnvelope<'accept_booking_proposal'>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  const capability = envelope.context.exercisedCapability;
  if (capability !== 'account_owner' && capability !== 'parent_guardian') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
}

export function assertCancelProposalAuthorization(
  envelope: CommandEnvelope<'cancel_booking_proposal'>
): CancelBookingProposalActor {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  if (envelope.context.exercisedCapability === 'instructor') {
    requireAccountActor(envelope);
    return 'instructor';
  }

  if (
    envelope.context.exercisedCapability === 'account_owner' ||
    envelope.context.exercisedCapability === 'parent_guardian'
  ) {
    requireAccountActor(envelope);
    return 'participant_manager';
  }

  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}

export function assertExpireProposalAuthorization(
  envelope: CommandEnvelope<'expire_booking_proposal'>
): void {
  const { actor, exercisedCapability, source } = envelope.context;
  if (
    actor.kind !== 'system' ||
    exercisedCapability !== 'system' ||
    (source !== 'scheduler' && source !== 'system_reconciliation')
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertOpenBookingProposal(
  envelope: CommandEnvelope,
  proposal: BookingProposal | undefined
): BookingProposal {
  if (!proposal) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'bookingProposalId', reason: 'conflict' },
    });
  }
  if (isTerminalBookingProposalStatus(proposal.lifecycle.status)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'conflict' },
    });
  }
  if (proposal.lifecycle.status !== 'open') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'conflict' },
    });
  }
  return proposal;
}

export function assertProposalAcceptanceWindow(
  envelope: CommandEnvelope,
  proposal: BookingProposal,
  now: CanonicalTimestamp
): void {
  const expiresAt = resolveBookingProposalExpiresAt({
    createdAt: proposal.createdAt,
    serviceStartsAt: proposal.proposedService.interval.startsAt,
  });
  if (isBookingProposalExpired({ now, expiresAt })) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'expiresAt', reason: 'out_of_range' },
    });
  }
  if (
    !isBookingProposalAcceptanceAllowedBeforeStart({
      now,
      serviceStartsAt: proposal.proposedService.interval.startsAt,
    })
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }
}

export function assertCreateProposalServiceStartsInFuture(
  envelope: CommandEnvelope<'create_booking_proposal'>,
  now: CanonicalTimestamp,
  serviceStartsAt: CanonicalTimestamp
): void {
  if (
    !isBookingProposalAcceptanceAllowedBeforeStart({
      now,
      serviceStartsAt,
    })
  ) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'out_of_range' },
    });
  }
}

export function assertInstructorParticipantRelationship(
  envelope: CommandEnvelope,
  topology: ParticipantAccessTopology,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: Participant['participantId'];
    at: CanonicalTimestamp;
    bookingScopedEvidence?: readonly BookingScopedParticipantAccessEvidence[];
  }>
): void {
  const access = evaluateInstructorParticipantAccess(topology, {
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    bookingScopedEvidence: input.bookingScopedEvidence ?? [],
  });
  if (!access.allowed) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
}

export function assertNoActiveServiceBlockForProposal(
  envelope: CommandEnvelope,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantBlocks: readonly import('@ski-academy/shared-domain').ParticipantBlock[];
  }>,
  instructorId: InstructorId
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

export function resolveAcceptProposalParticipantAuthorization(
  envelope: CommandEnvelope,
  input: Readonly<{
    account: Account;
    participants: readonly Participant[];
    managements: readonly ParticipantManagement[];
    proposal: BookingProposal;
  }>
): AcceptBookingProposalAuthorization {
  const actor = requireAccountActor(envelope);
  assertAccountActive(envelope, input.account);
  const partyIds = proposalParticipantIds(input.proposal);
  if (input.participants.length !== partyIds.length || input.managements.length !== partyIds.length) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }

  const authorities: ('self' | 'parent_guardian')[] = [];
  for (const participantId of partyIds) {
    const participant = input.participants.find((entry) => entry.participantId === participantId);
    const management = input.managements.find((entry) => entry.participantId === participantId);
    if (!participant || !management) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'participantIds', reason: 'conflict' },
      });
    }
    assertParticipantActive(envelope, participant);
    if (participant.management.kind !== 'managed') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
    const access = assertAuthorizedParticipantManager(
      envelope,
      { account: input.account, participant, management },
      participantId
    );
    if (!access.allowed) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    authorities.push(access.authority);
  }

  const expectedCapability = resolveClientCallableCapabilityFromPartyAuthorities(authorities);
  if (envelope.context.exercisedCapability !== expectedCapability) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  return {
    actorAccountId: actor.accountId,
    payerAccountId: actor.accountId,
    bookedByAccountId: actor.accountId,
  };
}

export function assertCancelProposalActorMatchesProposal(
  envelope: CommandEnvelope<'cancel_booking_proposal'>,
  proposal: BookingProposal,
  actor: CancelBookingProposalActor
): void {
  if (actor === 'instructor') {
    assertInstructorCapability(envelope, proposal.instructorId);
    return;
  }

  requireAccountActor(envelope);
}

export function assertCancelProposalParticipantAuthorization(
  envelope: CommandEnvelope<'cancel_booking_proposal'>,
  input: Readonly<{
    account: Account;
    participants: readonly Participant[];
    managements: readonly ParticipantManagement[];
    proposal: BookingProposal;
  }>
): void {
  resolveAcceptProposalParticipantAuthorization(envelope, input);
}

export function assertProposalExpiredForSystemExpiry(
  envelope: CommandEnvelope<'expire_booking_proposal'>,
  proposal: BookingProposal,
  now: CanonicalTimestamp
): void {
  const expiresAt = resolveBookingProposalExpiresAt({
    createdAt: proposal.createdAt,
    serviceStartsAt: proposal.proposedService.interval.startsAt,
  });
  if (!isBookingProposalExpired({ now, expiresAt })) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'expiresAt', reason: 'out_of_range' },
    });
  }
}
