import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  getAchievementLabel,
  normalizeAchievementsConfig,
  pickAchievementTimestamp,
} from '../../src/domain/achievements';
import { findStreakWeeksTimestampFromPresentEvidence } from '../../src/domain/achievements';
import {
  BookingIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type ParticipantLessonStatsEvidence,
} from '@ski-academy/shared-domain';

describe('achievement config', () => {
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
    const participantId = ParticipantIdSchema.parse('participant_ach_config_streak');
    const evidence: ParticipantLessonStatsEvidence[] = [
      '2026-07-23',
      '2026-07-30',
      '2026-08-06',
    ].map((date, index) => ({
      bookingId: BookingIdSchema.parse(`booking_ach_config_streak_${index + 1}`),
      participantId,
      attendanceStatus: 'present',
      durationHours: 2,
      startsAt: timestampFromDate(new Date(`${date}T12:00:00.000Z`)),
      timeZone: 'Asia/Almaty',
      lifecycleStatus: 'completed',
      servicePartyParticipantIds: [participantId],
    }));
    const earnedAt = findStreakWeeksTimestampFromPresentEvidence(
      evidence,
      3,
      new Date('2026-08-13T12:00:00')
    );
    expect(earnedAt).toBe('2026-08-06T12:00:00.000Z');
    expect(earnedAt?.slice(0, 10)).not.toBe('2026-08-13');
  });

  it('prefers inferred earnedAt when activity log was backfilled later', () => {
    expect(pickAchievementTimestamp('2026-08-13T09:00:00.000Z', '2026-05-20T10:00:00.000Z')).toBe(
      '2026-05-20T10:00:00.000Z'
    );
  });
});
