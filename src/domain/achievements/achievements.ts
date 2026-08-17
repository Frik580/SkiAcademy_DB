import { logActivityForUser, activityLogId, updateActivityLogTimestamp } from '../../lib/activityLog';
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

export const pickAchievementTimestamp = (
  logTimestamp?: string,
  earnedAt?: string
): string | undefined => {
  if (!logTimestamp) return earnedAt;
  if (!earnedAt) return logTimestamp;
  if (logTimestamp.slice(0, 10) > earnedAt.slice(0, 10)) return earnedAt;
  return logTimestamp;
};

export const syncAchievementActivityLogs = async (
  userId: string,
  ctx: AchievementContext
): Promise<void> => {
  if (userId.startsWith('guest_') || userId.startsWith('system_block_')) return;

  const config = normalizeAchievementsConfig(ctx.achievementsConfig);
  const earned = evaluateEarnedAchievements(ctx, config);
  const existingByAchievementId = new Map(
    ctx.activityLogs
      .filter((log) => log.type === 'achievement_earned' && log.metadata?.achievementId)
      .map((log) => [log.metadata!.achievementId as string, log])
  );

  for (const achievement of earned) {
    const existingLog = existingByAchievementId.get(achievement.id);
    if (existingLog) {
      const correctedTimestamp = pickAchievementTimestamp(
        existingLog.timestamp,
        achievement.earnedAt
      );
      if (
        correctedTimestamp &&
        achievement.earnedAt &&
        correctedTimestamp !== existingLog.timestamp
      ) {
        await updateActivityLogTimestamp(existingLog.id, correctedTimestamp);
      }
      continue;
    }

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
