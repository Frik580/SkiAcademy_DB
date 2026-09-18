import { db, doc, setDoc } from '../../infrastructure/firebase';
import { AchievementsConfig, normalizeAchievementsConfig } from '../../domain/achievements';
import {
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../../domain/notifications';
import { SkillConfig } from '../../domain/achievements';
import {
  MAX_STARTER_CREDIT_KZT,
  MIN_STARTER_CREDIT_KZT,
  normalizeStarterCreditKzt,
} from '../../domain/wallet';

export const saveFiltersEnabled = (enabled: boolean): Promise<void> =>
  setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });

export async function saveNotificationRetentionDays(days: number): Promise<number> {
  const normalizedDays = Math.min(
    MAX_NOTIFICATION_RETENTION_DAYS,
    Math.max(MIN_NOTIFICATION_RETENTION_DAYS, Math.round(days))
  );
  await setDoc(doc(db, 'settings', 'notification_retention'), { days: normalizedDays });
  return normalizedDays;
}

export async function saveStarterCreditKzt(amount: number): Promise<number> {
  const normalizedAmount = normalizeStarterCreditKzt(
    Math.min(MAX_STARTER_CREDIT_KZT, Math.max(MIN_STARTER_CREDIT_KZT, amount))
  );
  await setDoc(doc(db, 'settings', 'starter_credit'), {
    amountKzt: normalizedAmount,
  });
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
