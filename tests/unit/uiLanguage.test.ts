import { describe, expect, it } from 'vitest';
import { isUiLanguage, resolveUiLanguage, UI_LANGUAGES } from '../../src/lib/i18n/translations';

describe('UI language helpers', () => {
  it('exposes only en and ru', () => {
    expect(UI_LANGUAGES).toEqual(['en', 'ru']);
  });

  it('isUiLanguage accepts only supported locales', () => {
    expect(isUiLanguage('en')).toBe(true);
    expect(isUiLanguage('ru')).toBe(true);
    expect(isUiLanguage('de')).toBe(false);
    expect(isUiLanguage('fr')).toBe(false);
    expect(isUiLanguage(null)).toBe(false);
  });

  it('resolveUiLanguage returns saved locale when valid', () => {
    expect(resolveUiLanguage('en')).toBe('en');
    expect(resolveUiLanguage('ru')).toBe('ru');
  });

  it('resolveUiLanguage falls back for unsupported saved values', () => {
    expect(resolveUiLanguage('de')).toBe('en');
    expect(resolveUiLanguage('fr')).toBe('en');
    expect(resolveUiLanguage('')).toBe('en');
    expect(resolveUiLanguage(null)).toBe('en');
  });
});
