import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  createGuestActionTokenNonce,
  guestSubjectIdFromBookingId,
  issueGuestActionToken,
  resolveGuestLessonReservationExpiresAt,
  signGuestActionCredential,
  timestampFromDate,
  GuestSubjectIdSchema,
} from '@ski-academy/shared-domain';
import {
  verifyGuestActionCredentialPartsAuthoritative,
  verifyGuestActionTokenAuthoritative,
} from '../../functions/src/canonical/bookings/guestCredentialVerification';

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
    const verification = verifyGuestActionTokenAuthoritative({
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
    const verification = verifyGuestActionTokenAuthoritative({
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
    const verification = verifyGuestActionTokenAuthoritative({
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
    const verification = verifyGuestActionTokenAuthoritative({
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

describe('guest action credential signature verification', () => {
  const expiresAt = timestampFromDate(new Date('2026-01-01T12:00:00.000Z'));
  const now = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));
  const nonce = createGuestActionTokenNonce();

  function credentialParts(signature: string) {
    return verifyGuestActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedBookingId: bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
      expiresAt,
    });
  }

  function validSignature(): string {
    return signGuestActionCredential(secret, {
      version: 'guest-token:v1',
      bookingId,
      guestSubjectId,
      purpose: 'cancel_pending_reservation',
      expiresAt,
      nonce,
    });
  }

  it('accepts a valid signature', () => {
    expect(credentialParts(validSignature())).toEqual({
      valid: true,
      payload: {
        version: 'guest-token:v1',
        bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt,
        nonce,
      },
    });
  });

  it('rejects a same-length wrong signature', () => {
    const signature = validSignature();
    const wrongSignature = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`;
    expect(credentialParts(wrongSignature)).toEqual({ valid: false, reason: 'invalid_signature' });
  });

  it('rejects a one-byte-short signature', () => {
    expect(credentialParts(validSignature().slice(0, -1))).toEqual({
      valid: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects a one-byte-long signature', () => {
    expect(credentialParts(`${validSignature()}a`)).toEqual({
      valid: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects malformed non-hex signatures', () => {
    const signature = validSignature();
    const malformed = `z${signature.slice(1)}`;
    expect(credentialParts(malformed)).toEqual({ valid: false, reason: 'invalid_signature' });
  });

  it('rejects credentials scoped to another booking', () => {
    const otherBookingId = BookingIdSchema.parse('booking_guest_unit_02');
    const otherSignature = signGuestActionCredential(secret, {
      version: 'guest-token:v1',
      bookingId: otherBookingId,
      guestSubjectId: guestSubjectIdFromBookingId(otherBookingId),
      purpose: 'cancel_pending_reservation',
      expiresAt,
      nonce,
    });
    expect(credentialParts(otherSignature)).toEqual({ valid: false, reason: 'invalid_signature' });
  });

  it('rejects malformed token signatures without throwing', () => {
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
    const separatorIndex = token.lastIndexOf('.');
    const tampered = `${token.slice(0, separatorIndex + 1)}${'g'.repeat(64)}`;
    expect(
      verifyGuestActionTokenAuthoritative({
        secret,
        token: tampered,
        now,
        expectedBookingId: bookingId,
        expectedGuestSubjectId: guestSubjectId,
        expectedPurpose: 'cancel_pending_reservation',
      })
    ).toEqual({ valid: false, reason: 'malformed' });
  });
});
