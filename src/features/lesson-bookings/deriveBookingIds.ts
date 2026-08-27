import {
  BookingIdSchema,
  ParticipantIdSchema,
  canonicalDeterministicHash,
  type BookingId,
  type IdempotencyKey,
  type ParticipantId,
} from '@ski-academy/shared-domain';

export function createLogicalBookingAttemptId(): BookingId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return BookingIdSchema.parse(`booking_${crypto.randomUUID().replace(/-/g, '')}`);
  }
  return BookingIdSchema.parse(`booking_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
}

export function deriveGuestParticipantIdForBooking(bookingId: string): ParticipantId {
  return ParticipantIdSchema.parse(
    canonicalDeterministicHash(['participant:v1', 'guest_booking', bookingId])
  );
}

export function deriveAuthenticatedCreateIdempotencyKey(bookingId: string): IdempotencyKey {
  return `create-confirmed:${bookingId}` as IdempotencyKey;
}

export function deriveGuestCreateIdempotencyKey(bookingId: string): IdempotencyKey {
  return `create-guest-request:${bookingId}` as IdempotencyKey;
}

export function deriveCancellationIdempotencyKey(
  bookingId: string,
  expectedRevision: number
): IdempotencyKey {
  return `cancel:${bookingId}:${expectedRevision}` as IdempotencyKey;
}
