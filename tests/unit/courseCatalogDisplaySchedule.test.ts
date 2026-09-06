import { describe, expect, it } from 'vitest';
import type { CourseCatalogReadModel } from '@ski-academy/shared-domain';
import { mapCourseCatalogReadModelToOperationalState } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import {
  formatCatalogLocalDateRange,
  formatCourseCatalogCardDate,
  resolveCourseCatalogDisplaySchedule,
} from '../../src/features/courses/courseCatalogDisplaySchedule';

const staleMarketingDates = '01.09.2026 – 05.09.2026, 09:00 - 13:00';

const catalogReadModel: CourseCatalogReadModel = {
  courseId: 'course_display_schedule_01',
  revision: 2,
  title: 'Freeride Camp',
  price: 250_000,
  capacity: {
    totalSeats: 8,
    availableSeats: 8,
    isCapacityFrozen: false,
    isEnrollmentEligible: true,
    isFull: false,
  },
  scheduleSummary: {
    startAt: { seconds: Math.floor(Date.parse('2026-09-20T05:00:00.000Z') / 1000), nanoseconds: 0 },
    finalCourseDayEndsAt: {
      seconds: Math.floor(Date.parse('2026-09-22T07:00:00.000Z') / 1000),
      nanoseconds: 0,
    },
    courseDayCount: 2,
  },
  courseSchedule: {
    courseId: 'course_display_schedule_01',
    courseScheduleRevision: 1,
    courseDayCount: 2,
    startAt: { seconds: Math.floor(Date.parse('2026-09-20T05:00:00.000Z') / 1000), nanoseconds: 0 },
    finalCourseDayEndsAt: {
      seconds: Math.floor(Date.parse('2026-09-22T07:00:00.000Z') / 1000),
      nanoseconds: 0,
    },
    courseDays: [
      {
        courseDayId: 'course_day_display_01',
        dayOrder: 1,
        interval: {
          startsAt: {
            seconds: Math.floor(Date.parse('2026-09-20T05:00:00.000Z') / 1000),
            nanoseconds: 0,
          },
          endsAt: {
            seconds: Math.floor(Date.parse('2026-09-20T07:00:00.000Z') / 1000),
            nanoseconds: 0,
          },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
      {
        courseDayId: 'course_day_display_02',
        dayOrder: 2,
        interval: {
          startsAt: {
            seconds: Math.floor(Date.parse('2026-09-22T05:00:00.000Z') / 1000),
            nanoseconds: 0,
          },
          endsAt: {
            seconds: Math.floor(Date.parse('2026-09-22T07:00:00.000Z') / 1000),
            nanoseconds: 0,
          },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
  },
  updatedAt: { seconds: 1_800_000_000, nanoseconds: 0 },
};

describe('formatCatalogLocalDateRange', () => {
  it('formats same-month RU/EN ranges and collapses one day', () => {
    expect(formatCatalogLocalDateRange('2026-12-02', '2026-12-06', 'ru')).toBe('2–6 декабря 2026');
    expect(formatCatalogLocalDateRange('2026-12-02', '2026-12-06', 'en')).toBe('2–6 December 2026');
    expect(formatCatalogLocalDateRange('2026-09-20', '2026-09-20', 'ru')).toBe('20 сентября 2026');
    expect(formatCatalogLocalDateRange('2026-09-20', '2026-09-20', 'en')).toBe('20 September 2026');
  });

  it('formats cross-month and cross-year ranges', () => {
    expect(formatCatalogLocalDateRange('2026-12-28', '2027-01-03', 'ru')).toBe(
      '28 декабря 2026 – 3 января 2027'
    );
    expect(formatCatalogLocalDateRange('2026-11-28', '2026-12-03', 'en')).toBe(
      '28 November – 3 December 2026'
    );
  });
});

describe('courseCatalogDisplaySchedule card vs Подробнее', () => {
  it('uses localized operational schedule for both card and details', () => {
    const operational = mapCourseCatalogReadModelToOperationalState(catalogReadModel);

    const card = resolveCourseCatalogDisplaySchedule({
      legacyDates: staleMarketingDates,
      language: 'ru',
      catalogOperational: operational,
    });
    const details = resolveCourseCatalogDisplaySchedule({
      legacyDates: staleMarketingDates,
      language: 'ru',
      catalogOperational: operational,
    });

    expect(card.datePart).toBe('20–22 сентября 2026');
    expect(details.datePart).toBe(card.datePart);
    expect(formatCourseCatalogCardDate(card.datePart)).toBe(card.datePart);
    expect(card.datePart).not.toContain('01.09.2026');
    expect(card.datePart).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('falls back to marketing dates only when operational schedule is absent', () => {
    const legacy = resolveCourseCatalogDisplaySchedule({
      legacyDates: staleMarketingDates,
      language: 'ru',
    });
    expect(legacy.datePart).toContain('01.09.2026');
    expect(legacy.timePart).toContain('09:00');
  });

  it('derives details time from first CourseDay, not stale marketing times', () => {
    const operational = mapCourseCatalogReadModelToOperationalState(catalogReadModel);
    const details = resolveCourseCatalogDisplaySchedule({
      legacyDates: staleMarketingDates,
      language: 'en',
      catalogOperational: operational,
    });
    expect(details.datePart).toBe('20–22 September 2026');
    expect(details.timePart).toBe('10:00 - 12:00');
    expect(details.timePart).not.toContain('09:00');
  });
});
