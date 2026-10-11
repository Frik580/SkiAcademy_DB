import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import React, { useMemo } from 'react';
import { Booking, Review } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { getNeedsAttentionBookings, isBookingReviewed } from './studentCabinetUtils';
import { isReviewEligibleLessonStatus } from '../../../../domain/booking';
import { ScDivider, ScTextButton } from './StudentCabinetUI';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { StudentDashboardTile } from './StudentDashboardTile';
import {
  STUDENT_DASHBOARD_TILES,
  type DashboardTileSize,
} from '../../../settings/studentDashboardLayout';
import {
  formatLessonFeedbackDateLabel,
  type LessonFeedbackView,
} from '../../studentLessonFeedbackPresentation';
import './studentNeedsAttention.css';

export interface NeedsAttentionFeedbackItem {
  readonly view: LessonFeedbackView;
}

interface StudentNeedsAttentionProps {
  dashboardSize?: DashboardTileSize;
  /** Account-authorized source for review prompts. */
  reviewBookings?: Booking[];
  /** Selected-participant source for recommendation actions. */
  bookings: Booking[];
  reviews: Review[];
  userId: string;
  dismissedReviewIds?: string[];
  pendingFeedback: readonly LessonFeedbackView[];
  onOpenLesson: (booking: Booking) => void;
  onOpenFeedbackLesson: (lessonBookingId: string) => void;
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
}

type NeedsAttentionRow = {
  readonly id: string;
  readonly instructorName: string;
  readonly dateLabel: string;
  readonly reviewBooking?: Booking;
  readonly feedbackBooking?: Booking;
  readonly needsReview: boolean;
  readonly hasPendingFeedback: boolean;
};

export const StudentNeedsAttention: React.FC<StudentNeedsAttentionProps> = ({
  dashboardSize,
  bookings,
  reviewBookings = bookings,
  reviews,
  userId,
  dismissedReviewIds = [],
  pendingFeedback,
  onOpenLesson,
  onOpenFeedbackLesson,
  onWriteReview,
  onDismissReview,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const items = useMemo(() => {
    const eligibleReviewBookings = getNeedsAttentionBookings(
      reviewBookings,
      reviews,
      dismissedReviewIds,
      userId
    );
    const rows = new Map<string, NeedsAttentionRow>();
    for (const booking of eligibleReviewBookings) {
      rows.set(booking.id, {
        id: booking.id,
        instructorName: booking.instructorName,
        dateLabel: booking.date,
        reviewBooking: booking,
        needsReview:
          isReviewEligibleLessonStatus(booking.status) &&
          !isBookingReviewed(booking, reviews, dismissedReviewIds),
        hasPendingFeedback: false,
      });
    }
    for (const feedback of pendingFeedback) {
      const existing = rows.get(feedback.lessonBookingId);
      const dateLabel =
        formatLessonFeedbackDateLabel(feedback.lessonDate, lang) ||
        feedback.lessonDate ||
        existing?.dateLabel ||
        '';
      const feedbackBooking = bookings.find((booking) => booking.id === feedback.lessonBookingId);
      if (existing) {
        rows.set(feedback.lessonBookingId, {
          ...existing,
          feedbackBooking,
          hasPendingFeedback: true,
          dateLabel: existing.dateLabel || dateLabel,
          instructorName: existing.instructorName || feedback.instructorName || '',
        });
        continue;
      }
      rows.set(feedback.lessonBookingId, {
        id: feedback.lessonBookingId,
        instructorName: feedback.instructorName || '',
        dateLabel,
        feedbackBooking,
        needsReview: false,
        hasPendingFeedback: true,
      });
    }
    return [...rows.values()]
      .sort((left, right) => right.dateLabel.localeCompare(left.dateLabel))
      .slice(0, 5);
  }, [bookings, dismissedReviewIds, lang, pendingFeedback, reviewBookings, reviews, userId]);

  if (items.length === 0) return null;

  return (
    <StudentDashboardTile tileKey={STUDENT_DASHBOARD_TILES.needsAttention.key} size={dashboardSize}>
      {!dashboardSize && <ScDivider />}
      <section className="sc-needs-attention">
        <StudentDashboardTileHeader title={t('scNeedsAttention')} />
        <StudentDashboardTileBody>
          <p className="sc-attention-subtitle">{t('scNeedsAttentionSub')}</p>
          <ul className="sc-attention-list">
            {items.map((item) => (
              <li key={item.id} data-attention-lesson={item.id} className="sc-attention-row">
                <div className="sc-attention-metadata">
                  <div>
                    {item.instructorName && (
                      <p className="sc-attention-instructor">{item.instructorName}</p>
                    )}
                    {item.dateLabel && <p className="sc-attention-date">{item.dateLabel}</p>}
                  </div>
                  {item.hasPendingFeedback && <RecommendationIndicator pending />}
                </div>
                <div className="sc-attention-actions">
                  {item.needsReview && item.reviewBooking && (
                    <>
                      <ScTextButton
                        className="sc-attention-review"
                        onClick={() => onWriteReview(item.reviewBooking!)}
                      >
                        {t('writeReviewBtn')}
                      </ScTextButton>
                      {onDismissReview && (
                        <button
                          type="button"
                          onClick={() => onDismissReview(item.reviewBooking!.id)}
                          className="sc-attention-dismiss"
                        >
                          {t('scDismissReviewPrompt')}
                        </button>
                      )}
                    </>
                  )}
                  {item.hasPendingFeedback && (
                    <ScTextButton
                      className="sc-attention-recommendations"
                      onClick={() => {
                        if (item.feedbackBooking) onOpenLesson(item.feedbackBooking);
                        else onOpenFeedbackLesson(item.id);
                      }}
                    >
                      {t('scHistoryOpenRecommendations')}
                    </ScTextButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </StudentDashboardTileBody>
      </section>
    </StudentDashboardTile>
  );
};
