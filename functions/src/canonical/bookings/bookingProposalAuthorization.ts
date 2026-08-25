import {
  CanonicalCommandError,
  evaluateInstructorParticipantAccess,
  isBookingProposalAcceptanceAllowedBeforeStart,
  isBookingProposalExpired,
  isTerminalBookingProposalStatus,
  resolveBookingProposalExpiresAt,
  type Account,
  type AccountId,
  type BookingProposal,
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
  }>
): void {
  const access = evaluateInstructorParticipantAccess(topology, {
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    bookingScopedEvidence: [],
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
  envelope: CommandEnvelope<'accept_booking_proposal'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    proposal: BookingProposal;
  }>
): AcceptBookingProposalAuthorization {
  const actor = requireAccountActor(envelope);
  assertAccountActive(envelope, input.account);
  assertParticipantActive(envelope, input.participant);
  if (input.participant.participantId !== input.proposal.participantId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantId', reason: 'conflict' },
    });
  }
  if (input.participant.management.kind !== 'managed') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }

  const access = assertAuthorizedParticipantManager(
    envelope,
    {
      account: input.account,
      participant: input.participant,
      management: input.management,
    },
    input.proposal.participantId
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
    participant: Participant;
    management: ParticipantManagement;
    proposal: BookingProposal;
  }>
): void {
  assertParticipantActive(envelope, input.participant);
  if (input.participant.participantId !== input.proposal.participantId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantId', reason: 'conflict' },
    });
  }
  const access = assertAuthorizedParticipantManager(
    envelope,
    {
      account: input.account,
      participant: input.participant,
      management: input.management,
    },
    input.proposal.participantId
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
