import { beforeEach, describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  GuestSubjectIdSchema,
  timestampFromDate,
  type GuestBookingActionCredential,
} from '@ski-academy/shared-domain';
import {
  persistGuestBookingCredential,
  readGuestBookingCredential,
  removeGuestBookingCredential,
} from '../../src/features/lesson-bookings/guestCredentialStorage';

function buildCredential(expiresAt: Date): GuestBookingActionCredential {
  return {
    bookingId: BookingIdSchema.parse('booking_guest_cred_01'),
    guestSubjectId: GuestSubjectIdSchema.parse('guest_fixture_01'),
    nonce: 'nonce_fixture_16chars',
    signature: 'a'.repeat(64),
    expiresAt: timestampFromDate(expiresAt),
  };
}

describe('guestCredentialStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and reads a valid guest credential', () => {
    const credential = buildCredential(new Date('2099-01-01T00:00:00.000Z'));
    persistGuestBookingCredential(credential);
    const stored = readGuestBookingCredential(credential.bookingId);
    expect(stored.credential).toEqual(credential);
  });

  it('reports missing credential without legacy fallback', () => {
    expect(readGuestBookingCredential('booking_missing')).toEqual({ error: 'missing' });
  });

  it('reports expired credential', () => {
    const credential = buildCredential(new Date('2000-01-01T00:00:00.000Z'));
    persistGuestBookingCredential(credential);
    expect(readGuestBookingCredential(credential.bookingId)).toEqual({ error: 'expired' });
  });

  it('reports malformed credential', () => {
    localStorage.setItem('ski_academy_guest_booking_credential:booking_bad', '{not-json');
    expect(readGuestBookingCredential('booking_bad')).toEqual({ error: 'malformed' });
  });

  it('removes stored credential', () => {
    const credential = buildCredential(new Date('2099-01-01T00:00:00.000Z'));
    persistGuestBookingCredential(credential);
    removeGuestBookingCredential(credential.bookingId);
    expect(readGuestBookingCredential(credential.bookingId)).toEqual({ error: 'missing' });
  });
});
