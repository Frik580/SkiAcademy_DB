import { describe, expect, it } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import {
  MAX_MULTI_PARTICIPANT_SELECTION,
  requiresExplicitParticipantSelection,
  resolveAuthenticatedParticipantSelection,
  resolveDefaultParticipantSelection,
  resolveSelectedParticipantCommand,
  toggleParticipantSelection,
} from '../../src/features/participants/participantSelectionState';

const selfParticipant: ManagedParticipantOption = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Self',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 30 },
  authority: 'self',
  revision: 1,
};

const dependentParticipant: ManagedParticipantOption = {
  participantId: 'participant_child',
  participantManagementId: 'management_child',
  displayName: 'Child',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 8 },
  authority: 'parent_guardian',
  revision: 1,
};

describe('participantSelectionState', () => {
  it('preselects only the sole managed participant', () => {
    expect(resolveDefaultParticipantSelection([selfParticipant])).toEqual(['participant_self']);
    expect(resolveDefaultParticipantSelection([selfParticipant, dependentParticipant])).toEqual([]);
  });

  it('does not auto-select when multiple participants are available', () => {
    expect(
      resolveAuthenticatedParticipantSelection([], ['participant_self', 'participant_child'])
    ).toEqual([]);
  });

  it('requires explicit selection when more than one participant exists', () => {
    expect(requiresExplicitParticipantSelection([selfParticipant])).toBe(false);
    expect(requiresExplicitParticipantSelection([selfParticipant, dependentParticipant])).toBe(
      true
    );
  });

  it('prevents duplicate and out-of-authority selection', () => {
    expect(
      toggleParticipantSelection(['participant_self'], 'participant_self', [
        'participant_self',
        'participant_child',
      ])
    ).toEqual([]);
    expect(toggleParticipantSelection([], 'participant_unknown', ['participant_self'])).toEqual([]);
  });

  it('enforces the multi-participant limit', () => {
    const managedIds = Array.from(
      { length: MAX_MULTI_PARTICIPANT_SELECTION + 1 },
      (_, index) => `participant_${index}`
    );
    const selected = managedIds.slice(0, MAX_MULTI_PARTICIPANT_SELECTION);
    expect(
      toggleParticipantSelection(selected, managedIds[MAX_MULTI_PARTICIPANT_SELECTION]!, managedIds)
    ).toEqual(selected);
  });

  it('derives exercised capability from selected authorities', () => {
    expect(
      resolveSelectedParticipantCommand([selfParticipant], ['participant_self'])
    ).toMatchObject({
      participantIds: ['participant_self'],
      exercisedCapability: 'account_owner',
    });
    expect(
      resolveSelectedParticipantCommand(
        [selfParticipant, dependentParticipant],
        ['participant_child']
      )
    ).toMatchObject({
      participantIds: ['participant_child'],
      exercisedCapability: 'parent_guardian',
    });
  });
});
