import { create } from 'zustand';
import { AchievementsConfig, DEFAULT_ACHIEVEMENTS_CONFIG } from '../../domain/achievements';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../domain/notifications';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../../domain/achievements';
import { DEFAULT_STARTER_CREDIT_KZT } from '../../domain/wallet';
import { notify, t } from '../../store/storeContext';
import {
  saveAchievementsConfig,
  saveFiltersEnabled,
  saveNotificationRetentionDays,
  saveSkillConfig,
  saveStarterCreditKzt,
} from './settingsService';

export interface SettingsState {
  filtersEnabled: boolean;
  notificationRetentionDays: number;
  starterCreditKzt: number;
  skillConfig: SkillConfig;
  achievementsConfig: AchievementsConfig;

  setFiltersEnabled: (enabled: boolean) => void;
  setNotificationRetentionDays: (days: number) => void;
  setStarterCreditKzt: (amount: number) => void;
  setSkillConfig: (config: SkillConfig) => void;
  setAchievementsConfig: (config: AchievementsConfig) => void;

  handleToggleFilters: (enabled: boolean) => Promise<void>;
  handleSetNotificationRetentionDays: (days: number) => Promise<void>;
  handleSetStarterCreditKzt: (amount: number) => Promise<void>;
  handleUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  handleUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  filtersEnabled: true,
  notificationRetentionDays: DEFAULT_NOTIFICATION_RETENTION_DAYS,
  starterCreditKzt: DEFAULT_STARTER_CREDIT_KZT,
  skillConfig: DEFAULT_SKILL_CONFIG,
  achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,

  setFiltersEnabled: (filtersEnabled) => set({ filtersEnabled }),
  setNotificationRetentionDays: (notificationRetentionDays) => set({ notificationRetentionDays }),
  setStarterCreditKzt: (starterCreditKzt) => set({ starterCreditKzt }),
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
  handleSetStarterCreditKzt: async (amount) => {
    const starterCreditKzt = await saveStarterCreditKzt(amount);
    set({ starterCreditKzt });
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
