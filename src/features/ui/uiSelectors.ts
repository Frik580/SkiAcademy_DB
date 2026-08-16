import { UiState } from './uiStore';
import { Instructor, Course } from '../../types';
import { SkillConfig } from '../../lib/skillData';
import { AchievementsConfig } from '../../lib/achievementConfig';
import { DesignTheme } from '../../lib/designTheme';

export const selectSelectedInstructor = (state: UiState): Instructor | null =>
  state.selectedInstructor;

export const selectSelectedCourseForDetails = (state: UiState): Course | null =>
  state.selectedCourseForDetails;

export const selectSelectedCourseForAuth = (state: UiState): Course | null =>
  state.selectedCourseForAuth;

export const selectReviewsInstructor = (state: UiState): Instructor | null =>
  state.reviewsInstructor;

export const selectIsAuthModalOpen = (state: UiState): boolean => state.isAuthModalOpen;

export const selectIsOnboardingOpen = (state: UiState): boolean => state.isOnboardingOpen;

export const selectIsNotifHistoryOpen = (state: UiState): boolean => state.isNotifHistoryOpen;

export const selectSkillConfig = (state: UiState): SkillConfig => state.skillConfig;

export const selectAchievementsConfig = (state: UiState): AchievementsConfig =>
  state.achievementsConfig;

export const selectDesignTheme = (state: UiState): DesignTheme => state.designTheme;

export const selectDbStatusWarning = (state: UiState): string | null => state.dbStatusWarning;

export const selectOnboardingEnabled = (state: UiState): boolean => state.onboardingEnabled;

export const selectFiltersEnabled = (state: UiState): boolean => state.filtersEnabled;

export const selectNotificationRetentionDays = (state: UiState): number =>
  state.notificationRetentionDays;
