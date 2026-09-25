import type { Instructor } from '../../types';
import type { Language } from './translations';

/**
 * RU: bioRu, else legacy bio (treated as Russian).
 * EN: bioEn when present; otherwise temporary legacy-bio fallback so the card is not empty.
 * Never machine-translates.
 */
export function selectInstructorBio(
  instructor: Pick<Instructor, 'bio' | 'bioRu' | 'bioEn'>,
  language: Language
): string {
  if (language === 'ru') {
    return instructor.bioRu?.trim() || instructor.bio?.trim() || '';
  }
  return instructor.bioEn?.trim() || instructor.bio?.trim() || '';
}
