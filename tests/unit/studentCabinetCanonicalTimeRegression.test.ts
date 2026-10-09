import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  InstructorIdSchema,
  LessonBookingReadModelSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { CabinetSessionItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import { expandEnrollmentToCourseDaySessions } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { mapLessonBookingReadModelToCabinetItem } from '../../src/features/lesson-bookings/lessonBookingViewModel';
import {
  filterSessionsByScope,
  formatCabinetSessionTimeRange,
  getCurrentSessionItems,
  getMiniCalendarDaysFromSessions,
  getNextSessionsNext7DaysFromSessions,
  getTodaySessionCountdownFromSessions,
  hasTrainingTodayFromSessions,
  resolveSessionEndDateTime,
  resolveSessionStartDateTime,
} from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';

const START = '2026-06-15T04:00:00.000Z';
const END = '2026-06-15T06:00:00.000Z';
const stamp = (instant: string) => timestampFromDate(new Date(instant));
const participantId = ParticipantIdSchema.parse('participant_time_regression');

function lesson(start = START, end = END): CabinetSessionItem {
  return {
    kind: 'lesson',
    session: mapLessonBookingReadModelToCabinetItem(
      LessonBookingReadModelSchema.parse({
        bookingId: BookingIdSchema.parse('booking_time_regression'),
        revision: 1,
        partyKind: 'individual',
        participantIds: [participantId],
        participants: [{ participantId, displayName: 'Student' }],
        instructor: {
          instructorId: InstructorIdSchema.parse('instructor_time_regression'),
          displayName: 'Coach',
        },
        occurrence: {
          startsAt: stamp(start),
          endsAt: stamp(end),
          durationMinutes: 120,
          timeZone: 'Asia/Almaty',
        },
        lifecycle: { status: 'confirmed' },
        bookingOrigin: 'account',
        authorizedActions: {
          canRequestCancellation: false,
          canWithdrawCancellation: false,
          canReschedule: false,
          canCreateChangeRequest: false,
        },
        updatedAt: stamp(START),
      })
    ),
  };
}

function course(start = START, end = END): CabinetSessionItem {
  const interval = { startsAt: stamp(start), endsAt: stamp(end) };
  const enrollment: CourseEnrollmentCabinetItem = {
    enrollmentId: 'enrollment_time_regression',
    revision: 1,
    courseId: 'course_time_regression',
    participantId,
    participantName: 'Student',
    lifecycleStatus: 'confirmed',
    courseTitle: 'Course',
    courseSchedule: {
      courseId: 'course_time_regression',
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: interval.startsAt,
      finalCourseDayEndsAt: interval.endsAt,
      courseDays: [
        {
          courseDayId: 'day_time_regression',
          dayOrder: 1,
          revision: 1,
          timeZone: 'Asia/Almaty',
          interval,
        },
      ],
    },
    scheduleStartDate: '2026-06-15',
    scheduleEndDate: '2026-06-15',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: false, canRequestCancellation: false },
    updatedAtSeconds: interval.startsAt.seconds,
  };
  return expandEnrollmentToCourseDaySessions(enrollment)[0];
}

// Run this file in isolated processes with TZ=Asia/Almaty, UTC and America/New_York.
// Expected instants and durations stay identical; no expected value depends on host TZ.
describe.each([
  ['lesson', lesson],
  ['course', course],
] as const)('%s canonical time', (_, make) => {
  it('keeps display labels independent of the browser timezone', () => {
    const item = make();
    expect(formatCabinetSessionTimeRange(item)).toBe('09:00–11:00');
    expect(resolveSessionStartDateTime(item)?.toISOString()).toBe(START);
    expect(resolveSessionEndDateTime(item)?.toISOString()).toBe(END);
  });

  it.each([
    ['2026-06-15T03:30:00.000Z', 'upcoming', 30 * 60 * 1000],
    ['2026-06-15T03:59:59.999Z', 'upcoming', 1],
    [START, 'current', null],
    ['2026-06-15T04:30:00.000Z', 'current', null],
    ['2026-06-15T05:59:59.999Z', 'current', null],
    [END, 'past', null],
    ['2026-06-15T06:00:00.001Z', 'past', null],
  ] as const)('classifies and counts down at %s', (instant, scope, remaining) => {
    const item = make();
    const now = new Date(instant);
    for (const candidate of ['upcoming', 'current', 'past'] as const) {
      expect(filterSessionsByScope([item], candidate, now)).toEqual(
        candidate === scope ? [item] : []
      );
    }
    expect(getCurrentSessionItems([item], now)).toEqual(scope === 'current' ? [item] : []);
    const countdown = getTodaySessionCountdownFromSessions([item], now);
    if (remaining === null) expect(countdown).toBeNull();
    else expect(countdown!.startsAt.getTime() - now.getTime()).toBe(remaining);
  });

  it('uses the resort day across UTC midnight for countdown, ticking and calendars', () => {
    const item = make('2026-06-14T19:30:00.000Z', '2026-06-14T21:30:00.000Z');
    const now = new Date('2026-06-14T19:00:00.000Z'); // June 15, 00:00 in Almaty.
    expect(getTodaySessionCountdownFromSessions([item], now)?.startsAt.toISOString()).toBe(
      '2026-06-14T19:30:00.000Z'
    );
    expect(hasTrainingTodayFromSessions([item], now)).toBe(true);
    expect(getNextSessionsNext7DaysFromSessions([item], now).map((row) => row.dateStr)).toEqual([
      '2026-06-15',
    ]);
    expect(getMiniCalendarDaysFromSessions([item], 'en', now)[0]).toMatchObject({
      dateStr: '2026-06-15',
      day: 15,
      isToday: true,
      hasSession: true,
      weekdayLabel: 'Mon',
    });
    expect(getCurrentSessionItems([item], new Date('2026-06-14T19:45:00.000Z'))).toEqual([item]);
  });

  it('keeps an overnight session current through local midnight', () => {
    const item = make('2026-06-15T18:30:00.000Z', '2026-06-15T20:30:00.000Z');
    expect(resolveSessionEndDateTime(item)?.toISOString()).toBe('2026-06-15T20:30:00.000Z');
    expect(getCurrentSessionItems([item], new Date('2026-06-15T19:15:00.000Z'))).toEqual([item]);
    expect(filterSessionsByScope([item], 'past', new Date('2026-06-15T20:30:00.000Z'))).toEqual([
      item,
    ]);
  });

  it('preserves seconds and milliseconds discarded by display strings', () => {
    const item = make('2026-06-15T04:00:12.345Z', '2026-06-15T06:00:12.345Z');
    expect(resolveSessionStartDateTime(item)?.toISOString()).toBe('2026-06-15T04:00:12.345Z');
    expect(resolveSessionEndDateTime(item)?.toISOString()).toBe('2026-06-15T06:00:12.345Z');
  });
});

it('keeps mixed account sessions ordered and selects the earliest countdown', () => {
  const lessons = lesson('2026-06-15T05:00:00.000Z', '2026-06-15T07:00:00.000Z');
  const courses = course();
  const now = new Date('2026-06-15T03:30:00.000Z');
  expect(getTodaySessionCountdownFromSessions([lessons, courses], now)?.session).toBe(courses);
  expect(
    getNextSessionsNext7DaysFromSessions([lessons, courses], now).map((row) => row.session)
  ).toEqual([courses, lessons]);
});
