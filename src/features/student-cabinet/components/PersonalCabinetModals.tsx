import React, { useEffect, useState } from 'react';
import { Booking, Course, Instructor, Review, UserProfile } from '../../../types';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useTheme } from '../../../hooks/useTheme';
import { LazyLoad } from '../../../ui/LazyLoad';
import { ReviewFlow } from '../../../features/profile';
import { LessonDetailsModal } from './LessonDetailsModal';
import { resolveLessonDetailsBookingForModal } from '../resolveLessonDetailsBooking';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import { queryManagedParticipantLessonFeedback } from '../../participant-lesson-feedback/participantLessonFeedbackService';
import { useParticipantLessonFeedbackStore } from '../../participant-lesson-feedback/participantLessonFeedbackStore';
import { useCabinetProgressParticipantSelectionStore } from '../cabinetProgressParticipantSelectionStore';
import { useManagedParticipantsStore } from '../../lesson-bookings/managedParticipantsStore';
import {
  selectFeedbackForLesson,
  toLessonFeedbackView,
} from '../studentLessonFeedbackPresentation';
import { toggleManagedParticipantLessonFeedbackItem } from '../useSelectedParticipantLessonFeedback';
import { ConfirmActionModal } from './ConfirmActionModal';
import { LevelUpModal } from './LevelUpModal';

const BookingChatModal = React.lazy(() =>
  import('../../../features/bookings').then(({ BookingChatModal }) => ({
    default: BookingChatModal,
  }))
);

interface PersonalCabinetModalsProps {
  userProfile: UserProfile;
  rawBookings: readonly LessonBookingCabinetItem[];
  courses: Course[];
  instructors: Instructor[];
  usersList: UserProfile[];
  reviews: Review[];
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

function CabinetLessonDetails({
  accountId,
  participantId,
  lessonDetailsId,
  rawBookings,
  instructors,
  courses,
  reviews,
  onCloseLessonDetails,
  onWriteReviewFromLesson,
  onToggleRecommendation,
}: Pick<
  PersonalCabinetModalsProps,
  | 'rawBookings'
  | 'instructors'
  | 'courses'
  | 'reviews'
  | 'onCloseLessonDetails'
  | 'onWriteReviewFromLesson'
  | 'onToggleRecommendation'
> & { accountId: string; participantId?: string; lessonDetailsId: string }) {
  const feedbackItems = useParticipantLessonFeedbackStore((state) =>
    participantId ? state.byParticipantId[participantId]?.items : undefined
  );
  const capability = useParticipantLessonFeedbackStore((state) =>
    participantId ? state.completionCapabilityByParticipantId[participantId] : undefined
  );
  const cachedFeedback = participantId
    ? selectFeedbackForLesson(feedbackItems ?? [], participantId, lessonDetailsId)
    : null;
  const [exact, setExact] = useState<ParticipantLessonFeedbackReadModel | null>(null);
  const [retry, setRetry] = useState(0);
  const [pendingExactItemId, setPendingExactItemId] = useState<string>();

  useEffect(() => {
    if (!participantId || cachedFeedback) return;
    let current = true;
    void queryManagedParticipantLessonFeedback({
      participantId,
      lessonBookingId: lessonDetailsId,
    }).then(
      (items) => {
        if (!current) return;
        setExact(selectFeedbackForLesson(items, participantId, lessonDetailsId));
        setPendingExactItemId(undefined);
      },
      () => {
        if (!current) return;
        setExact(null);
        setPendingExactItemId(undefined);
      }
    );
    return () => {
      current = false;
    };
  }, [participantId, lessonDetailsId, cachedFeedback, feedbackItems, retry]);

  const exactFeedback = cachedFeedback ? undefined : (exact ?? undefined);
  const lessonDetailsBooking = resolveLessonDetailsBookingForModal({
    lessonBookingId: lessonDetailsId,
    accountUserId: accountId,
    cabinetBookings: rawBookings,
    instructors,
    exactFeedback,
    feedbackParticipantId: participantId ?? null,
  });
  const toggleExactRecommendation =
    exactFeedback && capability && onToggleRecommendation
      ? (lessonBookingId: string, itemId: string, completed: boolean) => {
          if (pendingExactItemId) return;
          setPendingExactItemId(itemId);
          void toggleManagedParticipantLessonFeedbackItem({
            accountId,
            participantId: exactFeedback.participantId,
            lessonBookingId,
            itemId,
            completed,
            expectedRevision: exactFeedback.revision,
            exercisedCapability: capability,
          })
            .catch(() => undefined)
            .finally(() => setRetry((attempt) => attempt + 1));
        }
      : undefined;

  return (
    <LessonDetailsModal
      booking={lessonDetailsBooking}
      exactFeedback={exactFeedback ? toLessonFeedbackView(exactFeedback) : undefined}
      feedbackParticipantId={participantId ?? null}
      courses={courses}
      onClose={onCloseLessonDetails}
      onWriteReview={onWriteReviewFromLesson}
      onToggleRecommendation={exactFeedback ? toggleExactRecommendation : onToggleRecommendation}
      pendingExactItemId={pendingExactItemId}
      hasReview={
        lessonDetailsBooking ? reviews.some((r) => r.bookingId === lessonDetailsBooking.id) : false
      }
    />
  );
}

export const PersonalCabinetModals: React.FC<PersonalCabinetModalsProps> = ({
  userProfile,
  rawBookings,
  courses,
  instructors,
  usersList,
  reviews,
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

  const participantId = useCabinetProgressParticipantSelectionStore((state) =>
    state.accountId === userProfile.uid ? state.selectedParticipantId : undefined
  );
  const canReadParticipant = useManagedParticipantsStore(
    (state) =>
      state.accountId === userProfile.uid &&
      state.participants.some((participant) => participant.participantId === participantId)
  );
  const managedParticipantId = canReadParticipant ? participantId : undefined;

  return (
    <>
      {lessonDetailsId && (!participantId || canReadParticipant) && (
        <CabinetLessonDetails
          key={JSON.stringify([userProfile.uid, managedParticipantId, lessonDetailsId])}
          accountId={userProfile.uid}
          participantId={managedParticipantId}
          lessonDetailsId={lessonDetailsId}
          rawBookings={rawBookings}
          instructors={instructors}
          courses={courses}
          reviews={reviews}
          onCloseLessonDetails={onCloseLessonDetails}
          onWriteReviewFromLesson={onWriteReviewFromLesson}
          onToggleRecommendation={onToggleRecommendation}
        />
      )}

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
            <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center type-caption uppercase text-white">
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
          />
        </LazyLoad>
      )}

      {levelUpModal?.show && (
        <LevelUpModal level={levelUpModal.level} theme={theme} onClose={onCloseLevelUp} />
      )}
    </>
  );
};
