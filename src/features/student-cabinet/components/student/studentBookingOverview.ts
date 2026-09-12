import type { Booking, Course, Instructor, Review } from '../../../../types';
import type { SkillItem } from '../../../../domain/achievements';
import { isReviewEligibleLessonStatus } from '../../../../domain/booking';
import { getCourseTrackLabel as getTrackLabelForLevel } from '../../../../domain/course';
import {
  isBookingCurrentBySchedule,
  isBookingOnDate,
  isBookingPastBySchedule,
  isBookingUpcomingBySchedule,
  type ScheduleBookingSlice,
} from './studentBookingSchedule';
import { toYMD } from './studentCabinetPresentation';
import { isBookingReviewed } from './studentHistory';

export type BookingListScope = 'upcoming' | 'current' | 'past' | 'all';

export const filterBookingsByScope = <T extends ScheduleBookingSlice>(
  bookings: T[],
  scope: BookingListScope,
  courses: Course[] = [],
  now = new Date()
): T[] => {
  if (scope === 'all') return bookings;
  if (scope === 'upcoming') {
    return bookings.filter((b) => isBookingUpcomingBySchedule(b, courses, now));
  }
  if (scope === 'current') {
    return bookings.filter((b) => isBookingCurrentBySchedule(b, courses, now));
  }
  return bookings.filter((b) => isBookingPastBySchedule(b, courses, now));
};

export const getNeedsAttentionBookings = (
  bookings: Booking[],
  reviews: Review[],
  dismissedReviewIds: string[],
  userId: string,
  limit = 5
): Booking[] =>
  bookings
    .filter(
      (booking) =>
        booking.userId === userId &&
        isReviewEligibleLessonStatus(booking.status) &&
        !booking.isDeleted
    )
    .filter((booking) => !isBookingReviewed(booking, reviews, dismissedReviewIds))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

export const getMyInstructors = (
  bookings: Booking[],
  instructors: Instructor[],
  userId?: string,
  courses?: Course[]
): Instructor[] => {
  const lastDateByInstructor = new Map<string, string>();

  const bumpDate = (instructorId: string, date: string) => {
    const prev = lastDateByInstructor.get(instructorId);
    if (!prev || date > prev) lastDateByInstructor.set(instructorId, date);
  };

  bookings
    .filter(
      (b) =>
        (!userId || b.userId === userId) &&
        !b.isDeleted &&
        b.status !== 'cancelled' &&
        !b.instructorId.startsWith('course_')
    )
    .forEach((b) => bumpDate(b.instructorId, b.date));

  if (courses) {
    bookings
      .filter(
        (b) =>
          (!userId || b.userId === userId) &&
          !b.isDeleted &&
          b.status !== 'cancelled' &&
          b.instructorId.startsWith('course_')
      )
      .forEach((b) => {
        const courseId = b.instructorId.replace('course_', '');
        const course = courses.find((c) => c.id === courseId);
        course?.instructorIds?.forEach((instructorId) => bumpDate(instructorId, b.date));
      });
  }

  return instructors
    .filter((i) => lastDateByInstructor.has(i.id))
    .sort((a, b) =>
      (lastDateByInstructor.get(b.id) ?? '').localeCompare(lastDateByInstructor.get(a.id) ?? '')
    );
};

export const getEnrolledCourses = (bookings: Booking[], courses: Course[], userId?: string) => {
  const enrolledIds = new Set(
    bookings
      .filter(
        (b) =>
          (!userId || b.userId === userId) &&
          !b.isDeleted &&
          b.instructorId.startsWith('course_') &&
          b.status !== 'cancelled'
      )
      .map((b) => b.instructorId.replace('course_', ''))
  );
  return courses.filter((c) => !c.isHidden && enrolledIds.has(c.id));
};

export interface ActiveCourseEnrollment {
  course: Course;
  booking: Booking;
}

/** Enrolled group course that includes today in its date range. Preserved for 9C. */
export const getActiveCourseEnrollment = (
  bookings: Booking[],
  courses: Course[],
  userId?: string,
  fromDate = new Date()
): ActiveCourseEnrollment | null => {
  const todayStr = toYMD(fromDate);
  const enrolled = getEnrolledCourses(bookings, courses, userId);

  for (const course of enrolled) {
    const booking = bookings.find(
      (b) =>
        (!userId || b.userId === userId) &&
        !b.isDeleted &&
        b.instructorId === `course_${course.id}` &&
        b.status !== 'cancelled' &&
        isBookingOnDate(b, todayStr, courses)
    );
    if (booking) return { course, booking };
  }

  return null;
};

export const getAvailableCourses = (
  bookings: Booking[],
  courses: Course[],
  userId?: string
): Course[] => {
  const enrolledIds = new Set(getEnrolledCourses(bookings, courses, userId).map((c) => c.id));
  return courses.filter((c) => !c.isHidden && !enrolledIds.has(c.id));
};

export const getCourseTrackLabel = (course: Course) =>
  getTrackLabelForLevel(course.level || 'beginner');

export const aggregateSkillItemProgress = (item: SkillItem, scores: Record<string, number>) => {
  const earned = scores[item.id] || 0;
  return item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 0;
};
