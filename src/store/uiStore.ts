import { create } from 'zustand';
import { Instructor, Course } from '../types';
import { DesignTheme } from '../lib/designTheme';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../lib/skillData';
import {
  AchievementsConfig,
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../lib/achievementConfig';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../lib/notificationConfig';
import { db, doc, setDoc } from '../lib/firebase';
import { InstructorSortBy, InstructorSpecialty } from '../components/useInstructorFilters';
import { notify, t } from './storeContext';

interface UiState {
  filtersEnabled: boolean;
  onboardingEnabled: boolean;
  designTheme: DesignTheme;
  notificationRetentionDays: number;
  skillConfig: SkillConfig;
  achievementsConfig: AchievementsConfig;
  dbStatusWarning: string | null;

  searchQuery: string;
  selectedSpecialty: InstructorSpecialty;
  selectedLanguage: string;
  sortBy: InstructorSortBy;

  isTopUpOpen: boolean;
  isNotifHistoryOpen: boolean;
  isOnboardingOpen: boolean;
  isAuthModalOpen: boolean;
  selectedInstructor: Instructor | null;
  selectedCourseForAuth: Course | null;
  selectedCourseForDetails: Course | null;
  reviewsInstructor: Instructor | null;

  setFiltersEnabled: (enabled: boolean) => void;
  setOnboardingEnabled: (enabled: boolean) => void;
  setDesignTheme: (theme: DesignTheme) => void;
  setNotificationRetentionDays: (days: number) => void;
  setSkillConfig: (config: SkillConfig) => void;
  setAchievementsConfig: (config: AchievementsConfig) => void;
  setDbStatusWarning: (warning: string | null) => void;

  setSearchQuery: (q: string) => void;
  setSelectedSpecialty: (s: InstructorSpecialty) => void;
  setSelectedLanguage: (l: string) => void;
  setSortBy: (s: InstructorSortBy) => void;
  resetFilters: () => void;

  setIsTopUpOpen: (open: boolean) => void;
  setIsNotifHistoryOpen: (open: boolean) => void;
  setIsOnboardingOpen: (open: boolean) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  setSelectedInstructor: (ins: Instructor | null) => void;
  setSelectedCourseForAuth: (course: Course | null) => void;
  setSelectedCourseForDetails: (course: Course | null) => void;
  setReviewsInstructor: (ins: Instructor | null) => void;

  handleToggleFilters: (enabled: boolean) => Promise<void>;
  handleToggleOnboarding: (enabled: boolean) => Promise<void>;
  handleSetDesignTheme: (theme: DesignTheme) => Promise<void>;
  handleSetNotificationRetentionDays: (days: number) => Promise<void>;
  handleUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  handleUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
}

export const useUiStore = create<UiState>((set) => ({
  filtersEnabled: true,
  onboardingEnabled: true,
  designTheme: 'air',
  notificationRetentionDays: DEFAULT_NOTIFICATION_RETENTION_DAYS,
  skillConfig: DEFAULT_SKILL_CONFIG,
  achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,
  dbStatusWarning: null,

  searchQuery: '',
  selectedSpecialty: 'all',
  selectedLanguage: 'all',
  sortBy: 'rating',

  isTopUpOpen: false,
  isNotifHistoryOpen: false,
  isOnboardingOpen: false,
  isAuthModalOpen: false,
  selectedInstructor: null,
  selectedCourseForAuth: null,
  selectedCourseForDetails: null,
  reviewsInstructor: null,

  setFiltersEnabled: (enabled) => set({ filtersEnabled: enabled }),
  setOnboardingEnabled: (enabled) => set({ onboardingEnabled: enabled }),
  setDesignTheme: (theme) => set({ designTheme: theme }),
  setNotificationRetentionDays: (days) => set({ notificationRetentionDays: days }),
  setSkillConfig: (config) => set({ skillConfig: config }),
  setAchievementsConfig: (config) => set({ achievementsConfig: config }),
  setDbStatusWarning: (warning) => set({ dbStatusWarning: warning }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedSpecialty: (s) => set({ selectedSpecialty: s }),
  setSelectedLanguage: (l) => set({ selectedLanguage: l }),
  setSortBy: (s) => set({ sortBy: s }),
  resetFilters: () =>
    set({ searchQuery: '', selectedSpecialty: 'all', selectedLanguage: 'all' }),

  setIsTopUpOpen: (open) => set({ isTopUpOpen: open }),
  setIsNotifHistoryOpen: (open) => set({ isNotifHistoryOpen: open }),
  setIsOnboardingOpen: (open) => set({ isOnboardingOpen: open }),
  setIsAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setSelectedInstructor: (ins) => set({ selectedInstructor: ins }),
  setSelectedCourseForAuth: (course) => set({ selectedCourseForAuth: course }),
  setSelectedCourseForDetails: (course) => set({ selectedCourseForDetails: course }),
  setReviewsInstructor: (ins) => set({ reviewsInstructor: ins }),

  handleToggleFilters: async (enabled) => {
    set({ filtersEnabled: enabled });
    await setDoc(doc(db, 'settings', 'instructor_filters'), { enabled });
  },

  handleToggleOnboarding: async (enabled) => {
    set({ onboardingEnabled: enabled });
    await setDoc(doc(db, 'settings', 'onboarding'), { enabled });
  },

  handleSetDesignTheme: async (theme) => {
    set({ designTheme: theme });
    await setDoc(doc(db, 'settings', 'design_theme'), { theme });
    notify('info', t('designThemeUpdated'), t('designThemeUpdatedDesc'));
  },

  handleSetNotificationRetentionDays: async (days) => {
    const clamped = Math.min(
      MAX_NOTIFICATION_RETENTION_DAYS,
      Math.max(MIN_NOTIFICATION_RETENTION_DAYS, Math.round(days))
    );
    set({ notificationRetentionDays: clamped });
    await setDoc(doc(db, 'settings', 'notification_retention'), { days: clamped });
    notify('info', t('notificationRetentionUpdated'), t('notificationRetentionUpdatedDesc'));
  },

  handleUpdateSkillConfig: async (newConfig) => {
    set({ skillConfig: newConfig });
    await setDoc(doc(db, 'settings', 'skill_config'), newConfig);
    notify('info', t('skillTableUpdated'), t('skillTableUpdatedDesc'));
  },

  handleUpdateAchievementsConfig: async (config) => {
    const normalized = normalizeAchievementsConfig(config);
    set({ achievementsConfig: normalized });
    await setDoc(doc(db, 'settings', 'achievements_config'), normalized);
    notify('info', t('achievementsSaved'), t('achievementsSavedDesc'));
  },
}));
