import { describe, expect, it } from 'vitest';
import { resolveSelfParticipantIdFromAccount } from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import {
  buildToggleTodayCompleteUpdate,
  buildPinSkillsTodayUpdate,
  getNewlyPinnedSkillTitles,
  resolveCompletedTodayTaskIds,
  toTodayDateStr,
} from '../../src/features/student-cabinet/todayChecklist';
import { UserProfile } from '../../src/types';

const baseProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  completedTodayTaskIds: ['skill:item-1', 'custom:ct_1'],
  completedTodayDate: '2020-01-01',
};

const selfId = resolveSelfParticipantIdFromAccount(baseProfile.uid)!;

describe('today checklist daily reset', () => {
  it('returns empty completed ids when date is stale', () => {
    expect(resolveCompletedTodayTaskIds(baseProfile)).toEqual([]);
  });

  it('returns completed ids for today', () => {
    const today = toTodayDateStr();
    expect(
      resolveCompletedTodayTaskIds({
        ...baseProfile,
        completedTodayDate: today,
      })
    ).toEqual(['skill:item-1', 'custom:ct_1']);
  });

  it('resets completed ids when toggling on a new day', () => {
    const today = toTodayDateStr();
    const update = buildToggleTodayCompleteUpdate(baseProfile, selfId, 'skill:item-2', true);
    const checklist = update.participantTodayChecklists?.[selfId];
    expect(checklist?.completedTodayDate).toBe(today);
    expect(checklist?.completedTodayTaskIds).toEqual(['skill:item-2']);
    expect(update.completedTodayTaskIds).toBeUndefined();
  });

  it('pins multiple skill items in one update', () => {
    const update = buildPinSkillsTodayUpdate(
      { ...baseProfile, todaySkillItemIds: ['l1_1'] },
      selfId,
      ['l1_2', 'l1_3', 'l1_1']
    );
    expect(update.participantTodayChecklists?.[selfId]?.todaySkillItemIds).toEqual([
      'l1_1',
      'l1_2',
      'l1_3',
    ]);
  });

  it('returns titles only for newly pinned skills', () => {
    const titles = getNewlyPinnedSkillTitles(
      { ...baseProfile, todaySkillItemIds: ['l1_1'] },
      selfId,
      ['l1_1', 'l1_2'],
      [
        { id: 'l1_1', title: 'Exercise A' },
        { id: 'l1_2', title: 'Exercise B' },
      ]
    );
    expect(titles).toEqual(['Exercise B']);
  });
});
