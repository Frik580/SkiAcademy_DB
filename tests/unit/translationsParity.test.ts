import { describe, expect, it } from 'vitest';
import { translations, UI_LANGUAGES } from '../../src/lib/i18n/translations';

describe('translation key parity', () => {
  it('UI_LANGUAGES includes en and ru only', () => {
    expect(UI_LANGUAGES).toEqual(['en', 'ru']);
  });

  it('en and ru have identical translation keys', () => {
    const enKeys = Object.keys(translations.en).sort();
    const ruKeys = Object.keys(translations.ru).sort();
    expect(enKeys).toEqual(ruKeys);
  });
});
