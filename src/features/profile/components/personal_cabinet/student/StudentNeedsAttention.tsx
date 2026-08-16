import React, { useMemo } from 'react';
import { Booking, Review } from '../../../../../types';
import { useLanguage } from '../../../../../lib/LanguageContext';
import { getNeedsAttentionBookings, isBookingReviewed } from './studentCabinetUtils';
import { ScDivider, ScSectionTitle, ScTextButton } from './StudentCabinetUI';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { hasPendingRecommendations } from '../../../../../lib/lessonRecommendations';

interface StudentNeedsAttentionProps {
  bookings: Booking[];
  reviews: Review[];
  userId: string;
  dismissedReviewIds?: string[];
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
}

export const StudentNeedsAttention: React.FC<StudentNeedsAttentionProps> = ({
  bookings,
  reviews,
  userId,
  dismissedReviewIds = [],
  onOpenLesson,
  onWriteReview,
  onDismissReview,
}) => {
  const { t } = useLanguage();

  const items = useMemo(
    () => getNeedsAttentionBookings(bookings, reviews, dismissedReviewIds, userId),
    [bookings, reviews, dismissedReviewIds, userId]
  );

  if (items.length === 0) return null;

  return (
    <>
      <ScDivider />
      <section className="py-6 space-y-4">
        <div className="space-y-1">
          <ScSectionTitle>{t('scNeedsAttention')}</ScSectionTitle>
          <p className="text-sm text-[var(--ink-dim)]">{t('scNeedsAttentionSub')}</p>
        </div>
        <ul className="space-y-3">
          {items.map((booking) => {
            const needsReview = !isBookingReviewed(booking, reviews, dismissedReviewIds);
            const pendingRecs = hasPendingRecommendations(booking);

            return (
              <li
                key={booking.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {booking.instructorName}
                    </p>
                    <p className="text-xs text-[var(--ink-dim)]">{booking.date}</p>
                  </div>
                  {pendingRecs && <RecommendationIndicator pending />}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {needsReview && (
                    <>
                      <ScTextButton arrow onClick={() => onWriteReview(booking)}>
                        {t('writeReviewBtn')}
                      </ScTextButton>
                      {onDismissReview && (
                        <button
                          type="button"
                          onClick={() => onDismissReview(booking.id)}
                          className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                        >
                          {t('scDismissReviewPrompt')}
                        </button>
                      )}
                    </>
                  )}
                  {pendingRecs && (
                    <ScTextButton onClick={() => onOpenLesson(booking)}>
                      {t('scHistoryOpenRecommendations')}
                    </ScTextButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
};
