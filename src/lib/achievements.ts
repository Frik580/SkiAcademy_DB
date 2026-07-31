import { logActivityForUser, activityLogId } from './activityLog';
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
  EvaluatedAchievement,
} from './achievementConfig';

export {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  describeAchievementRule,
  evaluateEarnedAchievements,
  getAchievementLabel,
  isAchievementRuleMet,
  normalizeAchievementsConfig,
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

export const syncAchievementActivityLogs = async (
  userId: string,
  ctx: AchievementContext
): Promise<void> => {
  if (userId.startsWith('guest_') || userId.startsWith('system_block_')) return;

  const config = normalizeAchievementsConfig(ctx.achievementsConfig);
  const earned = evaluateEarnedAchievements(ctx, config);
  const existingIds = new Set(
    ctx.activityLogs
      .filter((log) => log.type === 'achievement_earned')
      .map((log) => log.metadata?.achievementId)
      .filter(Boolean)
  );

  for (const achievement of earned) {
    if (existingIds.has(achievement.id)) continue;
    await logActivityForUser(
      userId,
      userId,
      'achievement_earned',
      {
        achievementId: achievement.id,
        achievementLabelRu: achievement.labelRu,
        achievementLabelEn: achievement.labelEn,
      },
      activityLogId.achievementEarned(userId, achievement.id),
      achievement.earnedAt
    );
  }
};

export const findAchievementDefinition = (
  id: string,
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG
): AchievementDefinition | undefined => config.items.find((item) => item.id === id);
