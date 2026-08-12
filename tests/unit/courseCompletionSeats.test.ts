import { describe, expect, it } from 'vitest';
import {
  isActiveCourseEnrollment,
  resolveCourseIdFromBooking,
} from '../../src/lib/courseTransactions';
import type { Booking } from '../../src/types';

const courseBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-course-1',
  userId: 'user-1',
  courseId: 'course-1',
  instructorId: 'course_course-1',
  instructorName: 'Group Course',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 10,
  totalPrice: 200,
  status: 'confirmed',
  difficulty: 'intermediate',
  ...overrides,
});

describe('isActiveCourseEnrollment', () => {
  it('treats pending, confirmed and pending_cancellation as active', () => {
    expect(isActiveCourseEnrollment(courseBooking({ status: 'pending' }))).toBe(true);
    expect(isActiveCourseEnrollment(courseBooking({ status: 'confirmed' }))).toBe(true);
    expect(isActiveCourseEnrollment(courseBooking({ status: 'pending_cancellation' }))).toBe(true);
  });

  it('excludes completed and cancelled course bookings', () => {
    expect(isActiveCourseEnrollment(courseBooking({ status: 'completed' }))).toBe(false);
    expect(isActiveCourseEnrollment(courseBooking({ status: 'cancelled' }))).toBe(false);
  });

  it('ignores individual lessons', () => {
    expect(
      isActiveCourseEnrollment({
        ...courseBooking(),
        instructorId: 'instructor-1',
        status: 'confirmed',
      })
    ).toBe(false);
  });
});

describe('resolveCourseIdFromBooking', () => {
  it('prefers courseId field', () => {
    expect(resolveCourseIdFromBooking(courseBooking({ courseId: 'course-abc' }))).toBe(
      'course-abc'
    );
  });

  it('falls back to instructorId suffix', () => {
    expect(
      resolveCourseIdFromBooking({
        ...courseBooking(),
        courseId: undefined,
        instructorId: 'course_course-xyz',
      })
    ).toBe('course-xyz');
  });
});
