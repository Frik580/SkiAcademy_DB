import { useUiStore } from '../../store/uiStore';
import { Instructor, Course } from '../../types';
import { SkillConfig } from '../../lib/skillData';
import { AchievementsConfig } from '../../lib/achievementConfig';

export const selectSelectedInstructor = (
  state: ReturnType<typeof useUiStore.getState>
): Instructor | null => state.selectedInstructor;

export const selectSelectedCourseForDetails = (
  state: ReturnType<typeof useUiStore.getState>
): Course | null => state.selectedCourseForDetails;

export const selectSelectedCourseForAuth = (
  state: ReturnType<typeof useUiStore.getState>
): Course | null => state.selectedCourseForAuth;

export const selectReviewsInstructor = (
  state: ReturnType<typeof useUiStore.getState>
): Instructor | null => state.reviewsInstructor;

export const selectIsAuthModalOpen = (state: ReturnType<typeof useUiStore.getState>): boolean =>
  state.isAuthModalOpen;

export const selectIsOnboardingOpen = (state: ReturnType<typeof useUiStore.getState>): boolean =>
  state.isOnboardingOpen;

export const selectIsNotifHistoryOpen = (state: ReturnType<typeof useUiStore.getState>): boolean =>
  state.isNotifHistoryOpen;

export const selectSkillConfig = (state: ReturnType<typeof useUiStore.getState>): SkillConfig =>
  state.skillConfig;

export const selectAchievementsConfig = (
  state: ReturnType<typeof useUiStore.getState>
): AchievementsConfig => state.achievementsConfig;
