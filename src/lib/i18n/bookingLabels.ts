import { formatLessonLevelLabel } from '@ski-academy/shared-domain';
import { useLessonLevelsStore } from '../../features/settings/lessonLevelsStore';
import { logger } from '../../shared/logger';
const reportedUnknown = new Set<string>();
import type { LessonDifficulty } from '../../types';
import type { Language } from './translations';

export type DifficultyLabelVariant = 'full' | 'short' | 'booking' | 'compact';

const STATUS_LABELS: Record<string, { en: string; ru: string }> = {
  confirmed: { en: 'Confirmed', ru: 'Подтверждено' },
  cancelled: { en: 'Cancelled', ru: 'Отменено' },
  completed: { en: 'Completed', ru: 'Завершено' },
  pending: { en: 'Awaiting confirmation', ru: 'Ожидает подтверждения' },
  pending_cancellation: { en: 'Cancellation requested', ru: 'Запрос на отмену' },
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
  void variant; // Kept for compatibility; every surface now uses the catalog label.
  return formatLessonLevelLabel(diff, language, useLessonLevelsStore.getState().levels, (value) => {
    if (!reportedUnknown.has(value)) {
      reportedUnknown.add(value);
      logger.warn('Unknown lesson level:', value);
    }
  });
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
