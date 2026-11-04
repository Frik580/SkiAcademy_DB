import type { Language } from './translations';

/** Individual score presentation only; aggregate progress keeps its numeric zero defaults. */
export function formatSkillScore(
  { hasScore, earned, maxPoints }: { hasScore: boolean; earned: number; maxPoints: number },
  language: Language
): string {
  if (!hasScore) {
    return `${language === 'ru' ? 'Нет оценки' : 'Not evaluated'} / ${maxPoints}`;
  }
  const percent = maxPoints > 0 ? Math.min(100, Math.round((earned / maxPoints) * 100)) : 0;
  return `${earned} / ${maxPoints} · ${percent}%`;
}
