import { describe, expect, it } from 'vitest';
import { isLessonContextProgressAssessmentEnabled } from '../../src/features/instructor-workspace/instructorLessonProgressAssessment';

describe('isLessonContextProgressAssessmentEnabled', () => {
  const startsAtEpochMs = Date.parse('2026-01-15T09:00:00.000Z');
  it('unlocks at the exact lesson start and remains unlocked', () => {
    const booking = { status: 'confirmed', startsAtEpochMs };
    expect(isLessonContextProgressAssessmentEnabled(booking, startsAtEpochMs - 1)).toBe(false);
    expect(isLessonContextProgressAssessmentEnabled(booking, startsAtEpochMs)).toBe(true);
    expect(isLessonContextProgressAssessmentEnabled(booking, startsAtEpochMs + 86_400_000)).toBe(
      true
    );
  });

  it('does not unlock cancelled or no-show bookings', () => {
    for (const status of ['cancelled', 'no_show']) {
      expect(
        isLessonContextProgressAssessmentEnabled({ status, startsAtEpochMs }, startsAtEpochMs)
      ).toBe(false);
    }
  });
});
