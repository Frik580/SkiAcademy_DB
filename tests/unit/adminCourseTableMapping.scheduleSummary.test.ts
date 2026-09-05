import { describe, expect, it } from 'vitest';
import {
  AggregateRevisionSchema,
  CourseIdSchema,
  timestampFromDate,
  type AdminCourseListItem,
} from '@ski-academy/shared-domain';
import {
  formatAdminCourseScheduleSummaryDates,
  mapAdminCourseToTableCourse,
} from '../../src/features/admin/components/courses/adminCourseTableMapping';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function listItem(overrides: Partial<AdminCourseListItem> = {}): AdminCourseListItem {
  return {
    courseId: CourseIdSchema.parse('course_list_date_01'),
    title: 'Freeride Camp',
    lifecycle: 'active',
    price: 120_000,
    capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
    revision: AggregateRevisionSchema.parse(1),
    scheduleRevision: AggregateRevisionSchema.parse(1),
    instructorRosterIds: ['instructor_list_date_01'],
    instructors: [{ instructorId: 'instructor_list_date_01', name: 'Coach' }],
    catalogContent: {
      status: 'present',
      content: {
        courseId: CourseIdSchema.parse('course_list_date_01'),
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
            courseId: CourseIdSchema.parse('course_list_date_01'),
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

  it('falls back to catalog dates only when scheduleSummary is absent', () => {
    const mapped = mapAdminCourseToTableCourse(listItem());
    expect(mapped.dates).toBe('1 March 2026');
  });
});
