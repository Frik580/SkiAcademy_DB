import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  formatSessionTimeRange,
  parseBookingStartTime,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';

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
});
