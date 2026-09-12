import {
  AchievementDefinition,
  AchievementEvaluationContext,
  AchievementsConfig,
  DEFAULT_ACHIEVEMENTS_CONFIG,
  evaluateEarnedAchievements,
  getAchievementLabel,
  normalizeAchievementsConfig,
} from './achievementConfig';

export type {
  AchievementDefinition,
  AchievementEvaluationContext,
  AchievementRule,
  AchievementRuleType,
  AchievementsConfig,
  CanonicalAccountReviewEvidence,
  CanonicalAchievementProgress,
  EvaluatedAchievement,
} from './achievementConfig';

export {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  describeAchievementRule,
  evaluateEarnedAchievements,
  getAchievementLabel,
  isAchievementRuleMet,
  normalizeAchievementsConfig,
  achievementProductScope,
  participantAchievementSourceForRule,
  participantLessonFeedbackHomeworkDone,
} from './achievementConfig';

export interface AchievementContext extends AchievementEvaluationContext {
  achievementsConfig?: AchievementsConfig;
}

export const formatAchievementLabel = (
  id: string,
  language: 'en' | 'ru',
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG,
  metadata?: { achievementLabelRu?: string; achievementLabelEn?: string }
): string => getAchievementLabel(id, language, config, metadata);

export const pickAchievementTimestamp = (
  persistedTimestamp?: string,
  earnedAt?: string
): string | undefined => {
  if (!persistedTimestamp) return earnedAt;
  if (!earnedAt) return persistedTimestamp;
  if (persistedTimestamp.slice(0, 10) > earnedAt.slice(0, 10)) return earnedAt;
  return persistedTimestamp;
};

export const findAchievementDefinition = (
  id: string,
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG
): AchievementDefinition | undefined => config.items.find((item) => item.id === id);

/** Activity-log writes are no longer achievement authority. Kept for history timestamps only. */
export const evaluateParticipantAchievements = (
  ctx: AchievementContext
) => {
  const config = normalizeAchievementsConfig(ctx.achievementsConfig);
  return evaluateEarnedAchievements(ctx, config);
};
