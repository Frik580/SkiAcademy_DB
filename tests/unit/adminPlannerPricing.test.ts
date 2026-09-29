import { describe, expect, it } from 'vitest';
import type { AdminPlannerReadModel } from '@ski-academy/shared-domain';
import { mapPlannerInstructors } from '../../src/features/admin/operations/adminPlannerMapping';

describe('admin planner pricing', () => {
  it('maps the canonical planner KZT rate to its schedule instructor', () => {
    const model = {
      instructors: [
        {
          instructorId: 'instructor_planner_kzt',
          name: 'Planner Coach',
          pricePerHourKZT: 30_000,
          isAvailable: true,
        },
      ],
    } as unknown as AdminPlannerReadModel;

    expect(mapPlannerInstructors(model)[0]).toMatchObject({
      pricePerHour: 30_000,
      pricePerHourKZT: 30_000,
    });
  });

  it('leaves missing KZT rates unavailable instead of inventing a rate', () => {
    const model = {
      instructors: [
        {
          instructorId: 'instructor_planner_missing_rate',
          name: 'Unpriced Coach',
          isAvailable: true,
        },
      ],
    } as unknown as AdminPlannerReadModel;

    expect(mapPlannerInstructors(model)[0]).toMatchObject({
      pricePerHour: 0,
      pricePerHourKZT: undefined,
    });
  });
});
