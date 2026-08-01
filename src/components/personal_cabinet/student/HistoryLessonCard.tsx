import React from 'react';
import { Booking, Course, Review } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import {
  formatRecentLessonDateLabel,
  getRecentLessonInstructorLabel,
  getRecentLessonTitle,
  isBookingReviewed,
} from './studentCabinetUtils';
import { ScTextButton } from './StudentCabinetUI';
import { LessonRecommendationsList } from '../LessonRecommendationsList';
import { RecommendationIndicator } from '../RecommendationIndicator';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../lib/lessonRecommendations';

interface HistoryLessonCardProps {
  booking: Booking;
  courses: Course[];
  reviews: Review[];
  dismissedReviewIds?: string[];
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
}

export const HistoryLessonCard: React.FC<HistoryLessonCardProps> = ({
  booking,
  courses,
  reviews,
  dismissedReviewIds = [],
  onOpenLesson,
  onWriteReview,
  onToggleRecommendation,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const title = getRecentLessonTitle(booking, courses, lang);
  const dateLabel = formatRecentLessonDateLabel(booking, courses, lang);
  const instructorName = getRecentLessonInstructorLabel(booking, lang);
  const needsReview = !isBookingReviewed(booking, reviews, dismissedReviewIds);
  const review = reviews.find(
    (item) =>
      item.bookingId === booking.id ||
      (item.userId === booking.userId &&
        item.instructorId === booking.instructorId &&
        item.date === booking.date)
  );

  return (
    <article className="space-y-2 py-4">
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <span className="font-medium text-[var(--ink)] flex items-center gap-2 min-w-0 flex-1">
          <span className="break-words min-w-0">{title}</span>
          {hasBookingRecommendations(booking) && (
            <RecommendationIndicator pending={hasPendingRecommendations(booking)} />
          )}
        </span>
        <span className="text-xs text-[var(--ink-dim)] shrink-0">{dateLabel}</span>
      </div>
      <p className="text-sm text-[var(--ink-dim)]">{instructorName}</p>
      {!needsReview && review && (
        <p className="text-amber-500 text-sm">
          {'★'.repeat(review.rating)}
          {'☆'.repeat(5 - review.rating)}
        </p>
      )}
      <LessonRecommendationsList booking={booking} onToggle={onToggleRecommendation} compact />
      {review?.comment && (
        <div className="text-sm space-y-1">
          <p className="text-[var(--ink-dim)]">{t('scCoachReview')}</p>
          <p className="text-[var(--ink)] italic">&ldquo;{review.comment}&rdquo;</p>
        </div>
      )}
      <div className="flex flex-wrap gap-4 pt-1">
        {needsReview && (
          <ScTextButton arrow onClick={() => onWriteReview(booking)}>
            {t('writeReviewBtn')}
          </ScTextButton>
        )}
        <ScTextButton onClick={() => onOpenLesson(booking)}>{t('scMoreDetails')}</ScTextButton>
      </div>
    </article>
  );
};
