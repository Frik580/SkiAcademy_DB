import { describe, expect, it } from 'vitest';
import {
  InstructorOccupancyReadModelSchema,
  QueryInstructorOccupancyReadModelsInputSchema,
  QueryInstructorOccupancyReadModelsResultSchema,
} from '@ski-academy/shared-domain';

describe('instructor occupancy read model contracts', () => {
  it('accepts public instructor day scope input', () => {
    const parsed = QueryInstructorOccupancyReadModelsInputSchema.parse({
      scope: 'public_instructor_day',
      instructorId: 'instructor_public_day',
      localDate: '2026-01-15',
      timeZone: 'Asia/Almaty',
    });
    expect(parsed.scope).toBe('public_instructor_day');
  });

  it('accepts occupancy read model results', () => {
    const parsed = QueryInstructorOccupancyReadModelsResultSchema.parse({
      scope: 'public_instructor_day',
      item: InstructorOccupancyReadModelSchema.parse({
        instructorId: 'instructor_public_day',
        localDate: '2026-01-15',
        timeZone: 'Asia/Almaty',
        window: {
          startsAt: { seconds: 1_736_918_400, nanoseconds: 0 },
          endsAt: { seconds: 1_736_944_800, nanoseconds: 0 },
        },
        occupancy: [],
        truncated: false,
      }),
    });
    expect(parsed.item.occupancy).toEqual([]);
  });
});
