import React from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Booking } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { BodyScrollLock } from '../../../../ui/BodyScrollLock';

interface ChatWindowProps {
  booking: Booking;
  onClose: () => void;
  children: React.ReactNode;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ booking, onClose, children }) => {
  const { t } = useLanguage();

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
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

        {children}
      </div>
    </div>
  );
};
