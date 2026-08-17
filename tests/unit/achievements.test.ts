import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  evaluateEarnedAchievements,
  getAchievementLabel,
  isAchievementRuleMet,
  normalizeAchievementsConfig,
} from '../../src/domain/achievements/achievementConfig';
import { pickAchievementTimestamp } from '../../src/domain/achievements/achievements';
import { findStreakWeeksTimestamp } from '../../src/domain/achievements/trainingStreak';
import { ActivityLog, Booking, Course, Review, UserProfile } from '../../src/types';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements/skillData';
import {
  getTodayAchievements,
  isTimestampOnLocalDate,
} from '../../src/features/student-cabinet/components/student/studentCabinetUtils';

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

  it('infers streak achievement date from training weeks, not today', () => {
    const anchor = new Date('2026-08-13T12:00:00');
    const bookings = [
      completedBooking('b1', '2026-07-23'),
      completedBooking('b2', '2026-07-30'),
      completedBooking('b3', '2026-08-06'),
    ];

    const earnedAt = findStreakWeeksTimestamp(bookings, [], 3, anchor);
    expect(earnedAt).toBe('2026-08-06T12:00:00.000Z');
    expect(earnedAt?.slice(0, 10)).not.toBe('2026-08-13');
  });

  it('infers exercises mastered date from the log that reached the threshold', () => {
    const masteredIds = ['l1_1', 'l1_2', 'l1_3', 'l1_4', 'l1_5'];
    const activityLogs: ActivityLog[] = [
      {
        id: 'log-1',
        userId: 'user-1',
        actorId: 'coach-1',
        type: 'skill_scores_updated',
        timestamp: '2026-05-10T10:00:00.000Z',
        metadata: {
          skillDeltas: masteredIds.slice(0, 4).map((itemId) => ({
            itemId,
            delta: 20,
            newScore: 20,
            maxPoints: 20,
          })),
        },
      },
      {
        id: 'log-2',
        userId: 'user-1',
        actorId: 'coach-1',
        type: 'skill_scores_updated',
        timestamp: '2026-05-20T10:00:00.000Z',
        metadata: {
          skillDeltas: [
            {
              itemId: masteredIds[4],
              delta: 20,
              newScore: 20,
              maxPoints: 20,
            },
          ],
        },
      },
    ];

    const earned = evaluateEarnedAchievements({
      userProfile: { ...userProfile, skillScores: scoresForIds(masteredIds) },
      bookings: [],
      courses: [],
      reviews: [],
      skillConfig: DEFAULT_SKILL_CONFIG,
      activityLogs,
    });

    const fiveExercises = earned.find((item) => item.id === 'five_exercises');
    expect(fiveExercises?.earnedAt).toBe('2026-05-20T10:00:00.000Z');
  });

  it('prefers inferred earnedAt when activity log was backfilled later', () => {
    expect(pickAchievementTimestamp('2026-08-13T09:00:00.000Z', '2026-05-20T10:00:00.000Z')).toBe(
      '2026-05-20T10:00:00.000Z'
    );
  });

  it('shows only achievements earned on the local day in today section', () => {
    const masteredIds = ['l1_1', 'l1_2', 'l1_3', 'l1_4', 'l1_5'];
    const activityLogs: ActivityLog[] = [
      {
        id: 'ach-old',
        userId: 'user-1',
        actorId: 'user-1',
        type: 'achievement_earned',
        timestamp: '2026-08-13T09:00:00.000Z',
        metadata: { achievementId: 'five_exercises' },
      },
      {
        id: 'log-old',
        userId: 'user-1',
        actorId: 'coach-1',
        type: 'skill_scores_updated',
        timestamp: '2026-05-20T10:00:00.000Z',
        metadata: {
          skillDeltas: masteredIds.map((itemId) => ({
            itemId,
            delta: 20,
            newScore: 20,
            maxPoints: 20,
          })),
        },
      },
    ];

    const today = getTodayAchievements(
      { ...userProfile, skillScores: scoresForIds(masteredIds) },
      [],
      DEFAULT_SKILL_CONFIG,
      'ru',
      activityLogs,
      [],
      [],
      DEFAULT_ACHIEVEMENTS_CONFIG,
      new Date('2026-08-13T12:00:00')
    );

    expect(today.some((item) => item.id === 'five_exercises')).toBe(false);
    expect(
      isTimestampOnLocalDate('2026-05-20T10:00:00.000Z', new Date('2026-08-13T12:00:00'))
    ).toBe(false);
  });
});
