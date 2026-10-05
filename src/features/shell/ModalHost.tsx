import React from 'react';
import { useLanguage, translateCourse } from '../../app/providers/LanguageContext';
import { useUiStore } from './uiStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useCoursesStore } from '../courses/coursesStore';
import { useCourseActions } from '../courses/useCourseActions';
import {
  lookupCourseCatalogOperational,
  selectCourseEnrollmentItems,
  selectEnrollmentForCourseParticipant,
  selectActiveGuestCourseEnrollment,
  presentStudentCourseProgress,
  studentCourseProgressCopyFromLanguage,
  useCourseEnrollmentStore,
} from '../course-enrollments';
import { useCabinetProgressParticipantSelectionStore } from '../student-cabinet/cabinetProgressParticipantSelectionStore';
import { NotificationsPanel } from '../notifications/NotificationsPanel';
import { LazyLoad } from '../../ui/LazyLoad';
import { ModalSkeleton } from '../../ui/Skeleton';
import { BodyScrollLock } from '../../ui/BodyScrollLock';
import { loadMoreCanonicalInstructorReviews } from '../reviews';
import { logger } from '../../shared';

const AuthModal = React.lazy(() =>
  import('../auth/components/AuthModal').then(({ AuthModal }) => ({ default: AuthModal }))
);
const BookingModal = React.lazy(() =>
  import('../bookings/components/BookingModal').then(({ BookingModal }) => ({
    default: BookingModal,
  }))
);
const CourseEnrollmentModal = React.lazy(() =>
  import('../courses/components/CourseEnrollmentModal').then(({ CourseEnrollmentModal }) => ({
    default: CourseEnrollmentModal,
  }))
);
const CourseDetailsModal = React.lazy(() =>
  import('../courses/components/CourseDetailsModal').then(({ CourseDetailsModal }) => ({
    default: CourseDetailsModal,
  }))
);
const InstructorReviewsModal = React.lazy(() =>
  import('../profile/components/InstructorReviewsModal').then(({ InstructorReviewsModal }) => ({
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
  const selectedParticipantId = useCabinetProgressParticipantSelectionStore(
    (state) => state.selectedParticipantId
  );
  const selectedCourseDetailsEnrollmentId = useUiStore(
    (state) => state.selectedCourseDetailsEnrollmentId
  );

  const courses = useCoursesStore((s) => s.courses);
  const { handleBookCourse } = useCourseActions();

  const isAuthModalOpen = useUiStore((s) => s.isAuthModalOpen);
  const setIsAuthModalOpen = useUiStore((s) => s.setIsAuthModalOpen);
  const [hasOpenedAuthModal, setHasOpenedAuthModal] = React.useState(false);
  React.useEffect(() => {
    if (isAuthModalOpen) setHasOpenedAuthModal(true);
  }, [isAuthModalOpen]);
  const selectedInstructor = useUiStore((s) => s.selectedInstructor);
  const setSelectedInstructor = useUiStore((s) => s.setSelectedInstructor);
  const selectedCourseForAuth = useUiStore((s) => s.selectedCourseForAuth);
  const setSelectedCourseForAuth = useUiStore((s) => s.setSelectedCourseForAuth);
  const selectedCourseForDetails = useUiStore((s) => s.selectedCourseForDetails);
  const setSelectedCourseForDetails = useUiStore((s) => s.setSelectedCourseForDetails);
  const reviewsInstructor = useUiStore((s) => s.reviewsInstructor);
  const setReviewsInstructor = useUiStore((s) => s.setReviewsInstructor);
  const reviewPagination = useBookingsStore((state) =>
    reviewsInstructor ? state.reviewPaginationByInstructor[reviewsInstructor.id] : undefined
  );

  const selectedCatalogOperational = useCourseEnrollmentStore((state) =>
    selectedCourseForDetails
      ? lookupCourseCatalogOperational(state.catalogByCourseId, selectedCourseForDetails.id)
      : undefined
  );

  // Explicit enrollment cards carry their own Participant; catalog details use the header.
  const detailsParticipantId = selectedCourseDetailsEnrollmentId
    ? courseEnrollments.find(
        (enrollment) =>
          enrollment.enrollmentId === selectedCourseDetailsEnrollmentId &&
          enrollment.courseId === selectedCourseForDetails?.id
      )?.participantId
    : selectedParticipantId;
  const selectedEnrollment = selectedCourseForDetails
    ? (selectEnrollmentForCourseParticipant({
        enrollments: courseEnrollments,
        courseId: selectedCourseForDetails.id,
        selectedParticipantId: detailsParticipantId,
        enrollmentId: selectedCourseDetailsEnrollmentId,
      }) ??
      (!userProfile
        ? selectActiveGuestCourseEnrollment(courseEnrollments, selectedCourseForDetails.id)
        : undefined))
    : undefined;
  const selectedCourseProgress =
    selectedEnrollment && userProfile
      ? presentStudentCourseProgress(
          selectedEnrollment,
          studentCourseProgressCopyFromLanguage(language === 'ru' ? 'ru' : 'en', t)
        )
      : undefined;

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
            onSuccess={() => setSelectedCourseForDetails(null)}
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
            isEnrolled={Boolean(selectedEnrollment)}
            enrollmentLifecycleStatus={selectedEnrollment?.lifecycleStatus}
            courseProgress={selectedCourseProgress}
            enrollmentSchedule={selectedEnrollment?.courseSchedule}
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
            instructor={
              instructors.find((instructor) => instructor.id === reviewsInstructor.id) ??
              reviewsInstructor
            }
            reviews={reviews}
            hasMore={reviewPagination?.hasMore}
            loadingMore={reviewPagination?.loadingMore}
            onLoadMore={() => {
              void loadMoreCanonicalInstructorReviews(reviewsInstructor.id).catch((error) =>
                logger.error('Canonical instructor review page load failed:', error)
              );
            }}
          />
        </LazyLoad>
      )}

      {/* Keep the loaded modal mounted so its existing exit animation can finish. */}
      {(isAuthModalOpen || hasOpenedAuthModal) && (
        <LazyLoad fallback={isAuthModalOpen ? <ModalLoadingFallback label={t('loading')} /> : null}>
          <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </LazyLoad>
      )}
      <NotificationsPanel />
    </>
  );
};
