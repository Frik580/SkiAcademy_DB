import { describe, expect, it } from 'vitest';
import {
  InstructorIdSchema,
  CourseIdSchema,
} from '../identifiers';
import {
  QueryInstructorCourseAssignmentReadModelsInputSchema,
  compareInstructorCourseAssignmentSortKeys,
  decodeInstructorCourseAssignmentReadModelCursor,
  encodeInstructorCourseAssignmentReadModelCursor,
} from './instructorCourseAssignmentReadModel';

describe('InstructorCourseAssignmentReadModel cursor', () => {
  it('round-trips opaque discovery cursor', () => {
    const cursor = {
      instructorId: InstructorIdSchema.parse('instructor_cursor_test'),
      readScope: { dataScope: 'live' as const },
      roster: { exhausted: false, title: 'Alpha', documentId: CourseIdSchema.parse('course_a') },
      days: {
        exhausted: true,
        startsAtSeconds: 1,
        startsAtNanoseconds: 0,
        courseDayId: 'course_day_a' as never,
      },
      lastEmitted: { title: 'Alpha', courseId: CourseIdSchema.parse('course_a') },
    };
    expect(
      decodeInstructorCourseAssignmentReadModelCursor(
        encodeInstructorCourseAssignmentReadModelCursor(cursor)
      )
    ).toEqual(cursor);
    expect(decodeInstructorCourseAssignmentReadModelCursor('invalid')).toBeUndefined();
  });

  it('accepts pageSize and cursor on input', () => {
    expect(
      QueryInstructorCourseAssignmentReadModelsInputSchema.safeParse({
        scope: 'instructor_assigned',
        pageSize: 50,
        cursor: 'opaque',
      }).success
    ).toBe(true);
  });

  it('sorts by title then courseId', () => {
    expect(
      compareInstructorCourseAssignmentSortKeys(
        { title: 'Same', courseId: 'course_b' },
        { title: 'Same', courseId: 'course_a' }
      )
    ).toBeGreaterThan(0);
  });
});
