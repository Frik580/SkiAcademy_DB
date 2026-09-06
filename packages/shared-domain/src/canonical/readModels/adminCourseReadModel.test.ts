import { describe, expect, it } from 'vitest';
import {
  QueryAdminCourseReadModelsInputSchema,
  decodeAdminCourseReadModelCursor,
  encodeAdminCourseReadModelCursor,
} from './adminCourseReadModel';

describe('QueryAdminCourseReadModelsInputSchema', () => {
  it('accepts transport-injected idempotencyKey for admin_course_list', () => {
    expect(
      QueryAdminCourseReadModelsInputSchema.safeParse({
        scope: 'admin_course_list',
        pageSize: 50,
        idempotencyKey: 'read:admin_course:admin_course_list:list',
      }).success
    ).toBe(true);
  });

  it('accepts transport-injected idempotencyKey for admin_course_detail', () => {
    expect(
      QueryAdminCourseReadModelsInputSchema.safeParse({
        scope: 'admin_course_detail',
        courseId: 'course_admin_read_01',
        idempotencyKey: 'read:admin_course:admin_course_detail:course_admin_read_01',
      }).success
    ).toBe(true);
  });

  it('keeps lifecycle scope and cursor v2-only', () => {
    expect(
      QueryAdminCourseReadModelsInputSchema.safeParse({
        scope: 'admin_course_list',
        readModelVersion: 2,
        lifecycle: 'archived',
        cursor: 'opaque-cursor',
      }).success
    ).toBe(true);
    expect(
      QueryAdminCourseReadModelsInputSchema.safeParse({
        scope: 'admin_course_list',
        lifecycle: 'archived',
      }).success
    ).toBe(false);
  });

  it('round-trips and validates the opaque lifecycle cursor', () => {
    const cursor = {
      lifecycle: 'archived' as const,
      title: 'Archived Course',
      documentId: 'course_admin_archived_01',
    };
    expect(decodeAdminCourseReadModelCursor(encodeAdminCourseReadModelCursor(cursor))).toEqual(
      cursor
    );
    expect(decodeAdminCourseReadModelCursor('not-a-cursor')).toBeUndefined();
  });
});
