import React from 'react';
import { Link2, MessageSquare } from 'lucide-react';
import type { Booking, UserProfile } from '../../../../../types';
import { useLanguage, formatLessonDifficultyOrUnspecified } from '../../../../../app/providers/LanguageContext';
import { isCourseBooking } from '../../../../../domain/availability';

interface ActiveSlotDetailsProps {
  booking: Booking;
  usersList: UserProfile[];
  onOpenChat: (booking: Booking) => void;
  onOpenLinkModal: () => void;
}

export const ActiveSlotDetails: React.FC<ActiveSlotDetailsProps> = ({
  booking,
  usersList,
  onOpenChat,
  onOpenLinkModal,
}) => {
  const { t, language } = useLanguage();
  const matchedUser = usersList.find((user) => user.uid === booking.userId);
  const clientDisplayName =
    matchedUser?.displayName ||
    booking.guestName ||
    (booking.isGuest || booking.userId?.startsWith('guest_')
      ? booking.guestName
        ? `${booking.guestName} (${t('guestBadge') || 'Гость'})`
        : t('guestBadge') || 'Гость'
      : t('clientFallback'));

  return (
    <div className="bg-black/5 dark:bg-white/5 p-3.5 rounded-xl border border-[var(--border)] space-y-1.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
        {t('currentDetails')}
      </div>
      <div className="text-xs text-[var(--ink-dim)]">
        <strong>{t('typeLabel')}:</strong>{' '}
        {booking.userId === 'system_block_break'
          ? t('breakLabel')
          : booking.userId === 'system_block_day_off'
            ? t('dayOffLabel')
            : `${t('lessonWithClientPrefix')} (${clientDisplayName})`}
      </div>
      {booking.userId !== 'system_block_break' &&
        booking.userId !== 'system_block_day_off' &&
        !isCourseBooking(booking) && (
          <div className="text-xs text-[var(--ink-dim)]">
            <strong>{t('trainingLevelLabel')}:</strong>{' '}
            {formatLessonDifficultyOrUnspecified(
              booking.difficulty,
              language,
              t('difficultyUnspecified'),
              'short'
            )}
          </div>
        )}
      {(booking.guestPhone || booking.guestEmail) && (
        <div className="text-xs text-[var(--ink-dim)] space-y-0.5 font-mono">
          {booking.guestPhone && (
            <div>
              <strong>{t('phone') || (language === 'ru' ? 'Тел' : 'Phone')}:</strong>{' '}
              <a
                href={`tel:${booking.guestPhone}`}
                className="text-sky-600 dark:text-sky-400 hover:underline"
              >
                {booking.guestPhone}
              </a>
            </div>
          )}
          {booking.guestEmail && (
            <div>
              <strong>Email:</strong>{' '}
              <a
                href={`mailto:${booking.guestEmail}`}
                className="text-sky-600 dark:text-sky-400 hover:underline"
              >
                {booking.guestEmail}
              </a>
            </div>
          )}
        </div>
      )}
      {booking.notes && (
        <div className="text-xs text-[var(--ink-dim)] italic">
          {'"'}
          {booking.notes}
          {'"'}
        </div>
      )}
      {booking.status === 'pending_cancellation' && booking.cancellationReason && (
        <div className="text-xs text-rose-400 font-mono bg-rose-955/20 px-2.5 py-1.5 border border-rose-900/40 mt-1 rounded-none">
          <strong>{t('cancelReasonRequired')}:</strong> {booking.cancellationReason}
        </div>
      )}

      {booking.userId !== 'system_block_break' && booking.userId !== 'system_block_day_off' && (
        <>
          {(booking.isGuest || booking.userId?.startsWith('guest_')) && (
            <button
              type="button"
              onClick={onOpenLinkModal}
              className="w-full mt-2.5 py-2 px-3 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-none text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              {t('linkToClientBtn')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChat(booking)}
            className="w-full mt-2.5 py-2.5 px-3 border border-accent-soft bg-accent-muted hover:bg-accent-muted hover:border-accent text-accent rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            {t('openChatDiscussion')}
          </button>
        </>
      )}
    </div>
  );
};
