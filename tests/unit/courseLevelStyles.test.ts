import { describe, expect, it } from 'vitest';
import {
  courseLevelColors,
  type CourseLevel,
  getCourseLevelBadgeClass,
  getCourseLevelCardClass,
  getCourseLevelModalClass,
} from '../../src/domain/course';

const courseLevels: CourseLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

describe('courseLevelStyles', () => {
  it('defines a color token for each course level', () => {
    for (const level of courseLevels) {
      expect(courseLevelColors[level]).toBeTruthy();
    }
    expect(courseLevelColors.default).toBeTruthy();
  });

  it('returns card, modal, and badge classes using courseLevelColors', () => {
    for (const level of courseLevels) {
      const color = courseLevelColors[level];
      expect(getCourseLevelCardClass(level)).toContain(color);
      expect(getCourseLevelModalClass(level)).toContain(color);
      expect(getCourseLevelBadgeClass(level)).toContain(color);
    }
  });

  it('falls back when level is empty', () => {
    expect(getCourseLevelCardClass('')).toContain('--ink-dim');
    expect(getCourseLevelModalClass(undefined)).toContain('white/90');
    expect(getCourseLevelBadgeClass(undefined)).toContain(courseLevelColors.default);
  });
});
