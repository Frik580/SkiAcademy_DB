import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../src/types';
import {
  applyParticipantProgressToProfile,
  emptyParticipantProgressView,
  overlaySelfParticipantProgress,
  selectCabinetProgressView,
} from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import {
  requiresExplicitParticipantSelection,
  resolveDefaultParticipantSelection,
  resolveEffectiveParticipantId,
} from '../../src/features/participants/participantSelectionState';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const profile = {
  uid: 'account_progress_ui_01',
  email: 'self@example.com',
  displayName: 'Self',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  isClientActive: true,
  level: 4,
  skillScores: { carving: 99 },
  skillComments: { carving: 'Account leftover' },
} as UserProfile;

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

const childParticipant: ManagedParticipantOption = {
  participantId: 'participant_child',
  participantManagementId: 'management_child',
  displayName: 'Child',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 8 },
  authority: 'parent_guardian',
  revision: 1,
};

describe('participant progress overlay and cabinet selection', () => {
  it('strips account-level progress when no selected Participant is ready', () => {
    const stripped = applyParticipantProgressToProfile(profile, undefined);
    expect(stripped.level).toBeUndefined();
    expect(stripped.skillScores).toBeUndefined();
    expect(stripped.skillComments).toBeUndefined();
    expect(stripped.displayName).toBe('Self');
  });

  it('overlays only the selected Participant progress', () => {
    const child = applyParticipantProgressToProfile(
      profile,
      emptyParticipantProgressView('participant_child')
    );
    const self = applyParticipantProgressToProfile(profile, {
      participantId: 'participant_self',
      level: 3,
      skillScores: { carving: 10 },
      skillComments: { carving: 'Self note' },
      revision: 2,
    });
    expect(child.level).toBe(1);
    expect(child.skillScores).toEqual({});
    expect(self.level).toBe(3);
    expect(self.skillScores).toEqual({ carving: 10 });
    expect(self.skillScores).not.toEqual(child.skillScores);
  });

  it('keeps sole-participant auto-selection and refuses first-participant fallback for 2+', () => {
    expect(resolveDefaultParticipantSelection([selfParticipant])).toEqual(['participant_self']);
    expect(resolveEffectiveParticipantId([selfParticipant], undefined)).toBe('participant_self');
    expect(requiresExplicitParticipantSelection([selfParticipant])).toBe(false);

    const family = [selfParticipant, childParticipant];
    expect(resolveDefaultParticipantSelection(family)).toEqual([]);
    expect(resolveEffectiveParticipantId(family, undefined)).toBeUndefined();
    expect(resolveEffectiveParticipantId(family, 'participant_self')).toBe('participant_self');
    expect(requiresExplicitParticipantSelection(family)).toBe(true);
  });

  it('does not treat leftover /users progress as navbar authority without self overlay', () => {
    const leftover = {
      ...profile,
      level: 3,
      skillScores: { carving: 99 },
      skillComments: { carving: 'Account leftover' },
    } as UserProfile;
    const overlaid = overlaySelfParticipantProgress(leftover, {});
    expect(overlaid.level).toBe(1);
    expect(overlaid.skillScores).toEqual({});
    expect(overlaid.skillComments).toEqual({});
    expect(overlaid.skillScores).not.toEqual({ carving: 99 });
  });

  it('treats missing canonical progress as level 1 empty start for self and child independently', () => {
    const leftover = {
      ...profile,
      level: 3,
      skillScores: { carving: 99 },
      skillComments: { carving: 'Account leftover' },
    } as UserProfile;
    const self = applyParticipantProgressToProfile(
      leftover,
      emptyParticipantProgressView('participant_self')
    );
    const child = applyParticipantProgressToProfile(
      leftover,
      emptyParticipantProgressView('participant_child')
    );
    expect(self.level).toBe(1);
    expect(child.level).toBe(1);
    expect(self.skillScores).toEqual({});
    expect(child.skillScores).toEqual({});
    expect(self.skillComments).toEqual({});
    expect(child.skillComments).toEqual({});
    expect(self.skillScores).not.toBe(child.skillScores);
  });

  it('selectCabinetProgressView never returns a different participantId than requested', () => {
    const child = selectCabinetProgressView(
      {
        participant_self: {
          participantId: 'participant_self',
          level: 3,
          skillScores: { carving: 10 },
          skillComments: { carving: 'Self' },
          revision: 2,
        },
      },
      'participant_child'
    );
    expect(child).toEqual(emptyParticipantProgressView('participant_child'));
    expect(child?.level).not.toBe(3);
  });
});
