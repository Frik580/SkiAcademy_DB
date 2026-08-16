import { Instructor, Course } from '../../types';

export interface ModalRegistryProps {
  onCompleteOnboarding: () => void;
  onScheduleFirstLessonFromOnboarding: () => void;
}

export type ModalType =
  | 'onboarding'
  | 'booking'
  | 'courseEnrollment'
  | 'courseDetails'
  | 'instructorReviews'
  | 'notifications'
  | 'auth';

export interface ModalState {
  activeModal: ModalType | null;
  selectedInstructor: Instructor | null;
  selectedCourseForAuth: Course | null;
  selectedCourseForDetails: Course | null;
  reviewsInstructor: Instructor | null;
  isNotifHistoryOpen: boolean;
  isOnboardingOpen: boolean;
  isAuthModalOpen: boolean;
}
