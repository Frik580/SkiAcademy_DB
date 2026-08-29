import { describe, expect, it } from 'vitest';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import {
  expandEnrollmentsToCourseDaySessions,
  mapCourseEnrollmentReadModelToCabinetItem,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import {
  buildMixedCabinetSessionItems,
  isCourseDaySession,
  isLessonSession,
} from '../../src/features/course-enrollments/cabinetSessionItems';
import {
  filterSessionsByScope,
  formatCabinetSessionTimeRange,
  getMiniCalendarDaysFromSessions,
  getNextSessionsNext7DaysFromSessions,
  isSessionOnDate,
  resolveSessionEndDateTime,
  resolveSessionStartDateTime,
  sessionDisplayDate,
} from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type { CourseEnrollmentReadModel } from '@ski-academy/shared-domain';

const lessonFixture: LessonBookingCabinetItem = {
  id: 'booking_lesson_fixture',
  bookingId: 'booking_lesson_fixture',
  revision: 1,
  status: 'confirmed',
  date: '2027-03-15',
  time: '10:00-12:00',
  durationHours: 2,
  instructorId: 'instructor_fixture_01',
  instructorName: 'Coach',
  instructorAvatar: '',
  participantNames: ['Alice'],
  partyKind: 'individual',
  payment: { kind: 'visible', totalPrice: 120 },
  bookingOrigin: 'account',
  isLessonBooking: true,
};

const enrollmentReadModel: CourseEnrollmentReadModel = {
  enrollmentId: 'enrollment_calendar_fixture',
  revision: 2,
  courseId: 'course_calendar_fixture',
  participant: { participantId: 'participant_calendar_fixture', displayName: 'Alice' },
  lifecycle: { status: 'confirmed' },
  courseDisplay: { courseId: 'course_calendar_fixture', title: 'Spring Camp' },
  courseSchedule: {
    courseId: 'course_calendar_fixture',
    courseScheduleRevision: 1,
    courseDayCount: 1,
    startAt: { seconds: 1_804_108_800, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_804_115_400, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_calendar_fixture',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_804_108_800, nanoseconds: 0 },
          endsAt: { seconds: 1_804_115_400, nanoseconds: 0 },
        },
        timeZone: 'UTC',
        revision: 1,
      },
    ],
  },
  bookingOrigin: 'account',
  authorizedActions: { canWithdraw: true, canRequestCancellation: false },
  updatedAt: { seconds: 1_804_000_000, nanoseconds: 0 },
};

describe('customer session presentation cutover', () => {
  const enrollment = mapCourseEnrollmentReadModelToCabinetItem(enrollmentReadModel);
  const mixed = buildMixedCabinetSessionItems({
    lessonBookings: [lessonFixture],
    courseEnrollments: [enrollment],
  });

  it('builds mixed lesson and course_day sessions without synthetic booking fields', () => {
    expect(mixed.some(isLessonSession)).toBe(true);
    expect(mixed.some(isCourseDaySession)).toBe(true);
    const courseDay = mixed.find(isCourseDaySession);
    expect(courseDay).toMatchObject({
      kind: 'course_day',
      courseDayId: 'course_day_calendar_fixture',
      enrollmentId: 'enrollment_calendar_fixture',
      courseId: 'course_calendar_fixture',
    });
    expect(courseDay).not.toHaveProperty('bookingId');
    expect(courseDay).not.toHaveProperty('instructorId');
  });

  it('uses canonical CourseDay interval for schedule boundaries', () => {
    const [courseDay] = expandEnrollmentsToCourseDaySessions([enrollment]);
    const session = { kind: 'course_day' as const, ...courseDay };
    const start = resolveSessionStartDateTime(session);
    const end = resolveSessionEndDateTime(session);
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(end!.getTime()).toBeGreaterThan(start!.getTime());
    expect(formatCabinetSessionTimeRange(session)).toContain('–');
  });

  it('detects course_day sessions on date without course_* booking conventions', () => {
    const courseDay = mixed.find(isCourseDaySession)!;
    expect(isSessionOnDate(courseDay, courseDay.date)).toBe(true);
    expect(isSessionOnDate(courseDay, lessonFixture.date)).toBe(false);
  });

  it('orders upcoming week sessions chronologically across lesson and course_day', () => {
    const now = new Date('2027-03-10T12:00:00Z');
    const upcoming = getNextSessionsNext7DaysFromSessions(mixed, now);
    expect(upcoming.length).toBeGreaterThan(0);
    expect(
      upcoming.every(
        (entry) => entry.session.kind === 'lesson' || entry.session.kind === 'course_day'
      )
    ).toBe(true);
  });

  it('marks mini calendar days from canonical session items', () => {
    const days = getMiniCalendarDaysFromSessions(mixed, 'en', new Date('2027-03-10T12:00:00Z'));
    expect(days).toHaveLength(7);
    expect(days.some((day) => day.hasSession)).toBe(true);
  });

  it('keeps lesson-only scope filtering unchanged for lesson sessions', () => {
    const lessonOnly = mixed.filter(isLessonSession);
    const upcoming = filterSessionsByScope(
      lessonOnly,
      'upcoming',
      new Date('2027-03-10T12:00:00Z')
    );
    expect(upcoming.every(isLessonSession)).toBe(true);
    expect(upcoming[0]?.kind).toBe('lesson');
    if (upcoming[0]?.kind === 'lesson') {
      expect(sessionDisplayDate(upcoming[0])).toBe(lessonFixture.date);
    }
  });
});
