import { db, doc, setDoc } from '../../infrastructure/firebase/firebase';
import { AchievementsConfig, normalizeAchievementsConfig } from '../../lib/achievementConfig';
import { DesignTheme } from '../../lib/designTheme';
import {
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../../lib/notificationConfig';
import { SkillConfig } from '../../lib/skillData';

export const saveFiltersEnabled = (enabled: boolean): Promise<void> =>
  setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });

export const saveOnboardingEnabled = (enabled: boolean): Promise<void> =>
  setDoc(doc(db, 'settings', 'onboarding'), { enabled });

export const saveDesignTheme = (theme: DesignTheme): Promise<void> =>
  setDoc(doc(db, 'settings', 'design_theme'), { theme });

export async function saveNotificationRetentionDays(days: number): Promise<number> {
  const normalizedDays = Math.min(
    MAX_NOTIFICATION_RETENTION_DAYS,
    Math.max(MIN_NOTIFICATION_RETENTION_DAYS, Math.round(days))
  );
  await setDoc(doc(db, 'settings', 'notification_retention'), { days: normalizedDays });
  return normalizedDays;
}

export const saveSkillConfig = (config: SkillConfig): Promise<void> =>
  setDoc(doc(db, 'settings', 'skill_config'), config);

export async function saveAchievementsConfig(
  config: AchievementsConfig
): Promise<AchievementsConfig> {
  const normalizedConfig = normalizeAchievementsConfig(config);
  await setDoc(doc(db, 'settings', 'achievements_config'), normalizedConfig);
  return normalizedConfig;
}
