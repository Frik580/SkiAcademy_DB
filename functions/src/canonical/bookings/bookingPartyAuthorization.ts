import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  evaluateClientPartyChangeTiming,
  isPartyChangeEligibleBooking,
  validatePartyParticipantIds,
  type Account,
  type Booking,
  type CommandEnvelope,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import {
  assertAccountActive,
  assertAdministrator,
  assertAuthorizedParticipantManager,
  assertParticipantActive,
  buildParticipantAccessTopology,
  evaluateNewServiceBlocked,
} from '../participantAccess/participantAccessAuthorization';

export type BookingPartyChangeMode = 'client_self_service' | 'administrator' | 'system';

export function resolveBookingPartyChangeAuthorization(
  envelope: CommandEnvelope<'change_booking_party'>,
  input: Readonly<{
    account?: Account;
    booking: Booking;
  }>
): BookingPartyChangeMode {
  if (envelope.context.actor.kind === 'system') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  if (administratorCapabilityExercisedByAccount(envelope.context)) {
    if (envelope.context.source !== 'admin_callable') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    assertAdministrator(envelope);
    const explanation = envelope.intent.reasonExplanation?.trim();
    if (!explanation) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'reasonExplanation', reason: 'required' },
      });
    }
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

  if (!input.account) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  assertAccountActive(envelope, input.account);
  return 'client_self_service';
}

export function assertPartyChangeEligibleBooking(
  envelope: CommandEnvelope<'change_booking_party' | 'rollback_unpaid_booking_party_additions'>,
  booking: Booking
): void {
  if (!isPartyChangeEligibleBooking(booking)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
}

export function assertPartyChangeTiming(
  envelope: CommandEnvelope<'change_booking_party'>,
  booking: Booking,
  mode: BookingPartyChangeMode,
  now: ReturnType<typeof import('@ski-academy/shared-domain').timestampFromDate>
): void {
  if (mode === 'administrator') {
    return;
  }
  const timing = evaluateClientPartyChangeTiming({
    requestAt: now,
    startAt: booking.occurrence.interval.startsAt,
  });
  if (timing === 'after_start_rejected') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }
  if (timing === 'inside_window_rejected') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }
}

export function assertAuthorizedForPartyParticipants(
  envelope: CommandEnvelope<'change_booking_party'>,
  input: Readonly<{
    account: Account;
    participants: readonly Participant[];
    managements: readonly ParticipantManagement[];
    participantIds: readonly Participant['participantId'][];
  }>
): void {
  for (const participantId of input.participantIds) {
    const participant = input.participants.find((entry) => entry.participantId === participantId);
    const management = input.managements.find((entry) => entry.participantId === participantId);
    if (!participant || !management) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    assertParticipantActive(envelope, participant);
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
}

export function assertNoActiveServiceBlockForPartyParticipant(
  envelope: CommandEnvelope<'change_booking_party'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantBlocks: readonly ParticipantBlock[];
    instructorId: Booking['occurrence']['instructorId'];
  }>
): void {
  const topology = buildParticipantAccessTopology({
    account: input.account,
    participant: input.participant,
    management: input.management,
    additionalBlocks: input.participantBlocks,
  });
  if (evaluateNewServiceBlocked(topology, input.participant.participantId, input.instructorId)) {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
}

export function assertClientSelfServicePartyBookingAccess(
  envelope: CommandEnvelope<'change_booking_party'>,
  input: Readonly<{
    account: Account;
    anchorParticipant: Participant;
    anchorManagement: ParticipantManagement;
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
    {
      account: input.account,
      participant: input.anchorParticipant,
      management: input.anchorManagement,
    },
    input.anchorParticipant.participantId
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

export function assertValidatedNextParty(
  envelope: CommandEnvelope<'change_booking_party'>,
  nextParticipantIds: readonly Participant['participantId'][]
): void {
  try {
    validatePartyParticipantIds(nextParticipantIds);
  } catch {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'unsupported' },
    });
  }
}

export function resolveRollbackAuthorization(
  envelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'>
): 'system' | 'administrator' {
  if (
    envelope.context.actor.kind === 'system' &&
    envelope.context.exercisedCapability === 'system' &&
    envelope.context.source === 'scheduler'
  ) {
    return 'system';
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
  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}
