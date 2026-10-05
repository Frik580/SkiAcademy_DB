import { describe, expect, it } from 'vitest';
import {
  nextParticipantDailyProgress,
  participantProgressDayKey,
  ParticipantDailyProgressSchema,
} from './participantProgress';

describe('participant daily progress', () => {
  it('uses the school day across UTC midnight and the Asia/Almaty boundary', () => {
    expect(participantProgressDayKey(new Date('2026-10-05T18:59:59Z'))).toBe('2026-10-05');
    expect(participantProgressDayKey(new Date('2026-10-05T19:00:00Z'))).toBe('2026-10-06');
  });
  it('keeps one baseline within a day and resets it from the latest canonical scores on the next day', () => {
    const first = nextParticipantDailyProgress(undefined, new Date('2026-10-05T08:00:00Z'));
    const previous = {
      level: 2,
      skillScores: { carving: 10 },
      updatedAt: { seconds: new Date('2026-10-05T08:00:00Z').getTime() / 1000, nanoseconds: 0 },
      dailyProgress: first,
    };
    expect(nextParticipantDailyProgress(previous, new Date('2026-10-05T09:00:00Z'))).toBe(first);
    expect(nextParticipantDailyProgress(previous, new Date('2026-10-05T19:00:00Z'))).toMatchObject({
      date: '2026-10-06',
      baselineLevel: 2,
      baselineSkillScores: { carving: 10 },
      complete: true,
    });
  });
  it('marks missing earlier evidence as incomplete instead of inventing a daily total', () => {
    const previous = {
      level: 2,
      skillScores: { carving: 10 },
      updatedAt: { seconds: new Date('2026-10-05T05:00:00Z').getTime() / 1000, nanoseconds: 0 },
    };
    expect(nextParticipantDailyProgress(previous, new Date('2026-10-05T08:00:00Z')).complete).toBe(
      false
    );
    expect(
      ParticipantDailyProgressSchema.safeParse({
        ...nextParticipantDailyProgress(previous, new Date('2026-10-05T08:00:00Z')),
        timeZone: 'UTC',
      }).success
    ).toBe(false);
  });
});
