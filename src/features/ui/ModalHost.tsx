import React from 'react';
import { useLanguage, translateCourse } from '../../lib/LanguageContext';
import { useUiStore } from './uiStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useBookingActions } from '../bookings/useBookingActions';
import { useCoursesStore } from '../courses/coursesStore';
import { useCourseActions } from '../courses/useCourseActions';
import { NotificationsPanel } from '../notifications/NotificationsPanel';
import { OnboardingFlow } from '../profile/OnboardingFlow';
import { AuthModal } from '../../features/auth';
import { LazyLoad } from '../../components/LazyLoad';
import { ModalSkeleton } from '../../components/ui/Skeleton';
import { BodyScrollLock } from '../../components/ui/BodyScrollLock';
import { ModalRegistryProps } from './modalRegistry';

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
  <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
    <BodyScrollLock />
    <ModalSkeleton title={label} />
  </div>
);

export const ModalHost: React.FC<ModalRegistryProps> = ({
  onCompleteOnboarding,
  onScheduleFirstLessonFromOnboarding,
}) => {
  const { t, language } = useLanguage();

  const userProfile = useProfileStore((s) => s.userProfile);
  const bookings = useBookingsStore((s) => s.bookings);
  const reviews = useBookingsStore((s) => s.reviews);
  const instructors = useBookingsStore((s) => s.instructors);
  const { handleBookingSuccess } = useBookingActions();

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

  return (
    <>
      <OnboardingFlow
        onComplete={onCompleteOnboarding}
        onScheduleFirstLesson={onScheduleFirstLessonFromOnboarding}
      />

      {selectedInstructor && (
        <LazyLoad fallback={<ModalLoadingFallback label={t('loading')} />}>
          <BookingModal
            isOpen
            onClose={() => setSelectedInstructor(null)}
            instructor={selectedInstructor}
            userProfile={userProfile}
            onBookingSuccess={handleBookingSuccess}
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
            isEnrolled={bookings.some(
              (b) =>
                b.userId === userProfile?.uid &&
                b.instructorId === `course_${selectedCourseForDetails.id}` &&
                b.status !== 'cancelled'
            )}
            onEnroll={(courseId) => {
              if (!userProfile) {
                setSelectedCourseForAuth(selectedCourseForDetails);
              } else {
                handleBookCourse(courseId);
              }
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

      <NotificationsPanel />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};
