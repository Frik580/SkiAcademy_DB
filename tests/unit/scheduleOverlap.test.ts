import { describe, expect, it } from 'vitest';
import {
  getAvailableMoveTimeSlots,
  getAvailableScheduleDurations,
  hasScheduleOverlap,
  SCHEDULE_CLOSING_TIME_MINUTES,
  SCHEDULE_TIME_SLOTS,
} from '../../src/features/admin';
import type { Booking, Course } from '../../src/types';

const INSTRUCTOR_ID = 'instructor-1';
const DATE = '2026-12-15';

const baseBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  userId: 'user-1',
  instructorId: INSTRUCTOR_ID,
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: DATE,
  time: '09:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

const baseCourse = (overrides: Partial<Course> = {}): Course => ({
  id: 'course-1',
  title: 'Group Course',
  duration: '4 hours',
  description: '',
  dates: 'December 15, 2026 - December 20, 2026, 09:00 - 13:00',
  totalSeats: 10,
  availableSeats: 5,
  price: 200,
  bgImageUrl: '',
  instructorIds: [INSTRUCTOR_ID],
  ...overrides,
});

const overlapCheck = (overrides: Partial<Parameters<typeof hasScheduleOverlap>[0]> = {}) =>
  hasScheduleOverlap({
    bookings: [],
    courses: [],
    instructorId: INSTRUCTOR_ID,
    date: DATE,
    time: '10:00',
    durationHours: 2,
    ...overrides,
  });

describe('hasScheduleOverlap', () => {
  it('detects partial overlap with an existing booking', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ time: '09:00', durationHours: 2 })],
        time: '10:00',
        durationHours: 2,
      })
    ).toBe(true);
  });

  it('allows adjacent slots that touch at the boundary', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ time: '09:00', durationHours: 1 })],
        time: '10:00',
        durationHours: 1,
      })
    ).toBe(false);
  });

  it('ignores bookings for other instructors', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ instructorId: 'other-instructor' })],
      })
    ).toBe(false);
  });

  it('ignores bookings on other dates', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ date: '2026-12-16' })],
      })
    ).toBe(false);
  });

  it('ignores cancelled bookings', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ status: 'cancelled' })],
      })
    ).toBe(false);
  });

  it('can exclude the booking being moved', () => {
    expect(
      overlapCheck({
        bookings: [baseBooking({ id: 'booking-1', time: '10:00', durationHours: 2 })],
        time: '10:00',
        durationHours: 2,
        excludeBookingId: 'booking-1',
      })
    ).toBe(false);
  });

  it('detects overlap with a group course on the same day', () => {
    expect(
      overlapCheck({
        courses: [baseCourse()],
        time: '10:00',
        durationHours: 2,
      })
    ).toBe(true);
  });

  it('ignores courses outside the requested date range', () => {
    expect(
      overlapCheck({
        courses: [baseCourse()],
        date: '2026-12-25',
        time: '10:00',
        durationHours: 2,
      })
    ).toBe(false);
  });

  it('ignores courses that do not include the instructor', () => {
    expect(
      overlapCheck({
        courses: [baseCourse({ instructorIds: ['other-instructor'] })],
        time: '10:00',
        durationHours: 2,
      })
    ).toBe(false);
  });
});

describe('getAvailableMoveTimeSlots', () => {
  it('returns only slots without overlap and before closing time', () => {
    const available = getAvailableMoveTimeSlots({
      bookings: [baseBooking({ time: '09:00', durationHours: 2 })],
      courses: [],
      instructorId: INSTRUCTOR_ID,
      date: DATE,
      durationHours: 2,
    });

    expect(available).not.toContain('08:00');
    expect(available).not.toContain('09:00');
    expect(available).not.toContain('10:00');
    expect(available).toContain('11:00');
    expect(available).toContain('17:00');
    expect(available).not.toContain('18:00');
  });

  it('includes the current slot when excluding the booking being moved', () => {
    const available = getAvailableMoveTimeSlots({
      bookings: [baseBooking({ id: 'booking-1', time: '10:00', durationHours: 2 })],
      courses: [],
      instructorId: INSTRUCTOR_ID,
      date: DATE,
      durationHours: 2,
      excludeBookingId: 'booking-1',
    });

    expect(available).toContain('10:00');
  });
});

describe('getAvailableScheduleDurations', () => {
  it('limits durations by closing time and nearby bookings', () => {
    const durations = getAvailableScheduleDurations({
      bookings: [baseBooking({ time: '12:00', durationHours: 1 })],
      courses: [],
      instructorId: INSTRUCTOR_ID,
      date: DATE,
      time: '10:00',
    });

    expect(durations).toEqual([1, 2]);
    expect(durations).not.toContain(3);
    expect(durations).not.toContain(4);
  });

  it('allows the longest duration when the schedule is free until closing', () => {
    const durations = getAvailableScheduleDurations({
      bookings: [],
      courses: [],
      instructorId: INSTRUCTOR_ID,
      date: DATE,
      time: '08:00',
    });

    expect(durations).toEqual([1, 2, 3, 4]);
  });

  it('ignores the occupied lesson when offering a longer duration for that same booking', () => {
    const durations = getAvailableScheduleDurations({
      bookings: [baseBooking({ id: 'booking-1', time: '10:00', durationHours: 1 })],
      courses: [],
      instructorId: INSTRUCTOR_ID,
      date: DATE,
      time: '10:00',
      excludeBookingId: 'booking-1',
    });

    expect(durations).toContain(1);
    expect(durations).toContain(2);
  });
});

describe('schedule constants', () => {
  it('defines hourly slots through 18:00 and closes at 19:00', () => {
    expect(SCHEDULE_TIME_SLOTS.at(-1)).toBe('18:00');
    expect(SCHEDULE_CLOSING_TIME_MINUTES).toBe(19 * 60);
  });
});
