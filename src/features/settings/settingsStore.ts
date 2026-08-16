import { create } from 'zustand';
import { AchievementsConfig, DEFAULT_ACHIEVEMENTS_CONFIG } from '../../lib/achievementConfig';
import { DesignTheme } from '../../lib/designTheme';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../lib/notificationConfig';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../../lib/skillData';
import { notify, t } from '../../store/storeContext';
import {
  saveAchievementsConfig,
  saveDesignTheme,
  saveFiltersEnabled,
  saveNotificationRetentionDays,
  saveOnboardingEnabled,
  saveSkillConfig,
} from './settingsService';

export interface SettingsState {
  filtersEnabled: boolean;
  onboardingEnabled: boolean;
  designTheme: DesignTheme;
  notificationRetentionDays: number;
  skillConfig: SkillConfig;
  achievementsConfig: AchievementsConfig;

  setFiltersEnabled: (enabled: boolean) => void;
  setOnboardingEnabled: (enabled: boolean) => void;
  setDesignTheme: (theme: DesignTheme) => void;
  setNotificationRetentionDays: (days: number) => void;
  setSkillConfig: (config: SkillConfig) => void;
  setAchievementsConfig: (config: AchievementsConfig) => void;

  handleToggleFilters: (enabled: boolean) => Promise<void>;
  handleToggleOnboarding: (enabled: boolean) => Promise<void>;
  handleSetDesignTheme: (theme: DesignTheme) => Promise<void>;
  handleSetNotificationRetentionDays: (days: number) => Promise<void>;
  handleUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  handleUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  filtersEnabled: true,
  onboardingEnabled: true,
  designTheme: 'air',
  notificationRetentionDays: DEFAULT_NOTIFICATION_RETENTION_DAYS,
  skillConfig: DEFAULT_SKILL_CONFIG,
  achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,

  setFiltersEnabled: (filtersEnabled) => set({ filtersEnabled }),
  setOnboardingEnabled: (onboardingEnabled) => set({ onboardingEnabled }),
  setDesignTheme: (designTheme) => set({ designTheme }),
  setNotificationRetentionDays: (notificationRetentionDays) => set({ notificationRetentionDays }),
  setSkillConfig: (skillConfig) => set({ skillConfig }),
  setAchievementsConfig: (achievementsConfig) => set({ achievementsConfig }),

  handleToggleFilters: async (enabled) => {
    await saveFiltersEnabled(enabled);
    set({ filtersEnabled: enabled });
  },
  handleToggleOnboarding: async (enabled) => {
    await saveOnboardingEnabled(enabled);
    set({ onboardingEnabled: enabled });
  },
  handleSetDesignTheme: async (theme) => {
    await saveDesignTheme(theme);
    set({ designTheme: theme });
    notify('info', t('designThemeUpdated'), t('designThemeUpdatedDesc'));
  },
  handleSetNotificationRetentionDays: async (days) => {
    const notificationRetentionDays = await saveNotificationRetentionDays(days);
    set({ notificationRetentionDays });
    notify('info', t('notificationRetentionUpdated'), t('notificationRetentionUpdatedDesc'));
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
