import React from 'react';
import { Booking, Review } from '../../../types';
import { ReviewModal } from '../../../features/profile/components/personal_cabinet/ReviewModal';
import { useNotifications } from '../../../features/notifications';
import { useLanguage } from '../../../lib/LanguageContext';

export interface ReviewFlowProps {
  reviewBooking: Booking | null;
  reviewRating: number;
  setReviewRating: (rating: number) => void;
  reviewComment: string;
  setReviewComment: (comment: string) => void;
  isSubmittingReview: boolean;
  onCloseReview: () => void;
  onSubmitReview: (e: React.FormEvent) => void | Promise<void>;
}

export interface UseReviewFlowParams {
  onAddReview: (
    newReview: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
}

export function useReviewFlow({ onAddReview }: UseReviewFlowParams) {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();

  const [reviewBooking, setReviewBooking] = React.useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = React.useState<number>(5);
  const [reviewComment, setReviewComment] = React.useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = React.useState<boolean>(false);

  const openReview = React.useCallback((booking: Booking) => {
    setReviewBooking(booking);
    setReviewComment('');
    setReviewRating(5);
  }, []);

  const closeReview = React.useCallback(() => {
    setReviewBooking(null);
    setReviewComment('');
    setReviewRating(5);
  }, []);

  const handleSubmitReview = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!reviewBooking) return;

      if (!reviewComment.trim()) {
        addNotification('warning', t('reviewEmpty'), t('reviewEmptyDesc'));
        return;
      }

      setIsSubmittingReview(true);
      try {
        await onAddReview({
          instructorId: reviewBooking.instructorId,
          rating: reviewRating,
          comment: reviewComment.trim(),
          bookingId: reviewBooking.id,
        });
        addNotification('success', t('reviewShared'), t('reviewSharedDesc'));
        closeReview();
      } catch {
        addNotification('error', t('reviewFailed'), t('reviewFailedDesc'));
      } finally {
        setIsSubmittingReview(false);
      }
    },
    [reviewBooking, reviewComment, reviewRating, onAddReview, addNotification, t, closeReview]
  );

  return {
    reviewBooking,
    reviewRating,
    setReviewRating,
    reviewComment,
    setReviewComment,
    isSubmittingReview,
    openReview,
    closeReview,
    handleSubmitReview,
  };
}

export const ReviewFlow: React.FC<ReviewFlowProps> = ({
  reviewBooking,
  reviewRating,
  setReviewRating,
  reviewComment,
  setReviewComment,
  isSubmittingReview,
  onCloseReview,
  onSubmitReview,
}) => {
  return (
    <ReviewModal
      booking={reviewBooking}
      rating={reviewRating}
      setRating={setReviewRating}
      comment={reviewComment}
      setComment={setReviewComment}
      isSubmitting={isSubmittingReview}
      onClose={onCloseReview}
      onSubmit={onSubmitReview}
    />
  );
};
