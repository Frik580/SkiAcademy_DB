import { db, doc, setDoc } from '../../infrastructure/firebase';
import { AchievementsConfig, normalizeAchievementsConfig } from '../../domain/achievements';
import { DesignTheme } from '../../shared';
import {
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../../domain/notifications';
import { SkillConfig } from '../../domain/achievements';
import {
  MAX_STARTER_CREDIT_USD,
  MIN_STARTER_CREDIT_USD,
  normalizeStarterCreditUsd,
} from '../../domain/wallet';

export const saveFiltersEnabled = (enabled: boolean): Promise<void> =>
  setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });

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

export async function saveStarterCreditUsd(amount: number): Promise<number> {
  const normalizedAmount = normalizeStarterCreditUsd(
    Math.min(MAX_STARTER_CREDIT_USD, Math.max(MIN_STARTER_CREDIT_USD, amount))
  );
  await setDoc(doc(db, 'settings', 'starter_credit'), { amountUsd: normalizedAmount });
  return normalizedAmount;
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
