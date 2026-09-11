import { describe, expect, it } from 'vitest';
import { isLessonContextProgressAssessmentEnabled } from '../../src/features/instructor-workspace/instructorLessonProgressAssessment';

describe('isLessonContextProgressAssessmentEnabled', () => {
  it('disables assessment when attendance is missing', () => {
    expect(isLessonContextProgressAssessmentEnabled(undefined)).toBe(false);
  });

  it('enables assessment when attendance is present', () => {
    expect(isLessonContextProgressAssessmentEnabled('present')).toBe(true);
  });

  it('disables assessment when attendance is absent', () => {
    expect(isLessonContextProgressAssessmentEnabled('absent')).toBe(false);
  });

  it('does not use booking-level or unrelated authorization fields', () => {
    expect(isLessonContextProgressAssessmentEnabled(undefined)).toBe(false);
    expect(isLessonContextProgressAssessmentEnabled('present')).toBe(true);
  });
});
