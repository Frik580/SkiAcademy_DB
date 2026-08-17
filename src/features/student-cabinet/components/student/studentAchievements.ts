import type { ActivityLog, Booking, Course, Review, UserProfile } from '../../../../types';
import {
  evaluateEarnedAchievements,
  formatAchievementLabel,
  getTrainingStreakWeeks,
  normalizeAchievementsConfig,
  pickAchievementTimestamp,
  type AchievementsConfig,
  type SkillConfig,
} from '../../../../domain/achievements';
import { isTimestampOnLocalDate } from './studentCabinetPresentation';
import type { Achievement } from './studentCabinetUtils';

const formatActivityTimestamp = (timestamp: string, language: 'en' | 'ru') => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export { getTrainingStreakWeeks };

export const getAchievements = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig: SkillConfig | undefined,
  language: 'en' | 'ru',
  activityLogs: ActivityLog[] = [],
  reviews: Review[] = [],
  courses: Course[] = [],
  achievementsConfig?: AchievementsConfig
): Achievement[] => {
  const config = normalizeAchievementsConfig(achievementsConfig);
  const earned = evaluateEarnedAchievements(
    {
      userProfile,
      bookings,
      courses,
      reviews,
      skillConfig,
      activityLogs,
    },
    config
  );

  const logTimestamps = new Map<string, string>(
    activityLogs
      .filter((log) => log.type === 'achievement_earned' && log.metadata?.achievementId)
      .map((log) => [log.metadata!.achievementId as string, log.timestamp])
  );

  const logLabels = new Map<string, { ru?: string; en?: string }>(
    activityLogs
      .filter((log) => log.type === 'achievement_earned' && log.metadata?.achievementId)
      .map((log) => [
        log.metadata!.achievementId as string,
        {
          ru: log.metadata?.achievementLabelRu,
          en: log.metadata?.achievementLabelEn,
        },
      ])
  );

  return earned
    .map((item) => {
      const timestamp = pickAchievementTimestamp(logTimestamps.get(item.id), item.earnedAt);
      const storedLabels = logLabels.get(item.id);
      return {
        id: item.id,
        icon: item.icon,
        label: formatAchievementLabel(item.id, language, config, {
          achievementLabelRu: storedLabels?.ru ?? item.labelRu,
          achievementLabelEn: storedLabels?.en ?? item.labelEn,
        }),
        earnedAtLabel: timestamp ? formatActivityTimestamp(timestamp, language) : undefined,
        earnedAt: timestamp,
      };
    })
    .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
};

export const getTodayAchievements = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig: SkillConfig | undefined,
  language: 'en' | 'ru',
  activityLogs: ActivityLog[] = [],
  reviews: Review[] = [],
  courses: Course[] = [],
  achievementsConfig?: AchievementsConfig,
  onDate: Date = new Date()
): Achievement[] =>
  getAchievements(
    userProfile,
    bookings,
    skillConfig,
    language,
    activityLogs,
    reviews,
    courses,
    achievementsConfig
  ).filter((item) => item.earnedAt && isTimestampOnLocalDate(item.earnedAt, onDate));
