import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  getAchievementLabel,
  normalizeAchievementsConfig,
  pickAchievementTimestamp,
  getTrainingStreakWeeksFromPresentEvidence,
  toIsoWeekKey,
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
      new Date('2026-08-13T12:00:00Z'),
      'Asia/Almaty'
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

describe('timezone independent training weeks', () => {
  const anchor = new Date('2026-11-23T03:30:00Z');
  const participantId = ParticipantIdSchema.parse('participant_week_contract');
  function rows(instants: string[], timeZone = 'Asia/Almaty'): ParticipantLessonStatsEvidence[] {
    return instants.map((instant, index) => ({
      bookingId: BookingIdSchema.parse(`booking_week_${index}`),
      participantId,
      startsAt: timestampFromDate(new Date(instant)),
      timeZone,
      durationHours: 1,
      attendanceStatus: 'present',
      lifecycleStatus: 'completed',
      servicePartyParticipantIds: [participantId],
    }));
  }
  const history = rows(['2026-11-09T03:00:00Z', '2026-11-16T03:00:00Z', '2026-11-23T03:00:00Z']);
  it.each([
    ['2026-01-01', '2026-W01'],
    ['2027-01-01', '2026-W53'],
    ['2024-12-30', '2025-W01'],
    ['2026-12-28', '2026-W53'],
    ['2026-12-31', '2026-W53'],
    ['2027-01-04', '2027-W01'],
  ])('ISO calendar %s gives %s', (date, key) => expect(toIsoWeekKey(date)).toBe(key));
  it.each(['2026-02-29', '2026-13-01', '2026-04-31', 'invalid', '2026-01-01T12:00:00'])(
    'rejects invalid calendar input %s',
    (date) => {
      expect(toIsoWeekKey(date)).toBeNull();
    }
  );
  it('Almaty Monday has three weeks and the latest week evidence timestamp', () => {
    expect(toIsoWeekKey(anchor, 'Asia/Almaty')).toBe('2026-W48');
    expect(toIsoWeekKey(anchor, 'America/New_York')).toBe('2026-W47');
    expect(getTrainingStreakWeeksFromPresentEvidence(history, anchor, 'Asia/Almaty')).toBe(3);
    expect(findStreakWeeksTimestampFromPresentEvidence(history, 3, anchor, 'Asia/Almaty')).toBe(
      '2026-11-23T03:00:00.000Z'
    );
  });
  it.each([
    ['2026-11-22T18:59:59Z', '2026-W47'],
    ['2026-11-22T19:00:00Z', '2026-W48'],
    ['2026-11-22T19:00:01Z', '2026-W48'],
  ])('school midnight %s', (instant, key) => {
    const now = new Date(instant);
    expect(toIsoWeekKey(now, 'Asia/Almaty')).toBe(key);
    expect(getTrainingStreakWeeksFromPresentEvidence(history, now, 'Asia/Almaty')).toBe(2);
    expect(
      findStreakWeeksTimestampFromPresentEvidence(history, 3, now, 'Asia/Almaty')
    ).toBeUndefined();
  });
  it('excludes future present evidence even within the current week', () => {
    const evidence = [...history.slice(0, 2), ...rows(['2026-11-23T03:30:01Z'])];
    expect(getTrainingStreakWeeksFromPresentEvidence(evidence, anchor, 'Asia/Almaty')).toBe(2);
    expect(
      findStreakWeeksTimestampFromPresentEvidence(evidence, 3, anchor, 'Asia/Almaty')
    ).toBeUndefined();
  });
  it('keeps historical lesson timezone distinct from school timezone', () => {
    const evidence = rows(
      ['2026-11-09T02:00:00Z', '2026-11-16T02:00:00Z', '2026-11-23T02:00:00Z'],
      'America/New_York'
    );
    expect(getTrainingStreakWeeksFromPresentEvidence(evidence, anchor, 'Asia/Almaty')).toBe(3);
    expect(findStreakWeeksTimestampFromPresentEvidence(evidence, 3, anchor, 'Asia/Almaty')).toBe(
      '2026-11-23T02:00:00.000Z'
    );
  });
  it.each([
    [
      'Europe/Paris',
      '2026-03-30T00:00:00Z',
      ['2026-03-09T12:00:00Z', '2026-03-16T12:00:00Z', '2026-03-29T12:00:00Z'],
    ],
    [
      'Europe/Paris',
      '2026-10-26T01:00:00Z',
      ['2026-10-05T12:00:00Z', '2026-10-12T12:00:00Z', '2026-10-25T12:00:00Z'],
    ],
    [
      'America/New_York',
      '2026-03-09T04:00:00Z',
      ['2026-02-16T12:00:00Z', '2026-02-23T12:00:00Z', '2026-03-08T12:00:00Z'],
    ],
    [
      'America/New_York',
      '2026-11-02T05:00:00Z',
      ['2026-10-12T12:00:00Z', '2026-10-19T12:00:00Z', '2026-11-01T12:00:00Z'],
    ],
  ])('calendar weeks across DST in %s at %s', (zone, instant, dates) => {
    const evidence = rows(dates, zone);
    expect(getTrainingStreakWeeksFromPresentEvidence(evidence, new Date(instant), zone)).toBe(3);
    expect(findStreakWeeksTimestampFromPresentEvidence(evidence, 3, new Date(instant), zone)).toBe(
      new Date(dates[2]).toISOString()
    );
  });
});
