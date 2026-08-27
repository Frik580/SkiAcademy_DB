import { describe, expect, it } from 'vitest';
import {
  isLessonBookingHot,
  mergeRevisionAwareReadModel,
} from './lessonBookingReadModel';
import { timestampFromDate } from '../primitives';

describe('lessonBookingReadModel contracts', () => {
  it('merges revision-aware state without replacing newer cached revisions', () => {
    const cached = { revision: 5, bookingId: 'booking_merge_01' };
    const stale = { revision: 3, bookingId: 'booking_merge_01' };
    const newer = { revision: 7, bookingId: 'booking_merge_01' };
    expect(mergeRevisionAwareReadModel(cached, stale)).toEqual(cached);
    expect(mergeRevisionAwareReadModel(cached, newer)).toEqual(newer);
  });

  it('classifies hot bookings using lifecycle and interval end', () => {
    const now = timestampFromDate(new Date('2026-06-01T12:00:00.000Z'));
    const futureEnd = timestampFromDate(new Date('2026-06-01T14:00:00.000Z'));
    const pastEnd = timestampFromDate(new Date('2026-06-01T10:00:00.000Z'));
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: futureEnd,
        now,
      })
    ).toBe(true);
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'cancelled',
        endsAt: futureEnd,
        now,
      })
    ).toBe(false);
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: pastEnd,
        now,
      })
    ).toBe(false);
  });
});
