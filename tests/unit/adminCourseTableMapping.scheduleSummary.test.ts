import { describe, expect, it } from 'vitest';
import {
  AggregateRevisionSchema,
  CourseIdSchema,
  timestampFromDate,
  type AdminCourseListItem,
  type AdminCourseReadModel,
} from '@ski-academy/shared-domain';
import {
  formatAdminCourseDayLocalDate,
  formatAdminCourseDaysScheduleDates,
  formatAdminCourseScheduleSummaryDates,
  mapAdminCourseToTableCourse,
} from '../../src/features/admin/components/courses/adminCourseTableMapping';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const courseId = CourseIdSchema.parse('course_list_date_01');
const instructorId = 'instructor_list_date_01';

function day(localIsoDate: string, dayOrder: number, hourUtc = 5) {
  const startsAt = timestampFromDate(new Date(`${localIsoDate}T0${hourUtc}:00:00.000Z`));
  return {
    courseId,
    courseDayId: `course_day_${dayOrder}`,
    dayOrder,
    interval: {
      startsAt,
      endsAt: timestampFromDate(new Date(`${localIsoDate}T0${hourUtc + 2}:00:00.000Z`)),
    },
    timeZone: 'Asia/Almaty' as const,
    actualInstructorIds: [instructorId],
    revision: AggregateRevisionSchema.parse(1),
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId: 'correlation_schedule_01',
    },
  };
}

