import { describe, expect, it } from 'vitest';
import {
  filterBookingsByScope,
  formatCountdownRemaining,
  getCurrentSessions,
  getTodaySessionCountdown,
  isBookingCurrentBySchedule,
  isBookingInProgressNow,
  isBookingPastBySchedule,
  resolveBookingEndDateTime,
  resolveBookingStartDateTime,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { Booking, Course } from '../../src/types';

const lesson = (overrides: Partial<Booking>): Booking => ({
  id: 'b1',
  userId: 'user-1',
  instructorId: 'i1',
  instructorName: 'Coach',
  instructorAvatar: '',
  date: '2026-08-03',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'intermediate',
  ...overrides,
});

describe('booking schedule scope', () => {
  it('marks a private lesson as past after end time on the last day', () => {
    const booking = lesson({ time: '10:00-12:00' });
    const during = new Date(2026, 7, 3, 11, 0, 0);
    const after = new Date(2026, 7, 3, 12, 0, 0);

    expect(isBookingPastBySchedule(booking, [], during)).toBe(false);
    expect(isBookingPastBySchedule(booking, [], after)).toBe(true);
  });

  it('detects in-progress sessions for today section', () => {
    const booking = lesson({ time: '10:00-12:00' });
    const now = new Date(2026, 7, 3, 11, 0, 0);

    expect(isBookingInProgressNow(booking, [], now)).toBe(true);
    expect(getCurrentSessions([booking], [], now)).toHaveLength(1);
  });

  it('uses the last day end hour for multi-day courses', () => {
    const courseDates = 'August 1, 2026 - August 3, 2026, 09:00 - 13:00';
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Course',
        level: 'beginner',
        dates: courseDates,
        duration: '3 days',
        description: '',
        totalSeats: 10,
        availableSeats: 5,
        price: 100,
        bgImageUrl: '',
      },
    ];
    const booking = lesson({
      instructorId: 'course_c1',
      instructorName: 'Course',
      date: courseDates,
      time: '09:00-13:00',
    });

    const midCourse = new Date(2026, 7, 2, 15, 0, 0);
    const afterCourse = new Date(2026, 7, 3, 13, 0, 0);
    const end = resolveBookingEndDateTime(booking, courses);
    const start = resolveBookingStartDateTime(booking, courses);

    expect(start?.getMonth()).toBe(7);
    expect(start?.getDate()).toBe(1);
    expect(end?.getDate()).toBe(3);
    expect(isBookingCurrentBySchedule(booking, courses, midCourse)).toBe(true);
    expect(isBookingPastBySchedule(booking, courses, afterCourse)).toBe(true);
  });

  it('filters current scope between start and end of course', () => {
    const courseDates = 'August 1, 2026 - August 3, 2026, 09:00 - 13:00';
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Course',
        level: 'beginner',
        dates: courseDates,
        duration: '3 days',
        description: '',
        totalSeats: 10,
        availableSeats: 5,
        price: 100,
        bgImageUrl: '',
      },
    ];
    const booking = lesson({
      instructorId: 'course_c1',
      date: courseDates,
      time: '09:00-13:00',
    });
    const now = new Date(2026, 7, 2, 10, 0, 0);

    expect(filterBookingsByScope([booking], 'current', courses, now)).toHaveLength(1);
    expect(filterBookingsByScope([booking], 'upcoming', courses, now)).toHaveLength(0);
    expect(
      filterBookingsByScope([booking], 'past', courses, new Date(2026, 7, 3, 14, 0, 0))
    ).toHaveLength(1);
  });

  it('returns countdown to the nearest session on today', () => {
    const booking = lesson({ time: '14:00-16:00' });
    const now = new Date(2026, 7, 3, 11, 0, 0);
    const countdown = getTodaySessionCountdown([booking], [], now);

    expect(countdown?.booking.id).toBe('b1');
    expect(countdown?.startsAt.getHours()).toBe(14);
    expect(formatCountdownRemaining(countdown!.startsAt.getTime() - now.getTime(), 'ru')).toBe(
      '3ч 00м 00с'
    );
  });

  it('includes courses in today countdown', () => {
    const courseDates = 'August 1, 2026 - August 3, 2026, 09:00 - 13:00';
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Course',
        level: 'beginner',
        dates: courseDates,
        duration: '3 days',
        description: '',
        totalSeats: 10,
        availableSeats: 5,
        price: 100,
        bgImageUrl: '',
      },
    ];
    const booking = lesson({
      instructorId: 'course_c1',
      date: courseDates,
      time: '09:00-13:00',
    });
    const now = new Date(2026, 7, 3, 7, 0, 0);
    const countdown = getTodaySessionCountdown([booking], courses, now);

    expect(countdown?.startsAt.getHours()).toBe(9);
  });
});
