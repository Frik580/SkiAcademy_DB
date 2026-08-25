import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  createGuestActionTokenNonce,
  guestSubjectIdFromBookingId,
  issueGuestActionToken,
  resolveGuestLessonReservationExpiresAt,
  timestampFromDate,
  verifyGuestActionToken,
  GuestSubjectIdSchema,
} from '@ski-academy/shared-domain';

const bookingId = BookingIdSchema.parse('booking_guest_unit_01');
const guestSubjectId = guestSubjectIdFromBookingId(bookingId);
const secret = 'guest-test-secret-value-01';

describe('guest booking reservation TTL', () => {
  it('expires at createdAt + 1h when service is more than 1h away', () => {
    const createdAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));
    const serviceStartsAt = timestampFromDate(new Date('2026-01-01T15:00:00.000Z'));
    const expiresAt = resolveGuestLessonReservationExpiresAt({ createdAt, serviceStartsAt });
    expect(expiresAt).toEqual(timestampFromDate(new Date('2026-01-01T11:00:00.000Z')));
  });

  it('expires at service start when service is less than 1h away', () => {
    const createdAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));
    const serviceStartsAt = timestampFromDate(new Date('2026-01-01T10:30:00.000Z'));
    const expiresAt = resolveGuestLessonReservationExpiresAt({ createdAt, serviceStartsAt });
    expect(expiresAt).toEqual(serviceStartsAt);
  });

  it('never expires after service start', () => {
    const createdAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));
    const serviceStartsAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));
    const expiresAt = resolveGuestLessonReservationExpiresAt({ createdAt, serviceStartsAt });
    expect(expiresAt).toEqual(serviceStartsAt);
  });
});

describe('guest action token', () => {
  const expiresAt = timestampFromDate(new Date('2026-01-01T12:00:00.000Z'));
  const now = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));

  it('issues and verifies a scoped token', () => {
    const token = issueGuestActionToken({
      secret,
      payload: {
        version: 'guest-token:v1',
        bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt,
        nonce: createGuestActionTokenNonce(),
      },
    });
    const verification = verifyGuestActionToken({
      secret,
      token,
      now,
      expectedBookingId: bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
    });
    expect(verification.valid).toBe(true);
  });

  it('rejects tampered tokens', () => {
    const token = issueGuestActionToken({
      secret,
      payload: {
        version: 'guest-token:v1',
        bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt,
        nonce: createGuestActionTokenNonce(),
      },
    });
    const verification = verifyGuestActionToken({
      secret,
      token: `${token}x`,
      now,
      expectedBookingId: bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
    });
    expect(verification.valid).toBe(false);
  });

  it('rejects wrong booking scope', () => {
    const otherBookingId = BookingIdSchema.parse('booking_guest_unit_02');
    const token = issueGuestActionToken({
      secret,
      payload: {
        version: 'guest-token:v1',
        bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt,
        nonce: createGuestActionTokenNonce(),
      },
    });
    const verification = verifyGuestActionToken({
      secret,
      token,
      now,
      expectedBookingId: otherBookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
    });
    expect(verification).toEqual({ valid: false, reason: 'booking_mismatch' });
  });

  it('rejects expired tokens', () => {
    const token = issueGuestActionToken({
      secret,
      payload: {
        version: 'guest-token:v1',
        bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt,
        nonce: createGuestActionTokenNonce(),
      },
    });
    const verification = verifyGuestActionToken({
      secret,
      token,
      now: timestampFromDate(new Date('2026-01-01T12:00:00.000Z')),
      expectedBookingId: bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
    });
    expect(verification).toEqual({ valid: false, reason: 'expired' });
  });

  it('derives guest subject identity from booking id', () => {
    expect(GuestSubjectIdSchema.safeParse(guestSubjectId).success).toBe(true);
    expect(guestSubjectIdFromBookingId(bookingId)).toBe(guestSubjectId);
  });
});
