import type { Booking, Course, Instructor, Review, UserProfile } from '../../../../types';
import type { SkillItem } from '../../../../domain/achievements';
import { DEFAULT_SKILL_CONFIG } from '../../../../domain/achievements';
import { getCourseTrackLabel as getTrackLabelForLevel } from '../../../../domain/course';
import {
  isBookingCurrentBySchedule,
  isBookingOnDate,
  isBookingPastBySchedule,
  isBookingUpcomingBySchedule,
} from './studentBookingSchedule';
import { getNextSession } from './studentSessionSchedule';
import {
  formatRecentLessonDateLabel,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
  resolveBookingStartDate,
} from './studentLessonPresentation';
import { toYMD } from './studentCabinetPresentation';
import { hasPendingRecommendations } from '../../lessonRecommendations';
import { isBookingReviewed } from './studentHistory';
import type { RecentLesson, StudentStats } from './studentCabinetUtils';

const isActiveBooking = (booking: Booking) =>
  !booking.isDeleted && (booking.status === 'confirmed' || booking.status === 'pending');

export type BookingListScope = 'upcoming' | 'current' | 'past' | 'all';

export const filterBookingsByScope = (
  bookings: Booking[],
  scope: BookingListScope,
  courses: Course[] = [],
  now = new Date()
): Booking[] => {
  if (scope === 'all') return bookings;
  if (scope === 'upcoming') {
    return bookings.filter((b) => isBookingUpcomingBySchedule(b, courses, now));
  }
  if (scope === 'current') {
    return bookings.filter((b) => isBookingCurrentBySchedule(b, courses, now));
  }
  return bookings.filter((b) => isBookingPastBySchedule(b, courses, now));
};

export const getStudentStats = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillItems: SkillItem[] = DEFAULT_SKILL_CONFIG.items
): StudentStats => {
  const completed = bookings.filter((b) => b.status === 'completed' && !b.isDeleted);
  const hours = completed.reduce((acc, b) => acc + b.durationHours, 0);
  const scores = userProfile.skillScores || {};
  const points = Object.values(scores).reduce((a, b) => a + b, 0);
  const exercisesMastered = skillItems.filter(
    (item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints
  ).length;
  return {
    lessons: completed.length,
    hours: Math.round(hours),
    exercisesMastered,
    points,
  };
};

/** Completed lessons in the current calendar year. */
export const getSeasonBookings = (
  bookings: Booking[],
  userId?: string,
  fromDate = new Date()
): Booking[] => {
  const yearPrefix = String(fromDate.getFullYear());
  return bookings.filter(
    (b) =>
      (!userId || b.userId === userId) &&
      !b.isDeleted &&
      b.status === 'completed' &&
      b.date.startsWith(yearPrefix)
  );
};

/** True if the student has a non-cancelled booking on today's date (private or course day). */
export const hasTrainingToday = (
  bookings: Booking[],
  courses: Course[],
  userId?: string,
  fromDate = new Date()
): boolean => {
  const todayStr = toYMD(fromDate);
  return bookings.some(
    (b) =>
      (!userId || b.userId === userId) &&
      !b.isDeleted &&
      b.status !== 'cancelled' &&
      isBookingOnDate(b, todayStr, courses)
  );
};

const countPendingRecommendations = (booking: Booking) => {
  const completed = new Set(booking.completedRecommendationIds ?? []);
  return (booking.recommendations ?? []).filter(
    (recommendation) => !completed.has(recommendation.id)
  ).length;
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
      (booking) => booking.userId === userId && booking.status === 'completed' && !booking.isDeleted
    )
    .filter(
      (booking) =>
        !isBookingReviewed(booking, reviews, dismissedReviewIds) ||
        hasPendingRecommendations(booking)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

export const getRecentLessons = (
  bookings: Booking[],
  reviews: Review[],
  courses: Course[],
  language: 'en' | 'ru',
  dismissedReviewIds: string[] = []
): RecentLesson[] => {
  return bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted)
    .sort((a, b) =>
      resolveBookingStartDate(b, courses).localeCompare(resolveBookingStartDate(a, courses))
    )
    .slice(0, 4)
    .map((b) => {
      const review = reviews.find(
        (r) => r.bookingId === b.id || (r.userId === b.userId && r.date === b.date)
      );
      const needsReview = !isBookingReviewed(b, reviews, dismissedReviewIds);
      const pendingRecommendationsCount = countPendingRecommendations(b);
      return {
        id: b.id,
        title: getRecentLessonTitle(b, courses, language),
        dateLabel: formatRecentLessonDateLabel(b, courses, language),
        rating: review?.rating ?? 5,
        reviewSnippet: review?.comment,
        instructorName: getRecentLessonInstructorLabel(b, language),
        booking: b,
        needsReview,
        pendingRecommendationsCount:
          pendingRecommendationsCount > 0 ? pendingRecommendationsCount : undefined,
      };
    });
};

export type MiniCalendarDay = {
  day: number;
  dateStr: string;
  hasSession: boolean;
  isToday: boolean;
  weekdayLabel: string;
};

/** Next 7 days starting from today with booked sessions marked. */
export const getMiniCalendarDays = (
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru' = 'ru',
  fromDate = new Date()
): MiniCalendarDay[] => {
  const todayStr = toYMD(fromDate);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const booked = bookings.filter(isActiveBooking);

  const days: MiniCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(fromDate);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const dateStr = toYMD(d);
    const hasSession = booked.some((b) => isBookingOnDate(b, dateStr, courses));
    days.push({
      day: d.getDate(),
      dateStr,
      hasSession,
      isToday: dateStr === todayStr,
      weekdayLabel: d.toLocaleDateString(locale, { weekday: 'short' }),
    });
  }
  return days;
};

/** Booked sessions within the next 7 days from today, sorted by date/time. */
export const getWeekBookedSessions = (bookings: Booking[], courses: Course[]) => {
  const days = getMiniCalendarDays(bookings, courses);
  const weekDateSet = new Set(days.map((d) => d.dateStr));
  const booked = bookings.filter(isActiveBooking);

  const rows: { booking: Booking; dateStr: string }[] = [];
  for (const b of booked) {
    for (const dateStr of weekDateSet) {
      if (isBookingOnDate(b, dateStr, courses)) {
        rows.push({ booking: b, dateStr });
      }
    }
  }

  return rows.sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return a.booking.time.localeCompare(b.booking.time);
  });
};

export const getNextCalendarSession = (
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const next = getNextSession(bookings, courses);
  if (!next) return null;
  const d = new Date(`${resolveBookingStartDate(next, courses)}T12:00:00`);
  return {
    booking: next,
    label: d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'long',
    }),
  };
};

export const getInstructorsForStudent = (bookings: Booking[], instructors: Instructor[]) =>
  getMyInstructors(bookings, instructors);

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

/** Enrolled group course that includes today in its date range. */
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
