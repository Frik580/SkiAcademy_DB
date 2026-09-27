import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetGuestReservation,
  isUnusableGuestReservationError,
  rememberedGuestReservation,
  rememberGuestReservation,
  wasGuestReservationForgotten,
} from '../../src/features/guest-reservations/guestReservationLookup';

describe('saved guest reservation reference', () => {
  beforeEach(() => localStorage.clear());

  it('forgets only the active pointer and permits a new subject', () => {
    rememberGuestReservation('lesson', 'instructor_01', 'booking_old');
    expect(rememberedGuestReservation('lesson', 'instructor_01')).toBe('booking_old');
    forgetGuestReservation('lesson', 'instructor_01');
    expect(rememberedGuestReservation('lesson', 'instructor_01')).toBeNull();
    expect(wasGuestReservationForgotten('lesson', 'instructor_01', 'booking_old')).toBe(true);
    rememberGuestReservation('lesson', 'instructor_01', 'booking_new');
    expect(rememberedGuestReservation('lesson', 'instructor_01')).toBe('booking_new');
  });

  it('distinguishes unusable credentials from retryable network errors', () => {
    for (const error of [
      new Error('expired'),
      new Error('malformed'),
      new Error('Guest booking read model was not found.'),
      { code: 'functions/permission-denied' },
      { code: 'functions/not-found' },
      { name: 'ZodError' },
    ]) {
      expect(isUnusableGuestReservationError(error)).toBe(true);
    }
    expect(isUnusableGuestReservationError(new Error('network unavailable'))).toBe(false);
  });

  it('suppresses a stale course fallback without a saved pointer', () => {
    forgetGuestReservation('course', 'course_02', 'enrollment_unavailable');
    expect(wasGuestReservationForgotten('course', 'course_02', 'enrollment_unavailable')).toBe(true);
    expect(rememberedGuestReservation('course', 'course_02')).toBeNull();
  });
});
