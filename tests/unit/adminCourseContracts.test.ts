import { describe, expect, it } from 'vitest';
import {
  COMMAND_KINDS,
  CourseSchema,
  catalogExcludesGenericMutationCommands,
  parseCommandIntent,
  timestampFromDate,
} from '@ski-academy/shared-domain';

describe('T32.5 canonical Course contracts', () => {
  it('keeps Course strict while defaulting legacy canonical records to active lifecycle', () => {
    const time = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const base = {
      courseId: 'course_contract_01',
      title: 'Course',
      price: 1,
      capacity: { totalSeats: 1, availableSeats: 1 },
      instructorRosterIds: ['instructor_contract_01'],
      startAt: time,
      scheduleProjection: { courseDayCount: 1, finalCourseDayEndsAt: time, courseScheduleRevision: 1 },
      revision: 1,
      createdAt: time,
      updatedAt: time,
      audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId: 'correlation_seed' },
    };
    expect(CourseSchema.parse(base).lifecycle).toBe('active');
    expect(CourseSchema.safeParse({ ...base, description: 'presentation leak' }).success).toBe(false);
  });

  it('catalogs only intent-specific Course commands', () => {
    expect(catalogExcludesGenericMutationCommands()).toBe(true);
    expect(COMMAND_KINDS).not.toContain('update_course');
    expect(parseCommandIntent('change_course_capacity', {
      courseId: 'course_contract_01',
      totalSeats: 12,
      reasonExplanation: 'Capacity amendment',
    }).success).toBe(true);
  });
});
