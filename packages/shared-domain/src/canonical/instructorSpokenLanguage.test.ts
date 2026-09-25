import { describe, expect, it } from 'vitest';
import {
  instructorSpokenLanguagesSchema,
  normalizeInstructorSpokenLanguage,
  normalizeInstructorSpokenLanguages,
} from './instructorSpokenLanguage';

describe('instructor spoken languages', () => {
  it('maps legacy presentation strings to canonical codes', () => {
    expect(normalizeInstructorSpokenLanguage('русский')).toBe('ru');
    expect(normalizeInstructorSpokenLanguage('Русский')).toBe('ru');
    expect(normalizeInstructorSpokenLanguage('Russian')).toBe('ru');
    expect(normalizeInstructorSpokenLanguage('английский')).toBe('en');
    expect(normalizeInstructorSpokenLanguage('English')).toBe('en');
    expect(normalizeInstructorSpokenLanguages(['русский', 'Russian', 'English'])).toEqual([
      'ru',
      'en',
    ]);
  });

  it('keeps unrecognized language text without treating it as a code', () => {
    expect(normalizeInstructorSpokenLanguages(['Kazakh', 'ru'])).toEqual(['Kazakh', 'ru']);
  });

  it('normalizes language arrays at the schema boundary', () => {
    expect(instructorSpokenLanguagesSchema(16).parse(['русский', 'English'])).toEqual(['ru', 'en']);
  });
});
