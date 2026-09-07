import { describe, expect, it } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import {
  MAX_MULTI_PARTICIPANT_SELECTION,
  requiresExplicitParticipantSelection,
  resolveAuthenticatedParticipantSelection,
  resolveDefaultParticipantSelection,
  resolveEffectiveParticipantId,
  resolveEffectiveParticipantIds,
  resolveSelectedParticipantCommand,
  shouldShowParticipantPicker,
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

  it('uses the sole participant id without an explicit picker selection', () => {
    expect(resolveEffectiveParticipantId([selfParticipant], undefined)).toBe('participant_self');
    expect(resolveEffectiveParticipantIds([selfParticipant], [])).toEqual(['participant_self']);
    expect(
      resolveSelectedParticipantCommand(
        [selfParticipant],
        resolveEffectiveParticipantIds([selfParticipant], [])
      )
    ).toMatchObject({
      participantIds: ['participant_self'],
      exercisedCapability: 'account_owner',
    });
  });

  it('keeps an empty effective selection when no participants are available', () => {
    expect(resolveEffectiveParticipantIds([], [])).toEqual([]);
    expect(resolveEffectiveParticipantIds([], ['participant_self'])).toEqual([]);
    expect(resolveEffectiveParticipantId([], 'participant_self')).toBeUndefined();
  });

  it('requires an explicit selection when two or more participants exist', () => {
    expect(resolveEffectiveParticipantIds([selfParticipant, dependentParticipant], [])).toEqual([]);
    expect(
      resolveEffectiveParticipantIds([selfParticipant, dependentParticipant], ['participant_child'])
    ).toEqual(['participant_child']);
  });

  it('drops a selected participant that is no longer in the current list', () => {
    expect(
      resolveEffectiveParticipantIds(
        [selfParticipant, dependentParticipant],
        ['participant_missing']
      )
    ).toEqual([]);
    expect(resolveEffectiveParticipantIds([selfParticipant], ['participant_missing'])).toEqual([
      'participant_self',
    ]);
  });

  it('shows the picker for 2+ participants or loading/error, not for 0 or 1', () => {
    expect(shouldShowParticipantPicker({ participants: [] })).toBe(false);
    expect(shouldShowParticipantPicker({ participants: [selfParticipant] })).toBe(false);
    expect(
      shouldShowParticipantPicker({ participants: [selfParticipant, dependentParticipant] })
    ).toBe(true);
    expect(shouldShowParticipantPicker({ participants: [], loading: true })).toBe(true);
    expect(shouldShowParticipantPicker({ participants: [], error: 'failed' })).toBe(true);
  });
});
