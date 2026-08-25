import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  canonicalTimestampToEpochMs,
  evaluateClientSelfServiceRescheduleTiming,
  isClientSelfServiceRescheduleAllowanceAvailable,
  isRescheduleEligibleBooking,
  type Account,
  type Booking,
  type CommandEnvelope,
  type CorrelationId,
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

export type BookingRescheduleMode = 'client_self_service' | 'administrator';

export function resolveRescheduleScheduleContext(
  envelope: CommandEnvelope<'reschedule_booking'>
): void {
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
}

export function resolveBookingRescheduleAuthorization(
  envelope: CommandEnvelope<'reschedule_booking'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management?: ParticipantManagement;
    booking: Booking;
  }>
): BookingRescheduleMode {
  requireAccountActor(envelope);
  assertAccountActive(envelope, input.account);

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

  if (!input.management) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const access = assertAuthorizedParticipantManager(
    envelope,
    {
      account: input.account,
      participant: input.participant,
      management: input.management,
    },
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

  return 'client_self_service';
}

export function assertRescheduleEligibleBookingState(
  correlationId: CorrelationId,
  booking: Booking
): void {
  if (!isRescheduleEligibleBooking(booking)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
}

export function assertClientSelfServiceReschedulePolicy(
  envelope: CommandEnvelope<'reschedule_booking'>,
  booking: Booking,
  requestAt: Booking['updatedAt']
): void {
  const timing = evaluateClientSelfServiceRescheduleTiming({
    requestAt,
    startAt: booking.occurrence.interval.startsAt,
  });
  if (timing === 'after_start_rejected' || timing === 'inside_window_rejected') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
  if (!isClientSelfServiceRescheduleAllowanceAvailable(booking)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'conflict' },
    });
  }
}

export function assertRescheduleDurationMatches(
  envelope: CommandEnvelope<'reschedule_booking'>,
  booking: Booking,
  targetDurationMinutes: number
): void {
  const currentDurationMinutes = Math.round(
    (canonicalTimestampToEpochMs(booking.occurrence.interval.endsAt) -
      canonicalTimestampToEpochMs(booking.occurrence.interval.startsAt)) /
      60_000
  );
  if (targetDurationMinutes !== currentDurationMinutes) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput.durationMinutes', reason: 'unsupported' },
    });
  }
}

export function assertNoActiveServiceBlockForReschedule(
  correlationId: CorrelationId,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management?: ParticipantManagement;
    participantBlocks: readonly import('@ski-academy/shared-domain').ParticipantBlock[];
  }>,
  instructorId: import('@ski-academy/shared-domain').InstructorId
): void {
  const topology = buildParticipantAccessTopology({
    account: input.account,
    participant: input.participant,
    ...(input.management === undefined ? {} : { management: input.management }),
    additionalBlocks: input.participantBlocks,
  });
  if (evaluateNewServiceBlocked(topology, input.participant.participantId, instructorId)) {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
}

export function assertAdminServiceChangeAuthorization(
  envelope: CommandEnvelope<'change_booking_instructor' | 'change_booking_duration'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
}

export function assertAdminServiceChangeReason(
  envelope: CommandEnvelope<'change_booking_instructor' | 'change_booking_duration'>
): void {
  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}

export function assertParticipantRecordForReschedule(
  envelope: CommandEnvelope<'reschedule_booking'>,
  participant: Participant | undefined
): Participant {
  return assertParticipantActive(envelope, participant);
}
