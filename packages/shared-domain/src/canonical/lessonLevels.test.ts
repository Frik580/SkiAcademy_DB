import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LESSON_LEVELS,
  LessonLevelsPayloadSchema,
  activeLessonLevels,
  assertLessonLevelsRetained,
  formatLessonLevelLabel,
  resolveLessonLevel,
} from './lessonLevels';

describe('lesson level catalog', () => {
  it('loads the five existing IDs in their original selector order', () => {
    expect(activeLessonLevels(DEFAULT_LESSON_LEVELS).map((level) => level.id)).toEqual([
      'beginner',
      'intermediate',
      'advanced',
      'freeride',
      'freestyle',
    ]);
    expect(LessonLevelsPayloadSchema.safeParse({ levels: DEFAULT_LESSON_LEVELS }).success).toBe(
      true
    );
  });
  it.each(DEFAULT_LESSON_LEVELS)('resolves legacy code $id', (level) => {
    expect(resolveLessonLevel(level.id.toUpperCase(), DEFAULT_LESSON_LEVELS)).toEqual(level);
  });
  it('resolves historical display codes centrally', () => {
    for (const [code, id] of [
      ['BASE', 'beginner'],
      ['CARVE', 'intermediate'],
      ['PRO', 'advanced'],
      ['PARK', 'freestyle'],
    ]) {
      expect(resolveLessonLevel(code, DEFAULT_LESSON_LEVELS)?.id).toBe(id);
    }
  });
  it('localizes ADVANCED exactly and keeps archived definitions available', () => {
    const levels = DEFAULT_LESSON_LEVELS.map((level) =>
      level.id === 'advanced' ? { ...level, isActive: false } : level
    );
    expect(formatLessonLevelLabel('ADVANCED', 'ru', levels)).toBe('🔴 Продвинутый');
    expect(formatLessonLevelLabel('ADVANCED', 'en', levels)).toBe('🔴 Advanced');
    expect(activeLessonLevels(levels).some((level) => level.id === 'advanced')).toBe(false);
  });
  it('returns a neutral fallback with diagnostics for a broken reference', () => {
    const diagnostic = vi.fn();
    expect(formatLessonLevelLabel('XYZ', 'en', DEFAULT_LESSON_LEVELS, diagnostic)).toBe(
      'Level not specified'
    );
    expect(diagnostic).toHaveBeenCalledWith('XYZ');
  });
  it('rejects duplicate IDs, empty names, invalid markers and no active level', () => {
    const first = DEFAULT_LESSON_LEVELS[0];
    for (const levels of [
      [first, { ...first, order: 1 }],
      [{ ...first, nameRu: ' ' }],
      [{ ...first, nameEn: '' }],
      [{ ...first, marker: 'abc' }],
      [{ ...first, isActive: false }],
    ])
      expect(LessonLevelsPayloadSchema.safeParse({ levels }).success).toBe(false);
  });
  it('forbids removing or renaming IDs and shadowing compatibility aliases', () => {
    expect(() =>
      assertLessonLevelsRetained(DEFAULT_LESSON_LEVELS, DEFAULT_LESSON_LEVELS.slice(1))
    ).toThrow();
    expect(() =>
      assertLessonLevelsRetained(DEFAULT_LESSON_LEVELS, [
        ...DEFAULT_LESSON_LEVELS,
        { ...DEFAULT_LESSON_LEVELS[0], id: 'base', order: 5 },
      ])
    ).toThrow();
  });
});
