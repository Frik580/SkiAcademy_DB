import { describe, expect, it } from 'vitest';
import { AccountIdSchema, selfParticipantIdFromAccountId } from '@ski-academy/shared-domain';
import { removeMasteredTodaySkills } from './participantTodaySkills';

const accountId = AccountIdSchema.parse('account-today-skills');
const selfId = selfParticipantIdFromAccountId(accountId);
const config = {
  passPercentage: 80,
  items: [{ id: 'skill', levelTarget: 1 as const, maxPoints: 25 }],
};

describe('mastered Today pins', () => {
  it('moves the existing self compatibility checklist into its participant entry without losing history', () => {
    const profile = {
      todaySkillItemIds: ['skill', 'unknown'],
      completedTodayTaskIds: ['skill:skill'],
      completedTodayDate: '2026-01-01',
      customTodayTasks: [{ id: 'custom', text: 'Stretch' }],
      dismissedTodayTaskIds: ['rec'],
      participantTodayChecklists: { child: { todaySkillItemIds: ['skill'] } },
    };
    const before = structuredClone(profile);
    expect(removeMasteredTodaySkills(profile, accountId, selfId, { skill: 25 }, config)).toEqual({
      participantTodayChecklists: {
        child: profile.participantTodayChecklists.child,
        [selfId]: {
          todaySkillItemIds: ['unknown'],
          completedTodayTaskIds: profile.completedTodayTaskIds,
          completedTodayDate: profile.completedTodayDate,
          customTodayTasks: profile.customTodayTasks,
          dismissedTodayTaskIds: profile.dismissedTodayTaskIds,
        },
      },
    });
    expect(profile).toEqual(before);
    expect(
      removeMasteredTodaySkills(profile, accountId, 'absent-child', { skill: 25 }, config)
    ).toBeUndefined();
  });

  it('never restores flat self pins when an explicit empty entry exists', () => {
    expect(
      removeMasteredTodaySkills(
        {
          todaySkillItemIds: ['skill'],
          participantTodayChecklists: { [selfId]: { todaySkillItemIds: [] } },
        },
        accountId,
        selfId,
        { skill: 25 },
        config
      )
    ).toBeUndefined();
  });
});
