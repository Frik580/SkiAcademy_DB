import { UiState } from './uiStore';
import { Instructor, Course } from '../../types';

export const selectSelectedInstructor = (state: UiState): Instructor | null =>
  state.selectedInstructor;

export const selectSelectedCourseForDetails = (state: UiState): Course | null =>
  state.selectedCourseForDetails;

export const selectSelectedCourseForAuth = (state: UiState): Course | null =>
  state.selectedCourseForAuth;

export const selectReviewsInstructor = (state: UiState): Instructor | null =>
  state.reviewsInstructor;

export const selectIsAuthModalOpen = (state: UiState): boolean => state.isAuthModalOpen;

export const selectIsNotifHistoryOpen = (state: UiState): boolean => state.isNotifHistoryOpen;

export const selectDbStatusWarning = (state: UiState): string | null => state.dbStatusWarning;
