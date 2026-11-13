import { formatSessionDayLabel } from '../../src/features/student-cabinet/components/student/studentSessionPresentation';
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
  formatSessionCalendarDateLabel,
  getTodaySessionCountdownsFromSessions,
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
          durationMinutes: (Date.parse(end) - Date.parse(start)) / 60_000,
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
    const countdown = getTodaySessionCountdownFromSessions([item], now, 'Asia/Almaty');
    if (remaining === null) expect(countdown).toBeNull();
    else expect(countdown!.startsAt.getTime() - now.getTime()).toBe(remaining);
  });

  it('uses the resort day across UTC midnight for countdown, ticking and calendars', () => {
    const item = make('2026-06-14T19:30:00.000Z', '2026-06-14T21:30:00.000Z');
    const now = new Date('2026-06-14T19:00:00.000Z'); // June 15, 00:00 in Almaty.
    expect(
      getTodaySessionCountdownFromSessions([item], now, 'Asia/Almaty')?.startsAt.toISOString()
    ).toBe('2026-06-14T19:30:00.000Z');
    expect(hasTrainingTodayFromSessions([item], now, 'Asia/Almaty')).toBe(true);
    expect(
      getNextSessionsNext7DaysFromSessions([item], now, 'Asia/Almaty').map((row) => row.dateStr)
    ).toEqual(['2026-06-15']);
    expect(getMiniCalendarDaysFromSessions([item], 'en', now, 'Asia/Almaty')[0]).toMatchObject({
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
  expect(
    getTodaySessionCountdownFromSessions([lessons, courses], now, 'Asia/Almaty')?.session
  ).toBe(courses);
  expect(
    getNextSessionsNext7DaysFromSessions([lessons, courses], now, 'Asia/Almaty').map(
      (row) => row.session
    )
  ).toEqual([courses, lessons]);
});

// The school calendar groups instants; occurrence date/time/timezone stay intact.
describe('B6 school calendar', () => {
  it.each([
    ['2026-11-12T18:59:59Z', '2026-11-12'],
    ['2026-11-12T19:00:00Z', '2026-11-13'],
    ['2026-11-12T19:00:01Z', '2026-11-13'],
    ['2026-11-12T19:30:00Z', '2026-11-13'],
  ])('switches exactly at school midnight: %s', (instant, today) => {
    const now = new Date(instant);
    const item = lesson('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
    const days = getMiniCalendarDaysFromSessions([item], 'en', now, 'Asia/Almaty');
    expect(days[0].dateStr).toBe(today);
    expect(days.filter((day) => day.isToday).map((day) => day.dateStr)).toEqual([today]);
    expect(hasTrainingTodayFromSessions([item], now, 'Asia/Almaty')).toBe(today === '2026-11-13');
    expect(getTodaySessionCountdownFromSessions([item], now, 'Asia/Almaty') !== null).toBe(
      today === '2026-11-13'
    );
    expect(formatSessionDayLabel('2026-11-13', 'en', (key) => key, today)).toBe(
      today === '2026-11-13' ? 'scToday' : 'scTomorrow'
    );
  });

  it.each([
    [
      'Asia/Almaty',
      '2026-11-12T19:30:00Z',
      [
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
        '2026-11-19',
      ],
    ],
    [
      'Asia/Almaty',
      '2026-12-28T19:30:00Z',
      [
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
        '2027-01-03',
        '2027-01-04',
      ],
    ],
    [
      'Europe/Paris',
      '2026-03-27T23:30:00Z',
      [
        '2026-03-28',
        '2026-03-29',
        '2026-03-30',
        '2026-03-31',
        '2026-04-01',
        '2026-04-02',
        '2026-04-03',
      ],
    ],
    [
      'Europe/Paris',
      '2026-10-23T22:30:00Z',
      [
        '2026-10-24',
        '2026-10-25',
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
      ],
    ],
    [
      'America/New_York',
      '2026-03-07T05:30:00Z',
      [
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
      ],
    ],
    [
      'America/New_York',
      '2026-10-31T04:30:00Z',
      [
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
      ],
    ],
    [
      'UTC',
      '2026-11-12T19:30:00Z',
      [
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
      ],
    ],
  ])('builds seven dates across DST and year boundaries in %s', (zone, instant, expected) => {
    const now = new Date(instant);
    const days = getMiniCalendarDaysFromSessions([], 'en', now, zone);
    expect(days.map((day) => day.dateStr)).toEqual(expected);
    expect(days.map((day) => day.isToday)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(days.every((day) => !day.hasSession)).toBe(true);
    expect(formatSessionDayLabel(expected[1], 'en', (key) => key, expected[0])).toBe('scTomorrow');
  });

  it.each([
    ['lesson', lesson],
    ['course day', course],
  ] as const)(
    'groups %s in a changed school zone while retaining its occurrence contract',
    (_, make) => {
      const item = make('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
      const original = JSON.stringify(item);
      const now = new Date('2026-11-12T19:30:00Z');
      expect(getNextSessionsNext7DaysFromSessions([item], now, 'America/New_York')[0].dateStr).toBe(
        '2026-11-12'
      );
      expect(getNextSessionsNext7DaysFromSessions([item], now, 'Asia/Almaty')[0].dateStr).toBe(
        '2026-11-13'
      );
      expect(
        getMiniCalendarDaysFromSessions([item], 'en', now, 'America/New_York')[0].hasSession
      ).toBe(true);
      expect(formatCabinetSessionTimeRange(item)).toBe('01:00–02:00');
      expect(
        formatSessionCalendarDateLabel(item.kind === 'lesson' ? item.session.date : item.date, 'en')
      ).toBe('November 13');
      expect(resolveSessionStartDateTime(item)?.toISOString()).toBe('2026-11-12T20:00:00.000Z');
      expect(resolveSessionEndDateTime(item)?.toISOString()).toBe('2026-11-12T21:00:00.000Z');
      expect(JSON.stringify(item)).toBe(original);
    }
  );

  it('keeps all simultaneous lessons and course days at the next start', () => {
    const a = lesson('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
    const b = lesson('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
    const c = course('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
    const now = new Date('2026-11-12T19:30:00Z');
    expect(
      getTodaySessionCountdownsFromSessions([a, b, c], now, 'Asia/Almaty').map((row) => row.session)
    ).toEqual([a, b, c]);
    expect(
      getNextSessionsNext7DaysFromSessions([a, b, c], now, 'Asia/Almaty').map((row) => row.session)
    ).toEqual([a, b, c]);
  });

  it('formats date-only labels independently of host timezone in RU and EN', () => {
    expect(formatSessionDayLabel('2027-01-01', 'en', (key) => key, '2026-12-29')).toBe('January 1');
    expect(formatSessionDayLabel('2027-01-01', 'ru', (key) => key, '2026-12-29')).toBe('1 января');
  });
});

it('orders a shared school date by canonical instants across saved occurrence timezones', () => {
  const earlier = lesson('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
  const later = lesson('2026-11-12T21:00:00Z', '2026-11-12T22:00:00Z');
  if (later.kind !== 'lesson') throw new Error('Expected lesson fixture');
  const changedZone: CabinetSessionItem = {
    ...later,
    session: { ...later.session, timeZone: 'America/New_York', date: '2026-11-12', time: '16:00' },
  };
  expect(
    getNextSessionsNext7DaysFromSessions(
      [changedZone, earlier],
      new Date('2026-11-12T19:30:00Z'),
      'America/New_York'
    ).map((row) => row.session)
  ).toEqual([earlier, changedZone]);
});

it('marks only the matching active school dates and excludes the eighth date', () => {
  const first = lesson('2026-11-12T20:00:00Z', '2026-11-12T21:00:00Z');
  const last = lesson('2026-11-18T20:00:00Z', '2026-11-18T21:00:00Z');
  const eighth = lesson('2026-11-19T20:00:00Z', '2026-11-19T21:00:00Z');
  const now = new Date('2026-11-12T19:30:00Z');
  expect(
    getMiniCalendarDaysFromSessions([first, last, eighth], 'en', now, 'Asia/Almaty').map(
      (day) => day.hasSession
    )
  ).toEqual([true, false, false, false, false, false, true]);
  expect(
    getNextSessionsNext7DaysFromSessions([eighth, last, first], now, 'Asia/Almaty').map(
      (row) => row.dateStr
    )
  ).toEqual(['2026-11-13', '2026-11-19']);
});
