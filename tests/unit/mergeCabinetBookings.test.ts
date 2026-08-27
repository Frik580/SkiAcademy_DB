import { describe, expect, it } from 'vitest';
import {
  isCourseLegacyBooking,
  mergeCabinetLessonAndCourseBookings,
} from '../../src/features/lesson-bookings/mergeCabinetBookings';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { Booking } from '../../src/types';

describe('mergeCabinetBookings', () => {
  const lessonItem: LessonBookingCabinetItem = {
    id: 'booking_lesson_01',
    bookingId: 'booking_lesson_01',
    revision: 3,
    status: 'confirmed',
    date: '2026-06-20',
    time: '09:00',
    durationHours: 2,
    instructorId: 'instructor_fixture_01',
    instructorName: 'Coach',
    instructorAvatar: '',
    participantNames: ['Alice'],
    partyKind: 'individual',
    payment: { kind: 'visible', paymentStatus: 'settled' },
    bookingOrigin: 'account',
    isLessonBooking: true,
  };

  const courseBooking: Booking = {
    id: 'course_enrollment_01',
    userId: 'user_01',
    instructorId: 'course_summer_01',
    instructorName: 'Summer Camp',
    instructorAvatar: '',
    date: '2026-07-01',
    time: '10:00',
    durationHours: 4,
    totalPrice: 500,
    status: 'confirmed',
    difficulty: 'beginner',
  };

  it('identifies course-shaped legacy bookings for T31 deferral', () => {
    expect(isCourseLegacyBooking(courseBooking)).toBe(true);
    expect(isCourseLegacyBooking({ ...courseBooking, instructorId: 'instructor_01' })).toBe(false);
  });

  it('merges canonical lesson rows with course legacy rows without duplicating lesson ids', () => {
    const merged = mergeCabinetLessonAndCourseBookings([lessonItem], [courseBooking]);
    expect(merged.map((item) => item.bookingId)).toEqual([
      'course_enrollment_01',
      'booking_lesson_01',
    ]);
    expect(merged.find((item) => item.bookingId === 'booking_lesson_01')?.isLessonBooking).toBe(
      true
    );
    expect(merged.find((item) => item.bookingId === 'course_enrollment_01')?.isLessonBooking).toBe(
      false
    );
  });
});
