import type { Language } from './translations';

/** Russian one / few (2–4) / many (0, 5–20, …) plural form. */
export function russianPlural(
  count: number,
  forms: readonly [one: string, few: string, many: string]
): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

const POINT_FORMS_RU = ['балл', 'балла', 'баллов'] as const;

export function pointsWord(count: number, language: Language): string {
  if (language === 'ru') return russianPlural(count, POINT_FORMS_RU);
  return count === 1 ? 'point' : 'points';
}

/** e.g. 1 балл, 2 балла, 5 баллов / 1 point, 2 points */
export function formatPointsCount(count: number, language: Language): string {
  return `${count} ${pointsWord(count, language)}`;
}

/** e.g. +1 балл, +2 балла, +5 баллов / +1 point, +2 points */
export function formatPointsGain(count: number, language: Language): string {
  return `+${formatPointsCount(count, language)}`;
}
