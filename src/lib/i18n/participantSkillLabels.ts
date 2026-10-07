import { translations, type Language, type TranslationKey } from './translations';

// Participant skill/course difficulty is a separate contract from managed lesson levels.
const SKILL_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  beginner: 'difficultyBeginner',
  intermediate: 'difficultyIntermediate',
  advanced: 'difficultyAdvanced',
  freeride: 'difficultyFreeride',
  freestyle: 'difficultyFreestyle',
  expert: 'journeyLevelExpert',
};
export function getParticipantSkillLabel(
  value: string,
  language: Language,
  booking = false
): string {
  const normalized = value.trim().toLowerCase();
  const key = SKILL_LABEL_KEYS[normalized];
  if (!key) return value;
  if (booking) {
    const labels: Readonly<Record<string, readonly [string, string]>> = {
      beginner: ['🟢 Начинающий', '🟢 Beginner'],
      intermediate: ['🔵 Средний уровень', '🔵 Intermediate'],
      advanced: ['🔴 Продвинутый', '🔴 Advanced'],
      freeride: ['🏔️ Вне трассы / Фрирайд', '🏔️ Off-Piste / Freeride'],
      freestyle: ['🛹 Фристайл в парке', '🛹 Terrain Park Freestyle'],
    };
    const label = labels[normalized];
    if (label) return label[language === 'ru' ? 0 : 1];
  }
  return translations[language][key];
}
