import { describe, expect, it } from 'vitest';
import {
  canonicalTimestampToLocalParts,
  mapLessonBookingCalendarInput,
} from '../../src/features/lesson-bookings/mapCalendarInput';

describe('mapCalendarInput', () => {
  it('maps local date/time and duration hours to command calendar input', () => {
    expect(
      mapLessonBookingCalendarInput({
        localDate: '2026-06-15',
        localTime: '08:30',
        durationHours: 2,
      })
    ).toEqual({
      localDate: '2026-06-15',
      localTime: '08:30',
      durationMinutes: 120,
    });
  });

  it('converts canonical timestamps to local parts in the booking timezone', () => {
    const startsAt = Math.floor(new Date('2026-06-15T04:00:00.000Z').getTime() / 1000);
    const parts = canonicalTimestampToLocalParts(startsAt, 0, 'Asia/Almaty');
    expect(parts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parts.time).toMatch(/^\d{2}:\d{2}$/);
  });
});
