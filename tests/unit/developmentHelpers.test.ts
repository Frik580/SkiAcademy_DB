import { describe, expect, it } from 'vitest';
import {
  getNextStepAction,
  getPrioritySkillItems,
  getSkillItemRingCategory,
  matchesSkillRingFilter,
  getLevelProgressPercent,
} from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import { DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../../src/domain/achievements';
import { buildRadarDimensions } from '../../src/features/student-cabinet/components/student/studentSkillRadarData';
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
  it('preserves priority order, automatic next step, XP totals, level progress and radar math', () => {
    const config = {
      ...DEFAULT_SKILL_CONFIG,
      items: ['missing', 'zero', 'positive', 'full'].map((id) => ({
        ...DEFAULT_SKILL_CONFIG.items[0],
        id,
        title: id,
        titleEn: id,
        maxPoints: 3,
        levelTarget: 1,
      })),
    };
    const profile = {
      ...baseProfile,
      skillScores: { zero: 0, positive: 1, full: 3 },
      todaySkillItemIds: ['positive'],
    };
    const original = structuredClone(profile);
    const priority = getPrioritySkillItems(profile, config);
    expect(priority.map((item) => item.id)).toEqual(['positive', 'missing', 'zero']);
    expect(priority.map((item) => item.hasScore)).toEqual([true, false, true]);
    expect(getNextStepAction(profile, undefined, config, 'en')).toEqual({
      kind: 'exercise',
      exerciseId: 'missing',
      exerciseTitle: 'missing',
      pointsGain: 3,
      levelProgressDelta: 30,
      targetLevel: 2,
      pinned: false,
    });
    expect(getLevelProgressPercent(profile, config)).toMatchObject({ percent: 40, remaining: 6 });
    expect(calculateSkillProgress(profile.skillScores, config.items, 1, 80)).toMatchObject({
      targetEarnedPoints: 4,
      targetMaxPoints: 12,
      targetRequiredPoints: 10,
      remainingPointsNeeded: 6,
      overall: { earned: 4, max: 12, percentage: 33 },
    });
    const dimensions = buildRadarDimensions({
      items: config.items,
      scores: profile.skillScores,
      targetStage: 1,
      pinnedIds: new Set(),
    });
    const dimension = dimensions.find((entry) => entry.exercises.length > 0)!;
    expect(dimension).toMatchObject({ earned: 4, max: 12, percent: 33 });
    expect(dimension.exercises.map((item) => [item.earned, item.hasScore])).toEqual([
      [0, false],
      [0, true],
      [1, true],
      [3, true],
    ]);
    const allExplicit = { ...profile, skillScores: { ...profile.skillScores, missing: 0 } };
    expect(getNextStepAction(allExplicit, undefined, config, 'en')).toEqual(
      getNextStepAction(profile, undefined, config, 'en')
    );
    expect(getLevelProgressPercent(allExplicit, config)).toEqual(
      getLevelProgressPercent(profile, config)
    );
    expect(profile).toEqual(original);
  });

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
    const action = getNextStepAction(baseProfile, undefined, DEFAULT_SKILL_CONFIG, 'en');
    expect(action?.kind).toBe('exercise');
    if (action?.kind === 'exercise') {
      // Pinned today items (l1_3) are skipped; next unpinned incomplete item is l1_1.
      expect(action.exerciseId).toBe('l1_1');
      expect(action.exerciseTitle).toBe('Maintain basic stance in motion for 100 m');
    }
  });
});
