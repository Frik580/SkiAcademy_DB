import { describe, expect, it } from 'vitest';
import {
  AdminPlannerInstructorPresentationSchema,
  AdminPlannerReadModelSchema,
  QueryAdminPlannerReadModelsInputSchema,
} from './adminPlannerReadModel';
import { timestampFromDate } from '../primitives';

describe('AdminPlannerReadModel schemas', () => {
  it('accepts transport-injected idempotencyKey for admin_planner', () => {
    expect(
      QueryAdminPlannerReadModelsInputSchema.safeParse({
        scope: 'admin_planner',
        localDate: '2026-09-01',
        view: 'day',
        timeZone: 'Asia/Almaty',
        idempotencyKey: 'read:admin_planner:admin_planner:day:2026-09-01',
      }).success
    ).toBe(true);
  });

  it('rejects instructor avatarUrl above presentation bound at instructors[n].avatarUrl', () => {
    const parsed = AdminPlannerReadModelSchema.safeParse({
      view: 'day',
      localDate: '2026-09-01',
      timeZone: 'Asia/Almaty',
      window: {
        startsAt: timestampFromDate(new Date('2026-09-01T00:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-09-02T00:00:00.000Z')),
      },
      instructors: [
        {
          instructorId: 'instructor_admin_planner_01',
          name: 'Legacy Avatar Coach',
          avatarUrl: `https://example.com/${'x'.repeat(2_001)}`,
          isAvailable: true,
        },
      ],
      occupancy: [],
      truncated: false,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]).toMatchObject({
      code: 'too_big',
      maximum: 2_000,
      path: ['instructors', 0, 'avatarUrl'],
    });
  });

  it('accepts instructor presentation without avatarUrl when avatarUrl exceeds bound', () => {
    const parsed = AdminPlannerInstructorPresentationSchema.safeParse({
      instructorId: 'instructor_admin_planner_01',
      name: 'Legacy Avatar Coach',
      isAvailable: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty('avatarUrl');
  });
});
