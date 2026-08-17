import { Instructor, Course } from '../../types';

export type ModalType =
  'booking' | 'courseEnrollment' | 'courseDetails' | 'instructorReviews' | 'notifications' | 'auth';

export interface ModalState {
  activeModal: ModalType | null;
  selectedInstructor: Instructor | null;
  selectedCourseForAuth: Course | null;
  selectedCourseForDetails: Course | null;
  reviewsInstructor: Instructor | null;
  isNotifHistoryOpen: boolean;
  isAuthModalOpen: boolean;
}
