import { create } from 'zustand';
import { Instructor, Course } from '../../types';
import { InstructorSortBy, InstructorSpecialty } from '../../hooks/useInstructorFilters';

export interface UiState {
  dbStatusWarning: string | null;

  searchQuery: string;
  selectedSpecialty: InstructorSpecialty;
  selectedLanguage: string;
  sortBy: InstructorSortBy;

  isNotifHistoryOpen: boolean;
  isOnboardingOpen: boolean;
  isAuthModalOpen: boolean;
  selectedInstructor: Instructor | null;
  selectedCourseForAuth: Course | null;
  selectedCourseForDetails: Course | null;
  reviewsInstructor: Instructor | null;

  setDbStatusWarning: (warning: string | null) => void;

  setSearchQuery: (q: string) => void;
  setSelectedSpecialty: (s: InstructorSpecialty) => void;
  setSelectedLanguage: (l: string) => void;
  setSortBy: (s: InstructorSortBy) => void;
  resetFilters: () => void;

  setIsNotifHistoryOpen: (open: boolean) => void;
  setIsOnboardingOpen: (open: boolean) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  setSelectedInstructor: (ins: Instructor | null) => void;
  setSelectedCourseForAuth: (course: Course | null) => void;
  setSelectedCourseForDetails: (course: Course | null) => void;
  setReviewsInstructor: (ins: Instructor | null) => void;

  closeAllModals: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  dbStatusWarning: null,

  searchQuery: '',
  selectedSpecialty: 'all',
  selectedLanguage: 'all',
  sortBy: 'rating',

  isNotifHistoryOpen: false,
  isOnboardingOpen: false,
  isAuthModalOpen: false,
  selectedInstructor: null,
  selectedCourseForAuth: null,
  selectedCourseForDetails: null,
  reviewsInstructor: null,

  setDbStatusWarning: (warning) => set({ dbStatusWarning: warning }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedSpecialty: (s) => set({ selectedSpecialty: s }),
  setSelectedLanguage: (l) => set({ selectedLanguage: l }),
  setSortBy: (s) => set({ sortBy: s }),
  resetFilters: () => set({ searchQuery: '', selectedSpecialty: 'all', selectedLanguage: 'all' }),

  setIsNotifHistoryOpen: (open) => set({ isNotifHistoryOpen: open }),
  setIsOnboardingOpen: (open) => set({ isOnboardingOpen: open }),
  setIsAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setSelectedInstructor: (ins) => set({ selectedInstructor: ins }),
  setSelectedCourseForAuth: (course) => set({ selectedCourseForAuth: course }),
  setSelectedCourseForDetails: (course) => set({ selectedCourseForDetails: course }),
  setReviewsInstructor: (ins) => set({ reviewsInstructor: ins }),

  closeAllModals: () =>
    set({
      isNotifHistoryOpen: false,
      isOnboardingOpen: false,
      isAuthModalOpen: false,
      selectedInstructor: null,
      selectedCourseForAuth: null,
      selectedCourseForDetails: null,
      reviewsInstructor: null,
    }),
}));
