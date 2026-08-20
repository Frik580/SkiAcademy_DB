import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { BookingIdConflictError, BookingSlotOverlapError } from '@ski-academy/shared-domain';
import { InsufficientFundsError } from './bookingLogic';
import { rethrowAsHttpsError } from './mapBookingHttpsError';

describe('rethrowAsHttpsError', () => {
  it('preserves an existing HttpsError', () => {
    const original = new HttpsError('permission-denied', 'Nope.');
    expect(() => rethrowAsHttpsError(original, 'Failed.')).toThrow(original);
  });

  it('maps typed booking errors to stable codes', () => {
    expect(() => rethrowAsHttpsError(new InsufficientFundsError(25, 80), 'Failed.')).toThrow(
      expect.objectContaining({
        code: 'failed-precondition',
        message: 'Insufficient funds.',
        details: {
          code: 'INSUFFICIENT_FUNDS',
          currentBalance: 25,
          required: 80,
        },
      })
    );
    expect(() => rethrowAsHttpsError(new BookingSlotOverlapError(), 'Failed.')).toThrow(
      expect.objectContaining({
        code: 'aborted',
        message: 'Instructor slot is no longer available.',
      })
    );
    expect(() => rethrowAsHttpsError(new BookingIdConflictError(), 'Failed.')).toThrow(
      expect.objectContaining({
        code: 'already-exists',
        message: 'A booking with this ID already exists.',
      })
    );
  });

  it('maps known domain messages without relying on substring matching', () => {
    expect(() => rethrowAsHttpsError(new Error('Instructor does not exist.'), 'Failed.')).toThrow(
      expect.objectContaining({ code: 'not-found', message: 'Instructor does not exist.' })
    );
    expect(() =>
      rethrowAsHttpsError(new Error('User profile does not exist.'), 'Failed.')
    ).toThrow(expect.objectContaining({ code: 'not-found' }));
  });

  it('does not leak unexpected Error.message as internal details', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      rethrowAsHttpsError(new Error('Firestore index bookings_userId_date is missing'), 'Failed.')
    ).toThrow(expect.objectContaining({ code: 'internal', message: 'Failed.' }));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
