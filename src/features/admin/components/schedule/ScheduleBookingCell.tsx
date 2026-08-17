import React from 'react';
import { Calendar, Clock, Coffee, X } from 'lucide-react';
import { getDifficultyLabel } from '../../../../app/providers/LanguageContext';
import { isCourseBooking } from '../../../../domain/availability';
import type { ScheduleBooking, ScheduleClient, ScheduleInstructor } from './scheduleContracts';
import { useScheduleTranslations } from './useScheduleTranslations';

interface ScheduleBookingCellProps {
  booking: ScheduleBooking;
  instructor: ScheduleInstructor;
  usersList: ScheduleClient[];
  onOpen: (instructor: ScheduleInstructor, time: string, booking: ScheduleBooking) => void;
  onDelete: (id: string) => void;
}

export const ScheduleBookingCell: React.FC<ScheduleBookingCellProps> = ({
  booking,
  instructor,
  usersList,
  onOpen,
  onDelete,
}) => {
  const { t, language } = useScheduleTranslations();
  const client = usersList.find((user) => user.uid === booking.userId);

  if (booking.userId === 'system_block_day_off') {
    return (
      <div className="relative group/cell h-11 bg-slate-100/50 dark:bg-slate-800/15 border border-slate-300/40 dark:border-slate-800/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-650" />
          <span className="truncate">{t('dayOffLabel')}</span>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(booking.id);
          }}
          className="text-slate-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
          title={t('cancelDayOff')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (booking.userId === 'system_block_break') {
    return (
      <div className="relative group/cell h-11 bg-amber-50/60 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-amber-700 dark:text-amber-400">
        <div className="flex items-center gap-1.5 min-w-0">
          <Coffee className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-600" />
          <span className="truncate">{booking.notes || t('breakLabel')}</span>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(booking.id);
          }}
          className="text-amber-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
          title={t('cancelBreak')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const isPendingCancellation = booking.status === 'pending_cancellation';
  const isCompleted = booking.status === 'completed';
  let cardBgClasses =
    'bg-accent-muted border border-accent-soft hover:border-accent text-[var(--ink)]';
  let titleColorClasses = 'text-accent';
  let buttonColorClasses = 'text-accent hover:text-red-500';
  let textTimeClasses = 'text-accent';

  if (isPendingCancellation) {
    cardBgClasses =
      'bg-rose-50/60 dark:bg-rose-950/15 border border-rose-250/45 dark:border-rose-900/40 hover:border-rose-400 dark:hover:border-rose-700 text-rose-950 dark:text-rose-200 animate-pulse';
    titleColorClasses = 'text-rose-900 dark:text-rose-300 font-semibold';
    buttonColorClasses = 'text-rose-400 hover:text-red-500';
    textTimeClasses = 'text-rose-600 dark:text-rose-400';
  } else if (isCompleted) {
    cardBgClasses =
      'bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-250/45 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700 text-emerald-950 dark:text-emerald-200';
    titleColorClasses =
      'text-emerald-900 dark:text-emerald-300 line-through decoration-emerald-200/50 dark:decoration-emerald-800/40';
    buttonColorClasses = 'text-emerald-400 hover:text-red-500';
    textTimeClasses = 'text-emerald-650 dark:text-emerald-400';
  }

  return (
    <div
      onClick={() => onOpen(instructor, booking.time, booking)}
      className={`relative group/cell h-11 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer ${cardBgClasses}`}
    >
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className={`font-bold truncate flex items-center gap-1.5 ${titleColorClasses}`}>
          {client?.avatarUrl && (
            <img
              src={client.avatarUrl}
              alt={client.displayName}
              className="w-4 h-4 rounded-none border border-black/10 shrink-0"
            />
          )}
          <span className="truncate">
            {client?.displayName ||
              booking.guestName ||
              (booking.isGuest || booking.userId?.startsWith('guest_')
                ? booking.guestName || t('guestBadge')
                : null) ||
              booking.notes ||
              t('clientLesson')}
          </span>
          {isPendingCancellation && (
            <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
              ({t('cancelReqShort')})
            </span>
          )}
          {isCompleted && (
            <span className="ml-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
              ✓ ({t('doneShort')})
            </span>
          )}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(booking.id);
          }}
          className={`opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer ${buttonColorClasses}`}
          title={t('cancelBookingAdmin')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 min-w-0 ${textTimeClasses}`}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          {booking.time} ({booking.durationHours}h)
          {!isCourseBooking(booking) && (
            <>
              {' '}
              {' · '}
              {getDifficultyLabel(booking.difficulty, language, 'short')}
            </>
          )}
        </span>
      </div>
    </div>
  );
};
