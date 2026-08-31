import {
  CanonicalCommandError,
  evaluateInstructorAttendanceWindow,
  assertExpectedRevision,
  instructorMayCorrectAttendance,
  resolveBookingAttendanceTargets,
  type Attendance,
  type Booking,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertInstructorCapability,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export type BookingAttendanceActorMode =
  'instructor' | 'administrator' | 'admin_terminal_correction';

export function resolveBookingAttendanceActorMode(
  envelope: CommandEnvelope<'record_booking_attendance'>
): BookingAttendanceActorMode {
  if (envelope.context.exercisedCapability === 'administrator') {
    assertAdministrator(envelope);
    requireAccountActor(envelope);
    return 'administrator';
  }
  if (envelope.context.exercisedCapability === 'instructor') {
    requireAccountActor(envelope);
    return 'instructor';
  }
  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}

export function assertRecordBookingAttendanceAuthorization(
  envelope: CommandEnvelope<'record_booking_attendance'>,
  input: Readonly<{
    booking: Booking;
    existingAttendance: Attendance | undefined;
    now: import('@ski-academy/shared-domain').CanonicalTimestamp;
  }>
): BookingAttendanceActorMode {
  const mode = resolveBookingAttendanceActorMode(envelope);
  const { booking } = input;

  const terminalCorrection =
    booking.party.kind === 'individual' &&
    input.existingAttendance !== undefined &&
    ((booking.lifecycle.status === 'completed' && envelope.intent.attendanceStatus === 'absent') ||
      (booking.lifecycle.status === 'no_show' && envelope.intent.attendanceStatus === 'present'));

  if (
    booking.lifecycle.status !== 'confirmed' &&
    booking.lifecycle.status !== 'pending_cancellation' &&
    !terminalCorrection
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }

  const target = resolveBookingAttendanceTargets(booking, envelope.intent.participantId);
  if (target.outcome === 'service_party_not_frozen') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'serviceParty.frozenAt', reason: 'required' },
    });
  }
  if (target.outcome === 'participant_not_in_target') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantId', reason: 'unsupported' },
    });
  }

  if (mode === 'instructor') {
    if (terminalCorrection) {
      throw new CanonicalCommandError('invalid_transition', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'booking', reason: 'unsupported' },
      });
    }
    assertInstructorCapability(envelope, booking.occurrence.instructorId);
    const window = evaluateInstructorAttendanceWindow({
      now: input.now,
      startsAt: booking.occurrence.interval.startsAt,
      endsAt: booking.occurrence.interval.endsAt,
    });
    if (window === 'before_start' || window === 'after_instructor_window') {
      throw new CanonicalCommandError('invalid_transition', {
        correlationId: envelope.context.correlationId,
        details: { field: 'startsAt', reason: 'out_of_range' },
      });
    }
    if (
      input.existingAttendance &&
      !instructorMayCorrectAttendance({
        existing: input.existingAttendance,
        instructorId: booking.occurrence.instructorId,
      })
    ) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return mode;
  }

  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
  if (
    evaluateInstructorAttendanceWindow({
      now: input.now,
      startsAt: booking.occurrence.interval.startsAt,
      endsAt: booking.occurrence.interval.endsAt,
    }) === 'before_start'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }
  assertExpectedRevision({
    correlationId: envelope.context.correlationId,
    expectedRevision: envelope.context.expectedRevision,
    currentRevision: booking.revision,
    requireExpectedRevision: true,
  });
  return terminalCorrection ? 'admin_terminal_correction' : mode;
}

export function assertResolveAttendanceOutcomeAuthorization(
  envelope: CommandEnvelope<'resolve_attendance_outcome'>
): 'system' | 'administrator' {
  if (envelope.context.actor.kind === 'system') {
    if (envelope.context.exercisedCapability !== 'system') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return 'system';
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);
  return 'administrator';
}
