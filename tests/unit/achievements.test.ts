import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  evaluateEarnedAchievements,
  getAchievementLabel,
  isAchievementRuleMet,
  normalizeAchievementsConfig,
} from '../../src/lib/achievementConfig';
import { ActivityLog, Booking, Course, Review, UserProfile } from '../../src/types';
import { DEFAULT_SKILL_CONFIG } from '../../src/lib/skillData';

const userProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 1,
};

const completedBooking = (id: string, date: string, hours = 2): Booking => ({
  id,
  userId: 'user-1',
  instructorId: 'ins-1',
  instructorName: 'Coach',
  date,
  time: '10:00',
  durationHours: hours,
  difficulty: 'beginner',
  status: 'completed',
  price: 100,
});

const scoresForIds = (ids: string[]) =>
  Object.fromEntries(
    ids
      .map((id) => DEFAULT_SKILL_CONFIG.items.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => [item!.id, item!.maxPoints])
  );

describe('achievement config', () => {
  it('awards first lesson after one completed booking', () => {
    const earned = evaluateEarnedAchievements({
      userProfile,
      bookings: [completedBooking('b1', '2026-01-10')],
      courses: [],
      reviews: [],
      skillConfig: DEFAULT_SKILL_CONFIG,
      activityLogs: [],
    });

    expect(earned.some((item) => item.id === 'first_lesson')).toBe(true);
  });

  it('awards milestone exercises from default config', () => {
    const earned = evaluateEarnedAchievements(
      {
        userProfile: { ...userProfile, skillScores: scoresForIds(['l1_13', 'l1_15']) },
        bookings: [],
        courses: [],
        reviews: [],
        skillConfig: DEFAULT_SKILL_CONFIG,
        activityLogs: [],
      },
      DEFAULT_ACHIEVEMENTS_CONFIG
    );

    expect(earned.some((item) => item.id === 'milestone_big_radius_linked')).toBe(true);
    expect(earned.some((item) => item.id === 'milestone_snowflake')).toBe(true);
  });

  it('requires all turn exercises for turn master', () => {
    const partialCtx = {
      userProfile: { ...userProfile, skillScores: scoresForIds(['l3_16', 'l3_17']) },
      bookings: [] as Booking[],
      courses: [] as Course[],
      reviews: [] as Review[],
      skillConfig: DEFAULT_SKILL_CONFIG,
      activityLogs: [] as ActivityLog[],
    };

    const turnMaster = DEFAULT_ACHIEVEMENTS_CONFIG.items.find(
      (item) => item.id === 'milestone_turn_master'
    )!;
    expect(isAchievementRuleMet(turnMaster, partialCtx)).toBe(false);

    partialCtx.userProfile.skillScores = scoresForIds([
      'l3_16',
      'l3_17',
      'l3_18',
      'l3_19',
      'l3_20',
      'l3_21',
    ]);
    expect(isAchievementRuleMet(turnMaster, partialCtx)).toBe(true);
  });

  it('uses labels from config', () => {
    expect(getAchievementLabel('milestone_zip_line', 'ru', DEFAULT_ACHIEVEMENTS_CONFIG)).toBe(
      'Зип лайн'
    );
  });

  it('normalizes custom config from admin', () => {
    const normalized = normalizeAchievementsConfig({
      items: [
        {
          id: 'custom_1',
          labelRu: 'Тест',
          labelEn: 'Test',
          icon: '🏆',
          order: 1,
          rule: { type: 'lessons_completed', count: 3 },
        },
      ],
    });
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]?.id).toBe('custom_1');
  });

  it('strips undefined fields from rules for Firestore', () => {
    const normalized = normalizeAchievementsConfig({
      items: [
        {
          id: 'level_up',
          labelRu: 'Уровень',
          labelEn: 'Level',
          icon: '⬆️',
          order: 1,
          rule: { type: 'level_up', count: undefined, skillItemIds: undefined },
        },
      ],
    });
    expect(normalized.items[0]?.rule).toEqual({ type: 'level_up' });
    expect(JSON.stringify(normalized)).not.toContain('undefined');
  });
});
