import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  formatSessionTimeRange,
  getNextSessionsNext7Days,
  parseBookingStartTime,
} from '../../src/features/profile/components/personal_cabinet/student/studentCabinetUtils';
import { Booking } from '../../src/types';

describe('student cabinet time helpers', () => {
  it('parses private lesson start time', () => {
    expect(parseBookingStartTime('09:00')).toEqual({ h: 9, m: 0 });
  });

  it('parses course booking time range start', () => {
    expect(parseBookingStartTime('09:00 - 13:00')).toEqual({ h: 9, m: 0 });
  });

  it('adds duration for private lessons', () => {
    expect(addMinutesToTime('09:00', 2)).toBe('11:00');
  });

  it('formats private lesson as start–end', () => {
    expect(formatSessionTimeRange({ time: '09:00', durationHours: 2 })).toBe('09:00–11:00');
  });

  it('formats course booking range without NaN', () => {
    expect(formatSessionTimeRange({ time: '09:00 - 13:00', durationHours: 10 })).toBe(
      '09:00–13:00'
    );
  });

  it('returns label-only time when duration cannot be computed', () => {
    expect(formatSessionTimeRange({ time: 'Group Schedule', durationHours: 10 })).toBe(
      'Group Schedule'
    );
  });

  it('returns all sessions in the next 7 days in chronological order from first to last', () => {
    const fakeNow = new Date(2026, 7, 3, 8, 0, 0);
    const bookings: Partial<Booking>[] = [
      {
        id: 'b1',
        status: 'confirmed',
        date: '2026-08-05',
        time: '14:00',
        instructorId: 'inst1',
      },
      {
        id: 'b2',
        status: 'confirmed',
        date: '2026-08-03',
        time: '10:00',
        instructorId: 'inst1',
      },
      {
        id: 'b3',
        status: 'confirmed',
        date: '2026-08-08',
        time: '09:00',
        instructorId: 'inst2',
      },
      {
        id: 'b4',
        status: 'confirmed',
        date: '2026-08-15', // Beyond 7 days
        time: '11:00',
        instructorId: 'inst2',
      },
    ];

    const result = getNextSessionsNext7Days(bookings as Booking[], [], fakeNow);
    expect(result.length).toBe(3);
    expect(result[0].dateStr).toBe('2026-08-03');
    expect(result[0].booking.id).toBe('b2');
    expect(result[1].dateStr).toBe('2026-08-05');
    expect(result[1].booking.id).toBe('b1');
    expect(result[2].dateStr).toBe('2026-08-08');
    expect(result[2].booking.id).toBe('b3');
  });
});
