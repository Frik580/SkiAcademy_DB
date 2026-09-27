import { describe, expect, it } from 'vitest';
import {
  InstructorIdSchema,
  CourseIdSchema,
  TestSessionIdSchema,
} from '../identifiers';
import {
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_CURSOR_MAX_LENGTH,
  QueryInstructorCourseAssignmentReadModelsInputSchema,
  compareInstructorCourseAssignmentSortKeys,
  decodeInstructorCourseAssignmentReadModelCursor,
  encodeInstructorCourseAssignmentReadModelCursor,
  instructorCourseAssignmentDayDocumentPath,
  parseInstructorCourseAssignmentDayDocumentPath,
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
        documentPath: instructorCourseAssignmentDayDocumentPath(
          CourseIdSchema.parse('course_a'),
          'course_day_a' as never
        ),
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

  it('rejects day cursors that are not a course day document path', () => {
    expect(parseInstructorCourseAssignmentDayDocumentPath('users/account_1')).toBeUndefined();
    expect(parseInstructorCourseAssignmentDayDocumentPath('payments/payment_1')).toBeUndefined();
    expect(
      parseInstructorCourseAssignmentDayDocumentPath('courses/course_a/days/course_day_a/extra')
    ).toBeUndefined();
    const rawCursor = Buffer.from(
      JSON.stringify({
        instructorId: 'instructor_cursor_test',
        readScope: { dataScope: 'live' },
        roster: { exhausted: false },
        days: {
          exhausted: false,
          startsAtSeconds: 1,
          startsAtNanoseconds: 0,
          documentPath: 'users/account_1',
        },
      }),
      'utf8'
    ).toString('base64url');
    expect(decodeInstructorCourseAssignmentReadModelCursor(rawCursor)).toBeUndefined();
    expect(decodeInstructorCourseAssignmentReadModelCursor(
      Buffer.from(
        JSON.stringify({
          instructorId: 'instructor_cursor_test',
          readScope: { dataScope: 'live' },
          roster: { exhausted: false },
          days: {
            exhausted: false,
            startsAtSeconds: 1,
            startsAtNanoseconds: 0,
            documentPath: 'payments/payment_1',
          },
        }),
        'utf8'
      ).toString('base64url')
    )).toBeUndefined();
  });

  it('encodes a maximum discovery cursor within the opaque cursor limit', () => {
    const id = 'a'.repeat(128);
    const sessionId = TestSessionIdSchema.parse(`test_${'a'.repeat(123)}`);
    const title = 't'.repeat(200);
    const courseId = CourseIdSchema.parse(id);
    const encoded = encodeInstructorCourseAssignmentReadModelCursor({
      instructorId: InstructorIdSchema.parse(id),
      readScope: { dataScope: 'test', testSessionId: sessionId },
      roster: { exhausted: false, title, documentId: courseId },
      days: {
        exhausted: false,
        startsAtSeconds: Number.MAX_SAFE_INTEGER,
        startsAtNanoseconds: 999_999_999,
        documentPath: instructorCourseAssignmentDayDocumentPath(courseId, id as never),
      },
      lastEmitted: { title, courseId },
    });
    expect(encoded.length).toBeGreaterThan(512);
    expect(encoded.length).toBeLessThanOrEqual(
      INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_CURSOR_MAX_LENGTH
    );
    expect(decodeInstructorCourseAssignmentReadModelCursor(encoded)?.days.documentPath).toBe(
      `courses/${id}/days/${id}`
    );
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
