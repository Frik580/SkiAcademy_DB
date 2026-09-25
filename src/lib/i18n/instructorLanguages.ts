import type { InstructorSpokenLanguageCode } from '@ski-academy/shared-domain';
import type { TranslationKey } from './translations';

export const INSTRUCTOR_SPOKEN_LANGUAGE_KEYS = {
  ru: 'instructorSpokenRu',
  en: 'instructorSpokenEn',
  de: 'instructorSpokenDe',
  fr: 'instructorSpokenFr',
  it: 'instructorSpokenIt',
  es: 'instructorSpokenEs',
} as const satisfies Record<InstructorSpokenLanguageCode, TranslationKey>;
