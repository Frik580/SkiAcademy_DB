import { cabinetLessonTiming } from '../fixtures/cabinetLessonTiming';
import { describe, expect, it } from 'vitest';
import type { CourseScheduleProjectionReadModel } from '@ski-academy/shared-domain';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseDaySessionItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import {
  aggregateCabinetSessionsForStudentList,
  buildCourseEnrollmentScheduleLines,
  filterCabinetListByScope,
  formatCourseDayCountLabel,
  formatCourseEnrollmentDateRange,
  type CourseEnrollmentListItem,
} from '../../src/features/course-enrollments/courseEnrollmentListProjection';
import { translations } from '../../src/lib/i18n/translations';

function courseDay(
  overrides: Partial<CourseDaySessionItem> &
    Pick<CourseDaySessionItem, 'enrollmentId' | 'courseDayId' | 'date'>
): CourseDaySessionItem {
  return {
    kind: 'course_day',
    courseId: 'course_performance',
    participantId: 'participant_1',
    courseTitle: 'Performance Carving Masterclass',
    time: '10:00',
    endTime: '16:00',
    timeZone: 'Asia/Almaty',
    dayOrder: 1,
    lifecycleStatus: 'confirmed',
    participantName: 'Alex',
    revision: 2,
    authorizedActions: { canWithdraw: false, canRequestCancellation: true },
    ...overrides,
  };
}

function lesson(id: string, date: string): LessonBookingCabinetItem {
  return {
    id,
    bookingId: id,
    revision: 1,
    status: 'confirmed',
    date,
    time: '09:00',
    durationHours: 2,
    ...cabinetLessonTiming(date, '09:00', 2),
    instructorId: 'instructor_1',
    instructorName: `Coach ${id}`,
    instructorAvatar: '',
    participantNames: ['Alex'],
    partyKind: 'individual',
    payment: { kind: 'visible' },
    bookingOrigin: 'account',
    isLessonBooking: true,
  };
}

const masterclassDays = [
  courseDay({
    enrollmentId: 'enrollment_a',
    courseDayId: 'day_4',
    date: '2026-12-15',
    time: '10:00',
    endTime: '14:00',
    dayOrder: 4,
  }),
  courseDay({
    enrollmentId: 'enrollment_a',
    courseDayId: 'day_2',
    date: '2026-12-13',
    time: '10:00',
    endTime: '15:00',
    dayOrder: 2,
  }),
  courseDay({
    enrollmentId: 'enrollment_a',
    courseDayId: 'day_1',
    date: '2026-12-12',
    time: '10:00',
    endTime: '16:00',
    dayOrder: 1,
  }),
  courseDay({
    enrollmentId: 'enrollment_a',
    courseDayId: 'day_3',
    date: '2026-12-14',
    time: '10:00',
    endTime: '16:00',
    dayOrder: 3,
  }),
];

function onlyCourse(
  items: ReturnType<typeof aggregateCabinetSessionsForStudentList>
): CourseEnrollmentListItem {
  const course = items.find((item) => item.kind === 'course_enrollment');
  if (!course || course.kind !== 'course_enrollment') {
    throw new Error('expected one course card');
  }
  return course;
}

