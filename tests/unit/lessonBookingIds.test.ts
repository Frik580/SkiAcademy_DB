import { describe, expect, it } from 'vitest';
import {
  deriveAuthenticatedCreateIdempotencyKey,
  deriveCancellationIdempotencyKey,
  createGuestCreateIdempotencyKey,
  deriveGuestParticipantIdForBooking,
} from '../../src/features/lesson-bookings/deriveBookingIds';

describe('deriveBookingIds', () => {
  const bookingId = 'booking_stable_01';

  it('derives stable idempotency keys from booking identity', () => {
    expect(deriveAuthenticatedCreateIdempotencyKey(bookingId)).toBe(
      'create-confirmed:booking_stable_01'
    );
    expect(deriveCancellationIdempotencyKey(bookingId, 3)).toBe('cancel:booking_stable_01:3');
  });

  it('generates independent private guest creation keys for separate attempts', () => {
    const first = createGuestCreateIdempotencyKey(bookingId);
    const second = createGuestCreateIdempotencyKey(bookingId);
    expect(first).toMatch(/^create-guest-private:[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });

  it('keeps the same idempotency key for accidental retries of the same logical submission', () => {
    const first = deriveAuthenticatedCreateIdempotencyKey(bookingId);
    const second = deriveAuthenticatedCreateIdempotencyKey(bookingId);
    expect(first).toBe(second);
  });

  it('assigns a new idempotency key when revision changes for cancellation', () => {
    const atRevision2 = deriveCancellationIdempotencyKey(bookingId, 2);
    const atRevision3 = deriveCancellationIdempotencyKey(bookingId, 3);
    expect(atRevision2).not.toBe(atRevision3);
  });

  it('derives deterministic guest participant id from booking id', () => {
    const participantId = deriveGuestParticipantIdForBooking(bookingId);
    expect(participantId.length).toBeGreaterThan(10);
    expect(deriveGuestParticipantIdForBooking(bookingId)).toBe(participantId);
  });
});
