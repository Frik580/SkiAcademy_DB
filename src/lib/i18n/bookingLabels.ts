import type { LessonDifficulty } from '../../types';
import type { Language } from './translations';

export type DifficultyLabelVariant = 'full' | 'short' | 'booking' | 'compact';

const STATUS_LABELS: Record<string, { en: string; ru: string }> = {
  confirmed: { en: 'Confirmed', ru: 'Подтверждено' },
  cancelled: { en: 'Cancelled', ru: 'Отменено' },
  completed: { en: 'Completed', ru: 'Завершено' },
  pending: { en: 'Pending', ru: 'Ожидает' },
  pending_cancellation: { en: 'Pending Cancellation', ru: 'Ожидает отмены' },
  no_show: { en: 'No-show', ru: 'Неявка' },
};

export function getBookingStatusLabel(status: string, language: Language): string {
  const labels = STATUS_LABELS[status];
  if (labels) {
    return language === 'ru' ? labels.ru : labels.en;
  }
  return status;
}

export function getGroupCourseLabel(title: string, language: Language): string {
  return language === 'ru' ? `${title} (Групповой курс)` : `${title} (Group Course)`;
}

export function getGroupCourseEnrollmentNote(description: string, language: Language): string {
  const prefix = language === 'en' ? 'Group Course enrollment' : 'Запись на групповой курс';
  return `${prefix}: ${description}`;
}

export function getDifficultyLabel(
  diff: LessonDifficulty | string,
  language: Language,
  variant: DifficultyLabelVariant = 'full'
): string {
  const key = String(diff).toLowerCase() as LessonDifficulty;

  if (variant === 'short') {
    if (language === 'ru') {
      switch (key) {
        case 'beginner':
          return 'Новичок';
        case 'intermediate':
          return 'Средний';
        case 'advanced':
          return 'Продвинутый';
        case 'freeride':
          return 'Фрирайд';
        case 'freestyle':
          return 'Фристайл';
        default:
          return String(diff);
      }
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  if (variant === 'compact') {
    if (language === 'ru') {
      switch (key) {
        case 'beginner':
          return '🟢 Начинающий';
        case 'intermediate':
          return '🔵 Средний уровень';
        case 'advanced':
          return '🔴 Продвинутый';
        case 'freeride':
          return '🏔️ Фрирайд';
        case 'freestyle':
          return '🛹 Фристайл';
      }
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  if (variant === 'booking') {
    if (language === 'ru') {
      switch (key) {
        case 'beginner':
          return '🟢 Начинающий';
        case 'intermediate':
          return '🔵 Средний уровень';
        case 'advanced':
          return '🔴 Продвинутый';
        case 'freeride':
          return '🏔️ Вне трассы / Фрирайд';
        case 'freestyle':
          return '🛹 Фристайл в парке';
        default:
          return String(diff);
      }
    }
    switch (key) {
      case 'beginner':
        return '🟢 Beginner';
      case 'intermediate':
        return '🔵 Intermediate';
      case 'advanced':
        return '🔴 Advanced';
      case 'freeride':
        return '🏔️ Off-Piste / Freeride';
      case 'freestyle':
        return '🛹 Terrain Park Freestyle';
      default:
        return String(diff);
    }
  }

  // full (PersonalCabinet default)
  if (language === 'ru') {
    switch (key) {
      case 'beginner':
        return '🟢 Начинающий (Зеленые)';
      case 'intermediate':
        return '🔵 Средний уровень (Синие)';
      case 'advanced':
        return '🔴 Продвинутый (Черные)';
      case 'freeride':
        return '🏔️ Фрирайд';
      case 'freestyle':
        return '🛹 Фристайл';
    }
  }
  switch (key) {
    case 'beginner':
      return '🟢 Beginner (Green)';
    case 'intermediate':
      return '🔵 Intermediate (Blue)';
    case 'advanced':
      return '🔴 Advanced (Black)';
    case 'freeride':
      return '🏔️ Freeride';
    case 'freestyle':
      return '🛹 Freestyle';
  }
  return String(diff);
}

export function formatLessonDifficultyOrUnspecified(
  difficulty: LessonDifficulty | string | undefined,
  language: Language,
  unspecifiedLabel: string,
  variant: DifficultyLabelVariant = 'short'
): string {
  if (!difficulty) return unspecifiedLabel;
  return getDifficultyLabel(difficulty, language, variant);
}

export function getHourSuffix(language: Language): string {
  return language === 'en' ? 'h' : 'ч';
}

export {
  MONTHS_EN,
  MONTHS_RU,
  MONTHS_SHORT_RU,
  MONTHS_SHORT_EN,
  WEEKDAYS_EN,
  WEEKDAYS_RU,
} from './courseDates';
