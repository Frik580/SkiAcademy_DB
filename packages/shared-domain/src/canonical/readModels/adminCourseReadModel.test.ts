import { describe, expect, it } from 'vitest';
import { QueryAdminCourseReadModelsInputSchema } from './adminCourseReadModel';

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
});
