import {
  evaluateEarnedAchievements,
  formatAchievementLabel,
  normalizeAchievementsConfig,
  type AchievementEvaluationContext,
  type AchievementsConfig,
} from '../../../../domain/achievements';
import { isTimestampOnLocalDate } from './studentCabinetPresentation';
import type { Achievement } from './studentCabinetUtils';
import { mergeEvaluatedAndPersistedAchievements } from '../../../participant-achievements/mergeParticipantAchievements';

const formatActivityTimestamp = (timestamp: string, language: 'en' | 'ru') => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export const getAchievements = (
  ctx: AchievementEvaluationContext,
  language: 'en' | 'ru',
  achievementsConfig?: AchievementsConfig,
  persistedEarned: Readonly<
    Record<string, { earnedAt: { seconds: number; nanoseconds: number } }>
  > = {}
): Achievement[] => {
  const config = normalizeAchievementsConfig(achievementsConfig);
  const evaluated = evaluateEarnedAchievements(ctx, config);
  const merged = mergeEvaluatedAndPersistedAchievements({
    evaluated,
    persistedEarned,
    config,
  });

  return merged
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      label: formatAchievementLabel(item.id, language, config, {
        achievementLabelRu: item.labelRu,
        achievementLabelEn: item.labelEn,
      }),
      earnedAtLabel: item.earnedAt
        ? formatActivityTimestamp(item.earnedAt, language)
        : undefined,
      earnedAt: item.earnedAt,
    }))
    .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
};

export const getTodayAchievements = (
  ctx: AchievementEvaluationContext,
  language: 'en' | 'ru',
  achievementsConfig?: AchievementsConfig,
  persistedEarned: Readonly<
    Record<string, { earnedAt: { seconds: number; nanoseconds: number } }>
  > = {},
  onDate: Date = new Date()
): Achievement[] =>
  getAchievements(ctx, language, achievementsConfig, persistedEarned).filter(
    (item) => item.earnedAt && isTimestampOnLocalDate(item.earnedAt, onDate)
  );
