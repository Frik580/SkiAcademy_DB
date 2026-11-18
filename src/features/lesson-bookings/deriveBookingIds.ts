import {
  BookingIdSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain/canonical/identifiers';
import { canonicalDeterministicHash } from '@ski-academy/shared-domain/canonical/deterministicIdentity';
import {
  GUEST_BOOKING_PRIVATE_CREATE_KEY_PREFIX,
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

export function createGuestCreateIdempotencyKey(bookingId: string): IdempotencyKey {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${GUEST_BOOKING_PRIVATE_CREATE_KEY_PREFIX}${nonce}` as IdempotencyKey;
  }
  return `create-guest-request:${bookingId}` as IdempotencyKey;
}

export function deriveCancellationIdempotencyKey(
  bookingId: string,
  expectedRevision: number
): IdempotencyKey {
  return `cancel:${bookingId}:${expectedRevision}` as IdempotencyKey;
}