describe('student course enrollment list projection', () => {
  it('collapses four CourseDays of one enrollment into one card', () => {
    const cards = aggregateCabinetSessionsForStudentList(masterclassDays);
    expect(cards.filter((item) => item.kind === 'course_enrollment')).toHaveLength(1);
    const course = onlyCourse(cards);
    expect(course.courseTitle).toBe('Performance Carving Masterclass');
    expect(course.enrollmentId).toBe('enrollment_a');
    expect(course.days).toHaveLength(4);
    expect(course.days.map((day) => day.courseDayId)).toEqual(['day_1', 'day_2', 'day_3', 'day_4']);
    expect(formatCourseEnrollmentDateRange(course, 'ru')).toBe('12–15 декабря');
    expect(formatCourseEnrollmentDateRange(course, 'en')).toBe('12–15 December');
    expect(course.lifecycleStatus).toBe('confirmed');
  });

  it('keeps two enrollments of the same course as two cards', () => {
    const second = masterclassDays.map((day) =>
      courseDay({
        ...day,
        enrollmentId: 'enrollment_b',
        courseDayId: `${day.courseDayId}_b`,
        participantId: 'participant_2',
        participantName: 'Sam',
      })
    );
    const cards = aggregateCabinetSessionsForStudentList([...masterclassDays, ...second]);
    const courses = cards.filter((item) => item.kind === 'course_enrollment');
    expect(courses).toHaveLength(2);
    expect(
      courses.map((item) => (item.kind === 'course_enrollment' ? item.enrollmentId : ''))
    ).toEqual(expect.arrayContaining(['enrollment_a', 'enrollment_b']));
    expect(
      new Set(courses.map((item) => (item.kind === 'course_enrollment' ? item.courseId : ''))).size
    ).toBe(1);
  });

  it('leaves ordinary lesson bookings as separate cards', () => {
    const cards = aggregateCabinetSessionsForStudentList([
      { kind: 'lesson', session: lesson('booking_a', '2026-12-12') },
      { kind: 'lesson', session: lesson('booking_b', '2026-12-20') },
    ]);
    expect(cards).toHaveLength(2);
    expect(cards.every((item) => item.kind === 'lesson')).toBe(true);
  });

  it('mixes two lessons and one four-day course into three cards', () => {
    const cards = aggregateCabinetSessionsForStudentList([
      { kind: 'lesson', session: lesson('booking_a', '2026-12-01') },
      { kind: 'lesson', session: lesson('booking_b', '2026-12-20') },
      ...masterclassDays,
    ]);
    expect(cards).toHaveLength(3);
    expect(cards.filter((item) => item.kind === 'lesson')).toHaveLength(2);
    expect(cards.filter((item) => item.kind === 'course_enrollment')).toHaveLength(1);
  });

  it('places an aggregated course into upcoming, current, or past by its full interval', () => {
    const now = new Date(2026, 9, 1, 12, 0, 0);
    const upcoming = aggregateCabinetSessionsForStudentList(masterclassDays);
    const current = aggregateCabinetSessionsForStudentList([
      courseDay({
        enrollmentId: 'enrollment_live',
        courseDayId: 'live_1',
        date: '2026-09-30',
        endTime: '18:00',
      }),
      courseDay({
        enrollmentId: 'enrollment_live',
        courseDayId: 'live_2',
        date: '2026-10-02',
        endTime: '18:00',
      }),
    ]);
    const past = aggregateCabinetSessionsForStudentList([
      courseDay({
        enrollmentId: 'enrollment_old',
        courseDayId: 'old_1',
        date: '2026-09-01',
        endTime: '16:00',
      }),
      courseDay({
        enrollmentId: 'enrollment_old',
        courseDayId: 'old_2',
        date: '2026-09-02',
        endTime: '16:00',
      }),
    ]);
    const all = [...upcoming, ...current, ...past];

    expect(filterCabinetListByScope(all, 'upcoming', now).map(enrollmentIdOf)).toEqual([
      'enrollment_a',
    ]);
    expect(filterCabinetListByScope(all, 'current', now).map(enrollmentIdOf)).toEqual([
      'enrollment_live',
    ]);
    expect(filterCabinetListByScope(all, 'past', now).map(enrollmentIdOf)).toEqual([
      'enrollment_old',
    ]);
    expect(filterCabinetListByScope(all, 'all', now)).toHaveLength(3);
  });

  it('keeps lesson scope filtering on the lesson itself', () => {
    const now = new Date(2026, 9, 1, 12, 0, 0);
    const cards = aggregateCabinetSessionsForStudentList([
      { kind: 'lesson', session: lesson('booking_future', '2026-12-01') },
      { kind: 'lesson', session: lesson('booking_past', '2026-09-01') },
    ]);
    expect(filterCabinetListByScope(cards, 'upcoming', now)).toHaveLength(1);
    expect(filterCabinetListByScope(cards, 'past', now)).toHaveLength(1);
  });

  it('formats one day, a cross-month span, and plural day counts from translation forms', () => {
    const oneDay = onlyCourse(
      aggregateCabinetSessionsForStudentList([
        courseDay({ enrollmentId: 'enrollment_one', courseDayId: 'only', date: '2026-12-15' }),
      ])
    );
    expect(formatCourseEnrollmentDateRange(oneDay, 'ru')).toBe('15 декабря');
    expect(formatCourseEnrollmentDateRange(oneDay, 'en')).toBe('15 December');

    const crossMonth = onlyCourse(
      aggregateCabinetSessionsForStudentList([
        courseDay({ enrollmentId: 'enrollment_year', courseDayId: 'y1', date: '2026-12-30' }),
        courseDay({ enrollmentId: 'enrollment_year', courseDayId: 'y2', date: '2027-01-02' }),
      ])
    );
    expect(formatCourseEnrollmentDateRange(crossMonth, 'ru')).toBe('30 декабря – 2 января');
    expect(formatCourseEnrollmentDateRange(crossMonth, 'en')).toBe('30 December – 2 January');

    const ruForms = [
      translations.ru.scCourseDayOne,
      translations.ru.scCourseDayFew,
      translations.ru.scCourseDayMany,
    ] as const;
    const enForms = [
      translations.en.scCourseDayOne,
      translations.en.scCourseDayFew,
      translations.en.scCourseDayMany,
    ] as const;
    expect(formatCourseDayCountLabel(1, 'ru', ruForms)).toBe('1 день');
    expect(formatCourseDayCountLabel(2, 'ru', ruForms)).toBe('2 дня');
    expect(formatCourseDayCountLabel(4, 'ru', ruForms)).toBe('4 дня');
    expect(formatCourseDayCountLabel(5, 'ru', ruForms)).toBe('5 дней');
    expect(formatCourseDayCountLabel(1, 'en', enForms)).toBe('1 day');
    expect(formatCourseDayCountLabel(4, 'en', enForms)).toBe('4 days');
    expect(translations.ru.scGroupCourse).toBe('Групповой курс');
    expect(translations.en.scGroupCourse).toBe('Group course');
    expect(translations.ru.scCourseSchedule).toBe('Расписание курса');
    expect(translations.en.scCourseSchedule).toBe('Course schedule');
  });

  it('sorts course schedule lines by actual start time', () => {
    const schedule: CourseScheduleProjectionReadModel = {
      courseId: 'course_performance',
      courseScheduleRevision: 1,
      courseDayCount: 4,
      startAt: stamp('2026-12-12T10:00:00.000Z'),
      finalCourseDayEndsAt: stamp('2026-12-15T14:00:00.000Z'),
      courseDays: [
        day('day_4', '2026-12-15T10:00:00.000Z', '2026-12-15T14:00:00.000Z', 4),
        day('day_1', '2026-12-12T10:00:00.000Z', '2026-12-12T16:00:00.000Z', 1),
        day('day_3', '2026-12-14T10:00:00.000Z', '2026-12-14T16:00:00.000Z', 3),
        day('day_2', '2026-12-13T10:00:00.000Z', '2026-12-13T15:00:00.000Z', 2),
      ],
    };
    const lines = buildCourseEnrollmentScheduleLines(schedule, 'ru');
    expect(lines.map((line) => line.courseDayId)).toEqual(['day_1', 'day_2', 'day_3', 'day_4']);
    expect(lines.map((line) => line.label)).toEqual([
      expect.stringContaining('10:00–16:00'),
      expect.stringContaining('10:00–15:00'),
      expect.stringContaining('10:00–16:00'),
      expect.stringContaining('10:00–14:00'),
    ]);
    expect(lines[0]?.label.startsWith('12')).toBe(true);
    expect(lines[3]?.label.startsWith('15')).toBe(true);
  });
});

function enrollmentIdOf(item: {
  kind: string;
  enrollmentId?: string;
  session?: { id: string };
}): string {
  return item.kind === 'course_enrollment' ? (item.enrollmentId ?? '') : (item.session?.id ?? '');
}

function stamp(iso: string): { seconds: number; nanoseconds: number } {
  return { seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 };
}

function day(
  courseDayId: string,
  startsAt: string,
  endsAt: string,
  dayOrder: number
): CourseScheduleProjectionReadModel['courseDays'][number] {
  return {
    courseDayId,
    dayOrder,
    interval: { startsAt: stamp(startsAt), endsAt: stamp(endsAt) },
    timeZone: 'UTC',
    revision: 1,
  };
}
