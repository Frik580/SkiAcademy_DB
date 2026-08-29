import { describe, expect, it } from 'vitest';
import {
  resolveCourseDocument,
  isLegacyCourseDocument,
} from '../../src/features/courses/courseDisplay';

describe('courseDisplay', () => {
  it('keeps legacy course documents readable', () => {
    const legacy = {
      title: 'Legacy',
      duration: '2 days',
      description: 'Legacy description',
      dates: '1 March',
      totalSeats: 8,
      availableSeats: 8,
      price: 100,
      bgImageUrl: 'https://example.com/legacy.webp',
    };
    expect(isLegacyCourseDocument(legacy)).toBe(true);
    const course = resolveCourseDocument('course_legacy_01', legacy);
    expect(course?.title).toBe('Legacy');
  });

  it('merges canonical aggregate with catalog content for display', () => {
    const course = resolveCourseDocument(
      'course_canonical_01',
      {
        courseId: 'course_canonical_01',
        title: 'Canonical Title',
        price: 50_000,
        capacity: { totalSeats: 8, availableSeats: 8 },
        instructorRosterIds: ['instructor_01'],
        startAt: { seconds: 1, nanoseconds: 0 },
        scheduleProjection: {
          courseDayCount: 1,
          finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
          courseScheduleRevision: 1,
        },
        revision: 1,
        createdAt: { seconds: 1, nanoseconds: 0 },
        updatedAt: { seconds: 1, nanoseconds: 0 },
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId: 'correlation_seed',
        },
      },
      {
        duration: '1 day',
        description: 'Presentation description',
        dates: '1 March',
        bgImageUrl: 'https://example.com/canonical.webp',
      }
    );
    expect(course?.title).toBe('Canonical Title');
    expect(course?.description).toBe('Presentation description');
    expect(course?.priceKZT).toBe(50_000);
  });
});
