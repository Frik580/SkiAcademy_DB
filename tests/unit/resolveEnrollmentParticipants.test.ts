import { describe, expect, it } from 'vitest';
import {
  requiresExplicitParticipantSelection,
  resolveSelectedParticipantCommand,
} from '../../src/features/course-enrollments/resolveEnrollmentParticipants';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const participants: ManagedParticipantOption[] = [
  {
    participantId: 'participant_self',
    participantManagementId: 'management_self',
    displayName: 'Self',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 30 },
    authority: 'self',
    revision: 1,
  },
  {
    participantId: 'participant_child',
    participantManagementId: 'management_child',
    displayName: 'Child',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 8 },
    authority: 'parent_guardian',
    revision: 1,
  },
];

describe('course enrollment participant selection exports', () => {
  it('requires explicit selection when multiple managed participants exist', () => {
    expect(requiresExplicitParticipantSelection(participants)).toBe(true);
  });

  it('maps selected participant ids to enrollment command payload', () => {
    expect(resolveSelectedParticipantCommand(participants, ['participant_child'])).toEqual({
      participantIds: ['participant_child'],
      exercisedCapability: 'parent_guardian',
    });
  });
});
