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

export interface NeedsAttentionFeedbackItem {
  readonly view: LessonFeedbackView;
}

interface StudentNeedsAttentionProps {
  dashboardSize?: DashboardTileSize;
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
  readonly booking?: Booking;
  readonly needsReview: boolean;
  readonly hasPendingFeedback: boolean;
};

export const StudentNeedsAttention: React.FC<StudentNeedsAttentionProps> = ({
  dashboardSize,
  bookings,
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
    const reviewBookings = getNeedsAttentionBookings(bookings, reviews, dismissedReviewIds, userId);
    const rows = new Map<string, NeedsAttentionRow>();
    for (const booking of reviewBookings) {
      rows.set(booking.id, {
        id: booking.id,
        instructorName: booking.instructorName,
        dateLabel: booking.date,
        booking,
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
      if (existing) {
        rows.set(feedback.lessonBookingId, {
          ...existing,
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
        booking: bookings.find((booking) => booking.id === feedback.lessonBookingId),
        needsReview: false,
        hasPendingFeedback: true,
      });
    }
    return [...rows.values()]
      .sort((left, right) => right.dateLabel.localeCompare(left.dateLabel))
      .slice(0, 5);
  }, [bookings, dismissedReviewIds, lang, pendingFeedback, reviews, userId]);

  if (items.length === 0) return null;

  return (
    <StudentDashboardTile tileKey={STUDENT_DASHBOARD_TILES.needsAttention.key} size={dashboardSize}>
      {!dashboardSize && <ScDivider />}
      <section>
        <StudentDashboardTileHeader title={t('scNeedsAttention')} />
        <StudentDashboardTileBody>
          <p className="mb-4 text-sm text-[var(--ink-dim)]">{t('scNeedsAttentionSub')}</p>
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-4 py-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.instructorName}</p>
                    <p className="text-xs text-[var(--ink-dim)]">{item.dateLabel}</p>
                  </div>
                  {item.hasPendingFeedback && <RecommendationIndicator pending />}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {item.needsReview && item.booking && (
                    <>
                      <ScTextButton arrow onClick={() => onWriteReview(item.booking!)}>
                        {t('writeReviewBtn')}
                      </ScTextButton>
                      {onDismissReview && (
                        <button
                          type="button"
                          onClick={() => onDismissReview(item.booking!.id)}
                          className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                        >
                          {t('scDismissReviewPrompt')}
                        </button>
                      )}
                    </>
                  )}
                  {item.hasPendingFeedback && (
                    <ScTextButton
                      onClick={() => {
                        if (item.booking) onOpenLesson(item.booking);
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
