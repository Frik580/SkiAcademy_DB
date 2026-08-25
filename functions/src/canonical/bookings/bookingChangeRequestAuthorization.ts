import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  assertExpectedRevision,
  isConfirmedIndividualBooking,
  isTerminalBookingChangeRequestStatus,
  readAggregateRevision,
  type Booking,
  type BookingChangeRequest,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertInstructorCapability,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export const BOOKING_REVISION_TRANSPORT_KEY = 'booking_revision';

export function assertCreateBookingChangeRequestAuthorization(
  envelope: CommandEnvelope<'create_booking_change_request'>,
  booking: Booking
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
  assertInstructorCapability(envelope, booking.occurrence.instructorId);

  if (!isConfirmedIndividualBooking(booking)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
}

export function assertWithdrawBookingChangeRequestAuthorization(
  envelope: CommandEnvelope<'withdraw_booking_change_request'>,
  input: Readonly<{
    changeRequest: BookingChangeRequest;
    booking: Booking;
  }>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
  assertInstructorCapability(envelope, input.booking.occurrence.instructorId);

  if (input.changeRequest.lifecycle.status !== 'open') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
}

export function assertResolveBookingChangeRequestAuthorization(
  envelope: CommandEnvelope<'resolve_booking_change_request'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);

  const resolution = envelope.intent.resolution;
  if (resolution === 'rescheduled') {
    if (!envelope.context.calendarInput || !envelope.context.timezone) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'calendarInput', reason: 'required' },
      });
    }
    const explanation = envelope.intent.reasonExplanation?.trim();
    if (!explanation) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'reasonExplanation', reason: 'required' },
      });
    }
    return;
  }

  if (resolution === 'booking_cancelled') {
    const explanation = envelope.intent.reasonExplanation?.trim();
    if (!explanation) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'reasonExplanation', reason: 'required' },
      });
    }
  }
}

export function readBookingExpectedRevisionFromTransport(
  envelope: CommandEnvelope<'resolve_booking_change_request'>
): ReturnType<typeof AggregateRevisionSchema.parse> | undefined {
  const raw = envelope.context.transportMetadata?.[BOOKING_REVISION_TRANSPORT_KEY];
  if (raw === undefined) {
    return undefined;
  }
  return AggregateRevisionSchema.parse(Number(raw));
}

export function assertResolveBookingRevisionTarget(
  envelope: CommandEnvelope<'resolve_booking_change_request'>,
  booking: Booking,
  resolution: CommandEnvelope<'resolve_booking_change_request'>['intent']['resolution']
): void {
  if (resolution === 'no_change') {
    return;
  }

  assertExpectedRevision({
    correlationId: envelope.context.correlationId,
    expectedRevision: readBookingExpectedRevisionFromTransport(envelope),
    currentRevision: booking.revision,
    requireExpectedRevision: true,
  });
}

export function assertOpenChangeRequestForMutation(
  envelope: CommandEnvelope<'withdraw_booking_change_request' | 'resolve_booking_change_request'>,
  changeRequest: BookingChangeRequest | undefined
): BookingChangeRequest {
  if (!changeRequest || isTerminalBookingChangeRequestStatus(changeRequest.lifecycle.status)) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
  return changeRequest;
}

export function readBookingRevisionFromAggregateData(
  data: Record<string, unknown> | undefined
): ReturnType<typeof AggregateRevisionSchema.parse> | undefined {
  return readAggregateRevision(data);
}
