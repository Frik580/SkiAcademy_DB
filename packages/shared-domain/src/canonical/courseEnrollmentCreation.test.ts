import { describe, expect, it } from 'vitest';
import {
  GUEST_COURSE_RESERVATION_TTL_MS,
  resolveGuestCourseReservationExpiresAt,
} from './courseEnrollmentCreation';
import { timestampFromDate } from './primitives';

describe('guest course reservation expiry', () => {
  it('uses a 24-hour maximum hold', () => {
    expect(GUEST_COURSE_RESERVATION_TTL_MS).toBe(24 * 60 * 60 * 1_000);
    expect(
      resolveGuestCourseReservationExpiresAt({
        createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        courseStartsAt: timestampFromDate(new Date('2026-02-01T00:00:00.000Z')),
      })
    ).toEqual(timestampFromDate(new Date('2026-01-02T00:00:00.000Z')));
  });

  it('caps the hold at course start when the course begins sooner', () => {
    expect(
      resolveGuestCourseReservationExpiresAt({
        createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        courseStartsAt: timestampFromDate(new Date('2026-01-01T06:00:00.000Z')),
      })
    ).toEqual(timestampFromDate(new Date('2026-01-01T06:00:00.000Z')));
  });
});
