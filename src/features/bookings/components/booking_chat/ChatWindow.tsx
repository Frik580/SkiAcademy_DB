import React from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Booking } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { BodyScrollLock } from '../../../../ui/BodyScrollLock';
import { hasBookingRecommendations } from '../../../../lib/lessonRecommendations';
import { LessonRecommendationsList } from '../../../../features/profile';

interface ChatWindowProps {
  booking: Booking;
  onClose: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  children: React.ReactNode;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  booking,
  onClose,
  onToggleRecommendation,
  children,
}) => {
  const { t } = useLanguage();

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <BodyScrollLock />
      <div className="ui-modal shadow-2xl w-full max-w-lg h-[550px] max-h-[80vh] flex flex-col overflow-hidden relative rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-accent-muted border border-accent text-accent">
              <MessageSquare className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-serif text-sm font-medium text-[var(--ink)] truncate">
                {t('chatDiscussionTitle')}
              </h4>
              <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] truncate mt-0.5">
                {t('lessonWith')} {booking.instructorName} • {booking.date} @ {booking.time}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
            title={t('closeBtn')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasBookingRecommendations(booking) && (
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 max-h-[min(30svh,180px)] overflow-y-auto">
            <LessonRecommendationsList booking={booking} onToggle={onToggleRecommendation} />
          </div>
        )}

        {children}
      </div>
    </div>
  );
};
