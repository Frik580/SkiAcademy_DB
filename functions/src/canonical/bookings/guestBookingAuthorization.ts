import {
  CanonicalCommandError,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  administratorCapabilityExercisedByAccount,
  guestSubjectIdFromBookingId,
  parseGuestParticipantProfileFromTransportMetadata,
  type Booking,
  type BookingCancellationReasonCode,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type GuestParticipantProfileFromTransport,
  type GuestSubjectId,
  type Participant,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { verifyGuestActionCredentialPartsAuthoritative } from './guestCredentialVerification';

export function requireGuestActor(
  envelope: CommandEnvelope
): { readonly guestSubjectId: GuestSubjectId } {
  const actor = envelope.context.actor;
  if (actor.kind !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  return actor;
}

export function assertGuestBookingRequestContext(
  envelope: CommandEnvelope<'create_guest_booking_request'>
): void {
  if (envelope.context.source !== 'guest_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (envelope.context.exercisedCapability !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
  if (envelope.intent.participantIds.length !== 1) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'unsupported' },
    });
  }
}

export function assertGuestActorMatchesBooking(
  envelope: CommandEnvelope,
  bookingId: Booking['bookingId'],
  guestSubjectId: GuestSubjectId
): void {
  const expected = guestSubjectIdFromBookingId(bookingId);
  if (guestSubjectId !== expected) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertGuestPendingBooking(booking: Booking): void {
  if (booking.attribution.bookingOrigin !== 'guest') {
    throw new CanonicalCommandError('validation', {
      correlationId: booking.audit.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
  if (booking.lifecycle.status !== 'pending') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: booking.audit.correlationId,
      details: { resourceKind: 'booking', reason: 'conflict' },
    });
  }
}

export function assertConfirmGuestBookingAuthorization(
  envelope: CommandEnvelope<'confirm_guest_booking'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
}

export function assertExpireGuestReservationAuthorization(
  envelope: CommandEnvelope<'expire_guest_reservation'>
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

export function assertLinkGuestBookingAuthorization(
  envelope: CommandEnvelope<'link_guest_booking_to_account'>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (envelope.context.exercisedCapability !== 'account_owner') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
}

export function resolvePendingGuestCancellationAuthorization(
  envelope: CommandEnvelope<'request_booking_cancellation'>,
  booking: Booking,
  guestActionSecret: string | undefined,
  now: CanonicalTimestamp
): BookingCancellationReasonCode {
  if (booking.attribution.bookingOrigin !== 'guest' || booking.lifecycle.status !== 'pending') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }

  if (administratorCapabilityExercisedByAccount(envelope.context)) {
    if (envelope.context.source !== 'admin_callable') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    assertAdministrator(envelope);
    return 'administrator_cancelled';
  }

  if (envelope.context.source !== 'guest_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const guestActor = requireGuestActor(envelope);
  assertGuestActorMatchesBooking(envelope, booking.bookingId, guestActor.guestSubjectId);
  if (booking.attribution.bookedBy.kind !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (booking.attribution.bookedBy.guestSubjectId !== guestActor.guestSubjectId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const nonce = envelope.context.transportMetadata?.[GUEST_ACTION_NONCE_TRANSPORT_KEY];
  const signature = envelope.context.transportMetadata?.[GUEST_ACTION_SIGNATURE_TRANSPORT_KEY];
  if (!nonce || !signature || !guestActionSecret) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (booking.lifecycle.status !== 'pending') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
    });
  }

  const verification = verifyGuestActionCredentialPartsAuthoritative({
    secret: guestActionSecret,
    nonce,
    signature,
    now,
    expectedBookingId: booking.bookingId,
    expectedGuestSubjectId: guestActor.guestSubjectId,
    expectedPurpose: 'cancel_pending_reservation',
    expiresAt: booking.lifecycle.reservationExpiresAt,
  });
  if (!verification.valid) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }

  return 'guest_cancelled';
}

export function resolveGuestParticipantProfileForBooking(
  envelope: CommandEnvelope<'create_guest_booking_request'>
): GuestParticipantProfileFromTransport {
  const parsed = parseGuestParticipantProfileFromTransportMetadata(
    envelope.context.transportMetadata
  );
  if (!parsed.success) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'transportMetadata', reason: 'required' },
    });
  }
  return parsed.data;
}

export function assertGuestParticipantForBooking(
  envelope: CommandEnvelope,
  participant: Participant | undefined,
  participantId: Participant['participantId']
): Participant {
  const record = assertParticipantActive(envelope, participant);
  if (record.management.kind !== 'unmanaged_guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
  if (record.participantId !== participantId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantId', reason: 'conflict' },
    });
  }
  return record;
}

export function parseGuestParticipantFromStore(
  data: Record<string, unknown> | undefined
): Participant | undefined {
  return parseParticipant(data);
}
