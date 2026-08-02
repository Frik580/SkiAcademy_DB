import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Star, X } from 'lucide-react';
import { Booking } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';

interface ReviewModalProps {
  booking: Booking | null;
  rating: number;
  setRating: (value: number) => void;
  comment: string;
  setComment: (value: string) => void;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  booking,
  rating,
  setRating,
  comment,
  setComment,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const { t } = useLanguage();

  if (!booking) return null;

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="ui-modal shadow-2xl w-full max-w-sm overflow-hidden relative rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5">
          <h4 className="font-serif text-sm font-light text-[var(--ink)]">
            {t('reviewAbout')} {booking.instructorName}
          </h4>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5 text-center">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('rateInstructor')}
            </label>
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 hover:scale-110 transition cursor-pointer"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200 dark:text-slate-700'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
              {t('yourFeedback')}
            </label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('reviewDetailPlaceholder')}
              className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-20 resize-none rounded-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              t('postInstructorReview')
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
