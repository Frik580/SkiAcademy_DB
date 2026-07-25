import React from 'react';
import { Booking } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { Bell, X } from 'lucide-react';

interface UnreviewedCompletedBookingsNoticeProps {
  unreviewedCompletedBookings: Booking[];
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
}

export const UnreviewedCompletedBookingsNotice: React.FC<
  UnreviewedCompletedBookingsNoticeProps
> = ({ unreviewedCompletedBookings, onWriteReview, onDismissReview }) => {
  const { t } = useLanguage();

  if (!unreviewedCompletedBookings || unreviewedCompletedBookings.length === 0) {
    return null;
  }

  return (
    <div className="border surface-accent p-4 space-y-3 animate-fade-in w-full min-w-0 max-w-full overflow-hidden rounded-xs shadow-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Bell className="w-4 h-4 text-accent" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
        </div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
          {t('newNotifications')} ({unreviewedCompletedBookings.length})
        </h4>
      </div>
      <div className="space-y-2">
        {unreviewedCompletedBookings.map((inv) => (
          <div
            key={inv.id}
            id={`review-invitation-card-${inv.id}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card-bg)] p-3 rounded-xs border border-slate-200/70 dark:border-slate-800/70 hover:border-accent-soft transition duration-200 w-full min-w-0"
          >
            <div className="flex items-center gap-3 min-w-0 w-full">
              <img
                src={inv.instructorAvatar}
                alt={inv.instructorName}
                className="w-8.5 h-8.5 rounded-full object-cover shrink-0 filter grayscale"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-sans text-[var(--ink)] leading-relaxed break-words">
                  {t('reviewInvitationPrefix')}{' '}
                  <span className="font-bold">{inv.instructorName}</span>{' '}
                  {t('reviewInvitationSuffix')}
                </p>
                <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block mt-1">
                  {inv.date} • {inv.time}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                id={`notify-review-btn-${inv.id}`}
                onClick={() => onWriteReview(inv)}
                className="shrink-0 text-[9px] font-mono uppercase tracking-widest bg-[var(--ink)] hover:bg-[var(--ink)]/80 text-[var(--bg)] px-3 py-1.5 rounded-xs font-bold cursor-pointer transition shadow-xs"
              >
                🌟 {t('writeReviewBtn')}
              </button>
              {onDismissReview && (
                <button
                  onClick={() => onDismissReview(inv.id)}
                  className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xs transition cursor-pointer"
                  title={t('hide')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
