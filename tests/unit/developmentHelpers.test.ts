import { describe, expect, it } from 'vitest';
import {
  getNextStepAction,
  getPrioritySkillItems,
  getSkillItemRingCategory,
  matchesSkillRingFilter,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { DEFAULT_SKILL_CONFIG } from '../../src/lib/skillData';
import { UserProfile } from '../../src/types';

const baseProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 1,
  skillScores: { l1_1: 0, l1_3: 3 },
  todaySkillItemIds: ['l1_3'],
};

describe('development helpers', () => {
  it('classifies skill items by dominant ring category', () => {
    const techniqueItem = DEFAULT_SKILL_CONFIG.items.find((i) => i.id === 'l1_9');
    const controlItem = DEFAULT_SKILL_CONFIG.items.find((i) => i.id === 'l1_1');
    expect(techniqueItem && getSkillItemRingCategory(techniqueItem)).toBe('technique');
    expect(controlItem && getSkillItemRingCategory(controlItem)).toBe('control');
  });

  it('filters items by ring category', () => {
    const item = DEFAULT_SKILL_CONFIG.items.find((i) => i.id === 'l1_9');
    expect(item && matchesSkillRingFilter(item, 'all')).toBe(true);
    expect(item && matchesSkillRingFilter(item, 'technique')).toBe(true);
    expect(item && matchesSkillRingFilter(item, 'control')).toBe(false);
  });

  it('returns incomplete exercises sorted by progress with pinned first', () => {
    const items = getPrioritySkillItems(baseProfile, DEFAULT_SKILL_CONFIG, 3);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].id).toBe('l1_3');
    expect(items[0].pinned).toBe(true);
    expect(items.every((item) => item.earned < item.maxPoints)).toBe(true);
  });

  it('localizes next-step exercise titles for English UI', () => {
    const action = getNextStepAction(baseProfile, [], DEFAULT_SKILL_CONFIG, 'en');
    expect(action?.kind).toBe('exercise');
    if (action?.kind === 'exercise') {
      // Pinned today items (l1_3) are skipped; next unpinned incomplete item is l1_1.
      expect(action.exerciseId).toBe('l1_1');
      expect(action.exerciseTitle).toBe('Maintain basic stance in motion for 100 m');
    }
  });
});
