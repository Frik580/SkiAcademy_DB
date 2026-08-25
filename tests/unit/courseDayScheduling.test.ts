import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  courseDayOccurrenceIdFromRevision,
  initialCourseDayOccurrenceId,
  resolveNextCourseDayOrder,
  assertStrictlyIncreasingCourseDayStarts,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { CourseDaySchema } from '@ski-academy/shared-domain';
import { canonicalPrimitiveFixtures } from '@ski-academy/shared-domain/testing';

const courseDayId = CourseDayIdSchema.parse('course_day_test_01');
const instructorId = canonicalPrimitiveFixtures.instructorId;
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

describe('course day scheduling identity', () => {
  it('derives deterministic occurrence ids per revision', () => {
    const initial = initialCourseDayOccurrenceId(courseDayId);
    const rotated = courseDayOccurrenceIdFromRevision(courseDayId, 2);
    expect(initial).not.toEqual(rotated);
    expect(initialCourseDayOccurrenceId(courseDayId)).toEqual(initial);
  });
});

describe('course day ordering', () => {
  it('assigns next day order from existing days', () => {
    const existing = [
      CourseDaySchema.parse({
        courseId: canonicalPrimitiveFixtures.courseId,
        courseDayId: CourseDayIdSchema.parse('course_day_test_02'),
        dayOrder: 1,
        interval: {
          startsAt: timestampFromDate(new Date('2026-02-01T04:00:00.000Z')),
          endsAt: timestampFromDate(new Date('2026-02-01T08:00:00.000Z')),
        },
        timeZone: canonicalPrimitiveFixtures.timeZone,
        actualInstructorIds: [instructorId],
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit: {
          createdByCommandId: 'command_test',
          lastChangedByCommandId: 'command_test',
          correlationId: 'correlation_test',
        },
      }),
    ];
    expect(resolveNextCourseDayOrder(existing)).toBe(2);
    expect(resolveNextCourseDayOrder([])).toBe(1);
  });

  it('rejects non-increasing startsAt', () => {
    const existing = [
      CourseDaySchema.parse({
        courseId: canonicalPrimitiveFixtures.courseId,
        courseDayId: CourseDayIdSchema.parse('course_day_test_03'),
        dayOrder: 1,
        interval: {
          startsAt: timestampFromDate(new Date('2026-02-02T04:00:00.000Z')),
          endsAt: timestampFromDate(new Date('2026-02-02T08:00:00.000Z')),
        },
        timeZone: canonicalPrimitiveFixtures.timeZone,
        actualInstructorIds: [instructorId],
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit: {
          createdByCommandId: 'command_test',
          lastChangedByCommandId: 'command_test',
          correlationId: 'correlation_test',
        },
      }),
    ];
    expect(() =>
      assertStrictlyIncreasingCourseDayStarts(existing, {
        startsAt: timestampFromDate(new Date('2026-02-01T04:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-02-01T08:00:00.000Z')),
      })
    ).toThrow();
  });
});
