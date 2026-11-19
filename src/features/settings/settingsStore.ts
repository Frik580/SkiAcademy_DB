import { create } from 'zustand';
import { canonicalJsonStringify } from '@ski-academy/shared-domain/canonical/canonicalJson';
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
  saveStudentDashboardLayout,
} from './settingsService';
import {
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  normalizeStudentDashboardLayout,
  type StudentDashboardLayout,
} from './studentDashboardLayout';

type SecondarySettingValues = Pick<
  SettingsState,
  | 'studentDashboardLayout'
  | 'notificationRetentionDays'
  | 'starterCreditKzt'
  | 'skillConfig'
  | 'achievementsConfig'
>;

export type SecondarySetting = keyof SecondarySettingValues;
export type SecondarySettingRead = {
  status: 'loading' | 'ready' | 'refreshing' | 'empty' | 'error';
  confirmed: boolean;
};

const initialRead: SecondarySettingRead = { status: 'loading', confirmed: false };

export interface SettingsState {
  secondaryReads: Record<SecondarySetting, SecondarySettingRead>;
  setSecondaryRead: (setting: SecondarySetting, status: 'loading' | 'refreshing' | 'error') => void;
  receiveSecondarySetting: <K extends SecondarySetting>(
    setting: K,
    value: SecondarySettingValues[K],
    exists: boolean
  ) => void;
  retrySecondarySetting?: (setting: SecondarySetting) => void;
  studentDashboardLayout: StudentDashboardLayout;
  setStudentDashboardLayout: (config: unknown) => void;
  handleUpdateStudentDashboardLayout: (config: StudentDashboardLayout) => Promise<void>;
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  secondaryReads: {
    studentDashboardLayout: initialRead,
    notificationRetentionDays: initialRead,
    starterCreditKzt: initialRead,
    skillConfig: initialRead,
    achievementsConfig: initialRead,
  },
  setSecondaryRead: (setting, status) =>
    set((state) => ({
      secondaryReads: {
        ...state.secondaryReads,
        [setting]: { ...state.secondaryReads[setting], status },
      },
    })),
  receiveSecondarySetting: (setting, value, exists) =>
    set((state) => {
      const status = exists ? 'ready' : 'empty';
      // Reconnecting to an unchanged document should not reset an open editor's draft.
      const unchanged =
        Object.is(state[setting], value) ||
        canonicalJsonStringify(state[setting]) === canonicalJsonStringify(value);
      if (unchanged && state.secondaryReads[setting].status === status) return state;
      return {
        [setting]: unchanged ? state[setting] : value,
        secondaryReads: {
          ...state.secondaryReads,
          [setting]: { status, confirmed: true },
        },
      };
    }),
  studentDashboardLayout: DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  setStudentDashboardLayout: (config) =>
    get().receiveSecondarySetting(
      'studentDashboardLayout',
      normalizeStudentDashboardLayout(config),
      config !== undefined
    ),
  handleUpdateStudentDashboardLayout: async (config) => {
    const studentDashboardLayout = await saveStudentDashboardLayout(config);
    set({ studentDashboardLayout });
  },
  filtersEnabled: true,
  notificationRetentionDays: DEFAULT_NOTIFICATION_RETENTION_DAYS,
  starterCreditKzt: DEFAULT_STARTER_CREDIT_KZT,
  skillConfig: DEFAULT_SKILL_CONFIG,
  achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,

  setFiltersEnabled: (filtersEnabled) => set({ filtersEnabled }),
  setNotificationRetentionDays: (days) =>
    get().receiveSecondarySetting('notificationRetentionDays', days, true),
  setStarterCreditKzt: (amount) => get().receiveSecondarySetting('starterCreditKzt', amount, true),
  setSkillConfig: (config) => get().receiveSecondarySetting('skillConfig', config, true),
  setAchievementsConfig: (config) =>
    get().receiveSecondarySetting('achievementsConfig', config, true),

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

export function retrySecondarySetting(setting: SecondarySetting) {
  useSettingsStore.getState().retrySecondarySetting?.(setting);
}
