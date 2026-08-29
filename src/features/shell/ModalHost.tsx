import React from 'react';
import { useLanguage, translateCourse } from '../../app/providers/LanguageContext';
import { useUiStore } from './uiStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useCoursesStore } from '../courses/coursesStore';
import { useCourseActions } from '../courses/useCourseActions';
import {
  isEnrolledInCourse,
  lookupCourseCatalogOperational,
  selectCourseEnrollmentItems,
  useCourseEnrollmentStore,
} from '../course-enrollments';
import { NotificationsPanel } from '../notifications/NotificationsPanel';
import { AuthModal } from '../../features/auth';
import { LazyLoad } from '../../ui/LazyLoad';
import { ModalSkeleton } from '../../ui/Skeleton';
import { BodyScrollLock } from '../../ui/BodyScrollLock';

const BookingModal = React.lazy(() =>
  import('../../features/bookings').then(({ BookingModal }) => ({ default: BookingModal }))
);
const CourseEnrollmentModal = React.lazy(() =>
  import('../../features/courses').then(({ CourseEnrollmentModal }) => ({
    default: CourseEnrollmentModal,
  }))
);
const CourseDetailsModal = React.lazy(() =>
  import('../../features/courses').then(({ CourseDetailsModal }) => ({
    default: CourseDetailsModal,
  }))
);
const InstructorReviewsModal = React.lazy(() =>
  import('../../features/profile').then(({ InstructorReviewsModal }) => ({
    default: InstructorReviewsModal,
  }))
);

const ModalLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
    <BodyScrollLock />
    <ModalSkeleton title={label} />
  </div>
);

export const ModalHost: React.FC = () => {
  const { t, language } = useLanguage();

  const userProfile = useProfileStore((s) => s.userProfile);
  const reviews = useBookingsStore((s) => s.reviews);
  const instructors = useBookingsStore((s) => s.instructors);
  const courseEnrollments = useCourseEnrollmentStore(selectCourseEnrollmentItems);

  const courses = useCoursesStore((s) => s.courses);
  const { handleBookCourse } = useCourseActions();

  const isAuthModalOpen = useUiStore((s) => s.isAuthModalOpen);
  const setIsAuthModalOpen = useUiStore((s) => s.setIsAuthModalOpen);
  const selectedInstructor = useUiStore((s) => s.selectedInstructor);
  const setSelectedInstructor = useUiStore((s) => s.setSelectedInstructor);
  const selectedCourseForAuth = useUiStore((s) => s.selectedCourseForAuth);
  const setSelectedCourseForAuth = useUiStore((s) => s.setSelectedCourseForAuth);
  const selectedCourseForDetails = useUiStore((s) => s.selectedCourseForDetails);
  const setSelectedCourseForDetails = useUiStore((s) => s.setSelectedCourseForDetails);
  const reviewsInstructor = useUiStore((s) => s.reviewsInstructor);
  const setReviewsInstructor = useUiStore((s) => s.setReviewsInstructor);

  const selectedCatalogOperational = useCourseEnrollmentStore((state) =>
    selectedCourseForDetails
      ? lookupCourseCatalogOperational(state.catalogByCourseId, selectedCourseForDetails.id)
      : undefined
  );

  return (
    <>
      {selectedInstructor && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <BookingModal
            isOpen
            onClose={() => setSelectedInstructor(null)}
            instructor={selectedInstructor}
            userProfile={userProfile}
            courses={courses}
          />
        </LazyLoad>
      )}

      {selectedCourseForAuth && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseEnrollmentModal
            isOpen
            onClose={() => setSelectedCourseForAuth(null)}
            course={translateCourse(selectedCourseForAuth, language)}
            userProfile={userProfile}
            onEnroll={handleBookCourse}
          />
        </LazyLoad>
      )}

      {selectedCourseForDetails && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <CourseDetailsModal
            isOpen
            onClose={() => setSelectedCourseForDetails(null)}
            rawCourse={selectedCourseForDetails}
            course={translateCourse(selectedCourseForDetails, language)}
            instructors={instructors}
            userProfile={userProfile}
            catalogOperational={selectedCatalogOperational}
            isEnrolled={isEnrolledInCourse(courseEnrollments, selectedCourseForDetails.id)}
            onEnroll={() => {
              setSelectedCourseForAuth(selectedCourseForDetails);
            }}
          />
        </LazyLoad>
      )}

      {reviewsInstructor && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <InstructorReviewsModal
            isOpen
            onClose={() => setReviewsInstructor(null)}
            instructor={reviewsInstructor}
            reviews={reviews}
          />
        </LazyLoad>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <NotificationsPanel />
    </>
  );
};
