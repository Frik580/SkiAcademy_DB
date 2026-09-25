import { z } from 'zod';

export const INSTRUCTOR_SPOKEN_LANGUAGE_CODES = ['ru', 'en', 'de', 'fr', 'it', 'es'] as const;

export type InstructorSpokenLanguageCode = (typeof INSTRUCTOR_SPOKEN_LANGUAGE_CODES)[number];

const SPOKEN_LANGUAGE_ALIASES: Readonly<Record<string, InstructorSpokenLanguageCode>> = {
  ru: 'ru',
  rus: 'ru',
  russian: 'ru',
  русский: 'ru',
  рус: 'ru',
  en: 'en',
  eng: 'en',
  english: 'en',
  английский: 'en',
  англ: 'en',
  de: 'de',
  ger: 'de',
  german: 'de',
  deutsch: 'de',
  немецкий: 'de',
  нем: 'de',
  fr: 'fr',
  fre: 'fr',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  французский: 'fr',
  франц: 'fr',
  it: 'it',
  ita: 'it',
  italian: 'it',
  italiano: 'it',
  итальянский: 'it',
  итал: 'it',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  испанский: 'es',
  исп: 'es',
};

export const InstructorBioTextSchema = z.string().trim().max(4_000);

export function normalizeInstructorSpokenLanguage(
  value: string
): InstructorSpokenLanguageCode | undefined {
  const key = value.trim().toLowerCase().replace(/\.+$/u, '');
  return SPOKEN_LANGUAGE_ALIASES[key];
}

/** Known presentation aliases become codes. Unrecognized tokens stay as trimmed text. */
export function normalizeInstructorSpokenLanguages(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const token = normalizeInstructorSpokenLanguage(trimmed) ?? trimmed;
    if (seen.has(token)) continue;
    seen.add(token);
    normalized.push(token);
  }
  return normalized;
}

export function instructorSpokenLanguagesSchema(maxItems: number, maxLength = 40) {
  return z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((values) => normalizeInstructorSpokenLanguages(values));
}
