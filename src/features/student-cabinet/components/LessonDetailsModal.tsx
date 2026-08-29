import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Star } from 'lucide-react';
import { Booking } from '../../../types';
import { useLanguage, formatShortBookingDate } from '../../../app/providers/LanguageContext';
import { getDifficultyShort, formatBookingDayMonth } from './student/studentCabinetUtils';
import { LessonRecommendationsList } from './LessonRecommendationsList';
import { Course } from '../../../types';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';

interface LessonDetailsModalProps {
  booking: Booking | null;
  courses: Course[];
  onClose: () => void;
  onWriteReview?: (booking: Booking) => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  hasReview?: boolean;
}

export const LessonDetailsModal: React.FC<LessonDetailsModalProps> = ({
  booking,
  courses,
  onClose,
  onWriteReview,
  onToggleRecommendation,
  hasReview,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  if (!booking) return null;

  const dateLabel = formatBookingDayMonth(booking, courses, lang);
  const shortDate = formatShortBookingDate(booking, language, courses);
  const modalTitle = t('scLessonDetails');
  const modalSubtitle = getDifficultyShort(booking.difficulty);

  return createPortal(
    <AnimatePresence>
      <div
        key="lesson-details-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      >
        <BodyScrollLock />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="ui-modal-overlay fixed inset-0"
          aria-hidden
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="ui-modal relative w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl z-10 rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] my-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 z-10">
            <div className="min-w-0 pr-2">
              <h3 className="text-lg font-serif font-light text-[var(--ink)] truncate">
                {modalTitle}
              </h3>
              <p className="text-xs text-[var(--ink-dim)] mt-0.5">{t('scLessonDetails')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
              aria-label={t('closeBtn')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div className="space-y-1">
              <p className="text-xs tracking-widest uppercase text-[var(--ink-dim)]">
                {modalSubtitle}
              </p>
              <p className="text-base text-[var(--ink)]">{dateLabel || shortDate}</p>
              <p className="text-sm text-[var(--ink-dim)]">{booking.instructorName}</p>
            </div>

            {(booking.recommendations?.length ?? 0) > 0 ? (
              <LessonRecommendationsList booking={booking} onToggle={onToggleRecommendation} />
            ) : (
              <p className="text-sm text-[var(--ink-dim)]">{t('scNoRecommendations')}</p>
            )}

            {onWriteReview && !hasReview && booking.status === 'completed' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onWriteReview(booking);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--accent)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--profile-bg)] transition"
              >
                <Star className="w-4 h-4" />
                {t('writeReviewBtn')}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
