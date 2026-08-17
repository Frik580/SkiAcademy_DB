import React from 'react';
import { Booking, Course, Instructor, Review, UserProfile } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { useTheme } from '../../../hooks/useTheme';
import { LazyLoad } from '../../../ui/LazyLoad';
import { RescheduleModal } from './RescheduleModal';
import { ReviewFlow } from '../../../features/profile/components/ReviewFlow';
import { LessonDetailsModal } from './LessonDetailsModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { LevelUpModal } from './LevelUpModal';

const BookingChatModal = React.lazy(() =>
  import('../../../features/bookings').then(({ BookingChatModal }) => ({
    default: BookingChatModal,
  }))
);

interface PersonalCabinetModalsProps {
  userProfile: UserProfile;
  rawBookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
  reviews: Review[];
  reschedule: {
    isOpen: boolean;
    onClose: () => void;
    newDate: string;
    setNewDate: (value: string) => void;
    newTime: string;
    setNewTime: (value: string) => void;
    availableSlots: string[];
    isLoadingSlots: boolean;
    isSubmitting: boolean;
    minDate: string;
    onSubmit: (e: React.FormEvent) => void;
  };
  lessonDetailsId: string | null;
  onCloseLessonDetails: () => void;
  onWriteReviewFromLesson: (booking: Booking) => void;
  onToggleRecommendation?: (
    bookingId: string,
    recommendationId: string,
    checked: boolean
  ) => Promise<void>;
  reviewBooking: Booking | null;
  reviewRating: number;
  setReviewRating: (value: number) => void;
  reviewComment: string;
  setReviewComment: (value: string) => void;
  isSubmittingReview: boolean;
  onCloseReview: () => void;
  onSubmitReview: (e: React.FormEvent) => void;
  confirmModal: {
    message: string;
    showReasonInput?: boolean;
    onConfirm: (reason?: string) => void | Promise<void>;
  } | null;
  cancelReason: string;
  setCancelReason: (value: string) => void;
  onCloseConfirm: () => void;
  onConfirmAction: (reason?: string) => Promise<void>;
  selectedChatBooking: Booking | null;
  onCloseChat: () => void;
  levelUpModal: { show: boolean; level: number } | null;
  onCloseLevelUp: () => void;
}

export const PersonalCabinetModals: React.FC<PersonalCabinetModalsProps> = ({
  userProfile,
  rawBookings,
  courses,
  instructors,
  usersList,
  reviews,
  reschedule,
  lessonDetailsId,
  onCloseLessonDetails,
  onWriteReviewFromLesson,
  onToggleRecommendation,
  reviewBooking,
  reviewRating,
  setReviewRating,
  reviewComment,
  setReviewComment,
  isSubmittingReview,
  onCloseReview,
  onSubmitReview,
  confirmModal,
  cancelReason,
  setCancelReason,
  onCloseConfirm,
  onConfirmAction,
  selectedChatBooking,
  onCloseChat,
  levelUpModal,
  onCloseLevelUp,
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();

  const lessonDetailsBooking = rawBookings.find((b) => b.id === lessonDetailsId) ?? null;

  return (
    <>
      <RescheduleModal
        isOpen={reschedule.isOpen}
        onClose={reschedule.onClose}
        newDate={reschedule.newDate}
        setNewDate={reschedule.setNewDate}
        newTime={reschedule.newTime}
        setNewTime={reschedule.setNewTime}
        availableSlots={reschedule.availableSlots}
        isLoadingSlots={reschedule.isLoadingSlots}
        isSubmitting={reschedule.isSubmitting}
        minDate={reschedule.minDate}
        onSubmit={reschedule.onSubmit}
      />

      <LessonDetailsModal
        booking={lessonDetailsBooking}
        courses={courses}
        onClose={onCloseLessonDetails}
        onWriteReview={onWriteReviewFromLesson}
        onToggleRecommendation={onToggleRecommendation}
        hasReview={
          lessonDetailsBooking
            ? reviews.some(
                (r) =>
                  r.bookingId === lessonDetailsBooking.id ||
                  (r.userId === userProfile.uid &&
                    r.instructorId === lessonDetailsBooking.instructorId &&
                    r.date === lessonDetailsBooking.date)
              )
            : false
        }
      />

      <ReviewFlow
        reviewBooking={reviewBooking}
        reviewRating={reviewRating}
        setReviewRating={setReviewRating}
        reviewComment={reviewComment}
        setReviewComment={setReviewComment}
        isSubmittingReview={isSubmittingReview}
        onCloseReview={onCloseReview}
        onSubmitReview={onSubmitReview}
      />

      {confirmModal && (
        <ConfirmActionModal
          message={confirmModal.message}
          showReasonInput={confirmModal.showReasonInput}
          reason={cancelReason}
          setReason={setCancelReason}
          onCancel={onCloseConfirm}
          onConfirm={onConfirmAction}
        />
      )}

      {selectedChatBooking && (
        <LazyLoad
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 font-mono text-[10px] uppercase tracking-wider text-white">
              {t('loading')}
            </div>
          }
        >
          <BookingChatModal
            booking={selectedChatBooking}
            currentUserProfile={userProfile}
            onClose={onCloseChat}
            instructors={instructors}
            courses={courses}
            usersList={usersList}
            onToggleRecommendation={onToggleRecommendation}
          />
        </LazyLoad>
      )}

      {levelUpModal?.show && (
        <LevelUpModal level={levelUpModal.level} theme={theme} onClose={onCloseLevelUp} />
      )}
    </>
  );
};
