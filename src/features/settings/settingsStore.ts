import { create } from 'zustand';
import { AchievementsConfig, DEFAULT_ACHIEVEMENTS_CONFIG } from '../../domain/achievements';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../domain/notifications';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../../domain/achievements';
import { DEFAULT_STARTER_CREDIT_USD } from '../../domain/wallet';
import { notify, t } from '../../store/storeContext';
import {
  saveAchievementsConfig,
  saveFiltersEnabled,
  saveNotificationRetentionDays,
  saveSkillConfig,
  saveStarterCreditUsd,
} from './settingsService';

export interface SettingsState {
  filtersEnabled: boolean;
  notificationRetentionDays: number;
  starterCreditUsd: number;
  skillConfig: SkillConfig;
  achievementsConfig: AchievementsConfig;

  setFiltersEnabled: (enabled: boolean) => void;
  setNotificationRetentionDays: (days: number) => void;
  setStarterCreditUsd: (amount: number) => void;
  setSkillConfig: (config: SkillConfig) => void;
  setAchievementsConfig: (config: AchievementsConfig) => void;

  handleToggleFilters: (enabled: boolean) => Promise<void>;
  handleSetNotificationRetentionDays: (days: number) => Promise<void>;
  handleSetStarterCreditUsd: (amount: number) => Promise<void>;
  handleUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  handleUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  filtersEnabled: true,
  notificationRetentionDays: DEFAULT_NOTIFICATION_RETENTION_DAYS,
  starterCreditUsd: DEFAULT_STARTER_CREDIT_USD,
  skillConfig: DEFAULT_SKILL_CONFIG,
  achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,

  setFiltersEnabled: (filtersEnabled) => set({ filtersEnabled }),
  setNotificationRetentionDays: (notificationRetentionDays) => set({ notificationRetentionDays }),
  setStarterCreditUsd: (starterCreditUsd) => set({ starterCreditUsd }),
  setSkillConfig: (skillConfig) => set({ skillConfig }),
  setAchievementsConfig: (achievementsConfig) => set({ achievementsConfig }),

  handleToggleFilters: async (enabled) => {
    await saveFiltersEnabled(enabled);
    set({ filtersEnabled: enabled });
  },
  handleSetNotificationRetentionDays: async (days) => {
    const notificationRetentionDays = await saveNotificationRetentionDays(days);
    set({ notificationRetentionDays });
    notify('info', t('notificationRetentionUpdated'), t('notificationRetentionUpdatedDesc'));
  },
  handleSetStarterCreditUsd: async (amount) => {
    const starterCreditUsd = await saveStarterCreditUsd(amount);
    set({ starterCreditUsd });
    notify('info', t('starterCreditUpdated'), t('starterCreditUpdatedDesc'));
  },
  handleUpdateSkillConfig: async (skillConfig) => {
    await saveSkillConfig(skillConfig);
    set({ skillConfig });
    notify('info', t('skillTableUpdated'), t('skillTableUpdatedDesc'));
  },
  handleUpdateAchievementsConfig: async (config) => {
    const achievementsConfig = await saveAchievementsConfig(config);
    set({ achievementsConfig });
    notify('info', t('achievementsSaved'), t('achievementsSavedDesc'));
  },
}));