function listItem(overrides: Partial<AdminCourseListItem> = {}): AdminCourseListItem {
  return {
    courseId,
    title: 'Freeride Camp',
    lifecycle: 'active',
    price: 120_000,
    capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
    revision: AggregateRevisionSchema.parse(1),
    scheduleRevision: AggregateRevisionSchema.parse(1),
    instructorRosterIds: [instructorId],
    instructors: [{ instructorId, name: 'Coach' }],
    catalogContent: {
      status: 'present',
      content: {
        courseId,
        revision: 1,
        duration: '2h',
        description: 'Camp',
        dates: '1 March 2026',
        bgImageUrl: 'https://example.com/course.webp',
      },
    },
    authorizedActions: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function detailItem(
  courseDays: AdminCourseReadModel['courseDays'],
  staleCatalogDates = '01.09.2026 – 05.09.2026'
): AdminCourseReadModel {
  return {
    ...listItem({
      catalogContent: {
        status: 'present',
        content: {
          courseId,
          revision: 1,
          duration: '2 days',
          description: 'Camp',
          dates: staleCatalogDates,
          bgImageUrl: 'https://example.com/course.webp',
        },
      },
    }),
    courseDays,
    activeEnrollmentCount: 0,
    totalEnrollmentCount: 0,
    provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
  };
}

describe('adminCourseTableMapping scheduleSummary dates', () => {
  it('renders Admin list date from scheduleSummary local day, not stale catalog dates', () => {
    const startsAt = timestampFromDate(new Date('2026-09-20T05:00:00.000Z'));
    const endsAt = timestampFromDate(new Date('2026-09-20T07:00:00.000Z'));
    const scheduleSummary = {
      courseDayCount: 1,
      startsAt,
      firstDayEndsAt: endsAt,
      lastDayStartsAt: startsAt,
      timeZone: 'Asia/Almaty' as const,
    };

    expect(formatAdminCourseScheduleSummaryDates(scheduleSummary)).toBe('20.09.2026');

    const mapped = mapAdminCourseToTableCourse(
      listItem({
        scheduleSummary,
      })
    );
    expect(mapped.dates).toBe('20.09.2026');
  });

  it('uses first–last range for multi-day scheduleSummary (historical Admin list rule)', () => {
    const firstStarts = timestampFromDate(new Date('2026-09-20T05:00:00.000Z'));
    const firstEnds = timestampFromDate(new Date('2026-09-20T07:00:00.000Z'));
    const lastStarts = timestampFromDate(new Date('2026-09-22T05:00:00.000Z'));
    const scheduleSummary = {
      courseDayCount: 3,
      startsAt: firstStarts,
      firstDayEndsAt: firstEnds,
      lastDayStartsAt: lastStarts,
      timeZone: 'Asia/Almaty' as const,
    };

    expect(formatAdminCourseScheduleSummaryDates(scheduleSummary)).toBe('20.09.2026 – 22.09.2026');

    const mapped = mapAdminCourseToTableCourse(
      listItem({
        scheduleSummary,
        catalogContent: {
          status: 'present',
          content: {
            courseId,
            revision: 1,
            duration: '3 days',
            description: 'Camp',
            dates: '1–3 Mar 2026',
            bgImageUrl: 'https://example.com/course.webp',
          },
        },
      })
    );
    expect(mapped.dates).toBe('20.09.2026 – 22.09.2026');
  });

  it('falls back to catalog dates only when scheduleSummary and courseDays are absent', () => {
    const mapped = mapAdminCourseToTableCourse(listItem());
    expect(mapped.dates).toBe('1 March 2026');
  });
});

describe('adminCourseTableMapping detail CourseDays dates (Подробнее)', () => {
  it('A. stale catalog + current CourseDays → detail uses CourseDays', () => {
    const courseDays = [day('2026-09-20', 1), day('2026-09-22', 2)];
    const detail = detailItem(courseDays, '01.09.2026 – 05.09.2026');

    expect(formatAdminCourseDaysScheduleDates(detail.courseDays)).toBe('20.09.2026 – 22.09.2026');
    expect(mapAdminCourseToTableCourse(detail).dates).toBe('20.09.2026 – 22.09.2026');
    expect(mapAdminCourseToTableCourse(detail).dates).not.toContain('01.09.2026');
  });

  it('B. one-day Course', () => {
    const courseDays = [day('2026-09-20', 1)];
    expect(formatAdminCourseDaysScheduleDates(courseDays)).toBe('20.09.2026');
    expect(mapAdminCourseToTableCourse(detailItem(courseDays)).dates).toBe('20.09.2026');
  });

  it('C. multi-day Course uses historical first–last range', () => {
    const courseDays = [day('2026-09-20', 1), day('2026-09-21', 2), day('2026-09-24', 3)];
    expect(formatAdminCourseDaysScheduleDates(courseDays)).toBe('20.09.2026 – 24.09.2026');
    expect(mapAdminCourseToTableCourse(detailItem(courseDays)).dates).toBe(
      '20.09.2026 – 24.09.2026'
    );
  });

  it('D. localDate exact roundtrip without UTC reinterpretation', () => {
    const courseDay = day('2026-09-20', 1, 5);
    expect(formatAdminCourseDayLocalDate(courseDay)).toBe('20.09.2026');
    // Same calendar day when formatted from Asia/Almaty wall time, not UTC date.
    expect(
      formatAdminCourseDayLocalDate({
        ...courseDay,
        interval: {
          startsAt: timestampFromDate(new Date('2026-09-19T20:00:00.000Z')),
          endsAt: timestampFromDate(new Date('2026-09-19T22:00:00.000Z')),
        },
      })
    ).toBe('20.09.2026');
  });

  it('E. list scheduleSummary and detail courseDays agree for one fixture', () => {
    const courseDays = [day('2026-09-20', 1), day('2026-09-22', 2)];
    const first = courseDays[0]!;
    const last = courseDays[1]!;
    const scheduleSummary = {
      courseDayCount: 2,
      startsAt: first.interval.startsAt,
      firstDayEndsAt: first.interval.endsAt,
      lastDayStartsAt: last.interval.startsAt,
      timeZone: first.timeZone,
    };

    const listDates = mapAdminCourseToTableCourse(listItem({ scheduleSummary })).dates;
    const detailDates = mapAdminCourseToTableCourse(detailItem(courseDays)).dates;

    expect(listDates).toBe('20.09.2026 – 22.09.2026');
    expect(detailDates).toBe(listDates);
    expect(formatAdminCourseDaysScheduleDates(courseDays)).toBe(listDates);
  });
});
