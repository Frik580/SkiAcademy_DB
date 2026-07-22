import React, { useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  MessageSquare,
  Trash2,
  X,
} from 'lucide-react';
import { Booking } from '../../types';
import {
  useLanguage,
  parseCourseDates,
  splitCourseDates,
  getGroupScheduleLabel,
  MONTHS_EN,
  MONTHS_RU,
  WEEKDAYS_EN,
  WEEKDAYS_RU,
  getBookingStatusLabel,
  getDifficultyLabel,
} from '../../lib/LanguageContext';

interface ClientBookingsListProps {
  userBookings: Booking[];
  unreviewedCompletedBookings: Booking[];
  onDismissReview?: (bookingId: string) => void;
  onWriteReview: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
}

export const ClientBookingsList: React.FC<ClientBookingsListProps> = ({
  userBookings,
  unreviewedCompletedBookings,
  onDismissReview,
  onWriteReview,
  onReschedule,
  onCancel,
  onChat,
}) => {
  const { language, t } = useLanguage();

  const [hideCancelled, setHideCancelled] = useState<boolean>(() => {
    const saved = localStorage.getItem('alpine_glide_hide_cancelled_bookings');
    return saved === 'true';
  });

  const [hideCalendars, setHideCalendars] = useState<boolean>(() => {
    const saved = localStorage.getItem('alpine_glide_hide_calendars');
    return saved === 'true';
  });

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const upcoming = userBookings.find((b) => b.status === 'confirmed');
    if (upcoming) {
      const d = new Date(upcoming.date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const handleToggleHideCancelled = (val: boolean) => {
    setHideCancelled(val);
    localStorage.setItem('alpine_glide_hide_cancelled_bookings', String(val));
  };

  const handleToggleHideCalendars = (val: boolean) => {
    setHideCalendars(val);
    localStorage.setItem('alpine_glide_hide_calendars', String(val));
  };

  const filteredBookings = useMemo(() => {
    return userBookings.filter((b) => {
      if (hideCancelled && b.status === 'cancelled') return false;
      return true;
    });
  }, [userBookings, hideCancelled]);

  const getBookingsOnDate = (dateStr: string) => {
    return filteredBookings.filter((b) => {
      if (b.instructorId.startsWith('course_')) {
        const { start, end } = parseCourseDates(b.date);
        const checkDate = new Date(dateStr);
        const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        const currentDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
        return currentDate >= startDate && currentDate <= endDate;
      }
      return b.date === dateStr;
    });
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayIndex = (() => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  })();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) daysArray.push(null);
  for (let d = 1; d <= daysInMonth; d++) daysArray.push(d);

  const formatDateStr = (dayNum: number) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const displayedBookings = selectedDateFilter
    ? getBookingsOnDate(selectedDateFilter)
    : filteredBookings;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
        <div>
          <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
            {t('yourSlopesCalendar')}
          </h3>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
            {t('manageLessonsSub')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {userBookings.length > 0 && (
            <div className="flex items-center gap-2 border border-[var(--border)] px-3 py-1.5 bg-[var(--card-bg)]">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideCalendars}
                  onChange={(e) => handleToggleHideCalendars(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-[var(--border)] peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-4 peer-checked:after:border-transparent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--ink)] after:rounded-none after:h-3 after:w-3.5 after:transition-all peer-checked:bg-[var(--ink)] peer-checked:after:bg-[var(--bg)]"></div>
                <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('hideCalendar')}
                </span>
              </label>
            </div>
          )}

          {userBookings.some((b) => b.status === 'cancelled') && (
            <div className="flex items-center gap-2 border border-[var(--border)] px-3 py-1.5 bg-[var(--card-bg)]">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideCancelled}
                  onChange={(e) => handleToggleHideCancelled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-[var(--border)] peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-4 peer-checked:after:border-transparent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--ink)] after:rounded-none after:h-3 after:w-3.5 after:transition-all peer-checked:bg-[var(--ink)] peer-checked:after:bg-[var(--bg)]"></div>
                <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('hideCancelled')}
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {unreviewedCompletedBookings.length > 0 && (
        <div className="border border-indigo-200 dark:border-indigo-500/30 p-4 space-y-3 bg-indigo-50/70 dark:bg-indigo-950/20 animate-fade-in w-full min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-none animate-ping" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-none" />
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
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card-bg)] p-3 rounded-none border border-[var(--border)] hover:border-[var(--ink)] transition duration-200 w-full min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0 w-full">
                  <img
                    src={inv.instructorAvatar}
                    alt={inv.instructorName}
                    className="w-8.5 h-8.5 rounded-none object-cover shrink-0 border border-[var(--border)] filter grayscale"
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
                    className="shrink-0 text-[9px] font-mono uppercase tracking-widest bg-[var(--ink)] hover:bg-[var(--ink)]/80 text-[var(--bg)] px-3 py-1.5 rounded-none font-bold cursor-pointer transition"
                  >
                    🌟 {t('writeReviewBtn')}
                  </button>
                  {onDismissReview && (
                    <button
                      onClick={() => onDismissReview(inv.id)}
                      className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/20 rounded-none transition cursor-pointer"
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
      )}

      {userBookings.length > 0 && !hideCalendars && (
        <div className="border border-[var(--border)] p-4 rounded-none bg-black/10 space-y-3 w-full min-w-0 max-w-full overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap w-full min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] font-bold flex items-center gap-1.5 break-words">
              📅 {t('interactiveCalendar')}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentMonth((prev) => {
                  const next = new Date(prev);
                  next.setMonth(next.getMonth() - 1);
                  return next;
                })}
                className="p-1 hover:bg-black/20 rounded-none text-[var(--ink)] transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono uppercase tracking-wider min-w-[100px] text-center text-[var(--ink)]">
                {language === 'ru' ? MONTHS_RU[month] : MONTHS_EN[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setCurrentMonth((prev) => {
                  const next = new Date(prev);
                  next.setMonth(next.getMonth() + 1);
                  return next;
                })}
                className="p-1 hover:bg-black/20 rounded-none text-[var(--ink)] transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] pb-1 border-b border-[var(--border)]">
            {(language === 'ru' ? WEEKDAYS_RU : WEEKDAYS_EN).map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-8" />;
              }

              const dateStr = formatDateStr(day);
              const dayBookings = getBookingsOnDate(dateStr);
              const isSelected = selectedDateFilter === dateStr;
              const hasCourse = dayBookings.some((b) => b.instructorId.startsWith('course_'));
              const hasLesson = dayBookings.some((b) => !b.instructorId.startsWith('course_'));

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => {
                    if (hasCourse || hasLesson) {
                      setSelectedDateFilter(isSelected ? null : dateStr);
                    }
                  }}
                  className={`h-9 flex flex-col items-center justify-center rounded-none transition text-[10px] font-mono relative cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--ink)] text-[var(--bg)] font-bold'
                      : hasCourse
                      ? 'border border-violet-500 text-violet-200 bg-violet-950/40 font-bold hover:bg-violet-950/60 cursor-pointer'
                      : hasLesson
                      ? 'border border-[var(--ink)] text-[var(--ink)] bg-black/20 font-bold hover:bg-black/30 cursor-pointer'
                      : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--border)] border border-transparent cursor-default'
                  }`}
                >
                  <span>{day}</span>
                  {hasLesson && !isSelected && (
                    <span className="w-1 h-1 bg-[var(--ink)] rounded-none absolute bottom-1.5" />
                  )}
                  {hasCourse && !isSelected && (
                    <span className="w-1 h-1 bg-violet-400 rounded-none absolute bottom-1.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!hideCalendars && (
        <>
          {selectedDateFilter && (
            <div className="flex items-center justify-between border border-[var(--border)] bg-black/25 px-3 py-2 rounded-none">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                {t('showingLessonsFor')} {selectedDateFilter}
              </span>
              <button
                onClick={() => setSelectedDateFilter(null)}
                className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                {t('showAll')}
              </button>
            </div>
          )}

          {userBookings.length === 0 ? (
            <div className="py-16 text-center border border-[var(--border)] bg-black/10">
              <Calendar className="w-8 h-8 text-[var(--ink-dim)] mx-auto mb-3" />
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] leading-relaxed">
                {t('noSessionsScheduledYet')}
              </p>
              <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] opacity-70 mt-1">
                {t('browseInstructorsHint')}
              </p>
            </div>
          ) : displayedBookings.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[var(--border)] rounded-none bg-black/10">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                {selectedDateFilter ? t('noSessionsOnDate') : t('allSessionsHidden')}
              </p>
              {selectedDateFilter ? (
                <button
                  onClick={() => setSelectedDateFilter(null)}
                  className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline mt-2 cursor-pointer"
                >
                  {t('clearFilter')}
                </button>
              ) : (
                <button
                  onClick={() => handleToggleHideCancelled(false)}
                  className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline mt-2 cursor-pointer"
                >
                  {t('showCancelledSessions')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayedBookings.map((b) => {
                const isCourse = b.instructorId.startsWith('course_');
                let displayDate = b.date;
                let displayTime = b.time;

                if (isCourse && (b.time === 'Group Schedule' || b.time === getGroupScheduleLabel('en') || b.time === getGroupScheduleLabel('ru'))) {
                  const { datePart, timePart } = splitCourseDates(b.date, language);
                  displayDate = datePart;
                  displayTime = timePart;
                }

                return (
                  <div
                    key={b.id}
                    id={`booking-card-${b.id}`}
                    className={`p-4 rounded-none border flex flex-col md:flex-row lg:flex-col 2xl:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${
                      isCourse
                        ? 'border-violet-300 dark:border-violet-500/40 hover:border-violet-400 bg-violet-50/70 dark:bg-violet-950/20'
                        : 'border-[var(--border)] hover:border-[var(--ink)] bg-[var(--card-bg)]'
                    }`}
                  >
                    <div className="flex flex-1 items-center gap-4 min-w-0 w-full lg:flex-row lg:items-center 2xl:flex-row 2xl:items-center">
                      <div className="w-16 h-16 rounded-none overflow-hidden shrink-0 border border-[var(--border)]">
                        <img src={b.instructorAvatar} alt={b.instructorName} className="w-full h-full object-cover" />
                      </div>
                      <div className="space-y-1 min-w-0 w-full">
                        <h4 className="text-xs font-serif text-[var(--ink)] flex items-center gap-2 flex-wrap">
                          {b.instructorName}
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-normal">
                            • {b.durationHours} {t('hrSession')}
                          </span>
                        </h4>
                        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                          {getDifficultyLabel(b.difficulty, language)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink)] border border-[var(--border)] px-2 py-0.5 rounded-none flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {displayDate}
                          </span>
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] border border-[var(--border)] px-2 py-0.5 rounded-none flex items-center gap-1 bg-black/15">
                            <Clock className="w-3 h-3" /> {displayTime}
                          </span>
                        </div>
                        {b.status === 'pending_cancellation' && b.cancellationReason && (
                          <p className="text-[9px] font-mono uppercase tracking-wider text-rose-400 mt-2 bg-rose-950/20 border border-rose-900/40 px-2.5 py-1.5 rounded-none">
                            <span className="font-bold">{t('reason')} </span>{b.cancellationReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-[var(--border)] flex-wrap min-w-0 max-w-full">
                      <div className="text-left md:text-right shrink-0">
                        <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('totalFee')}</span>
                        <span className="text-base font-serif font-light text-[var(--ink)]">${b.totalPrice}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
                        <span
                          className={`px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest border rounded-none font-bold ${
                            b.status === 'confirmed' ? 'border-emerald-600/30 text-emerald-700 bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-950/20' :
                            b.status === 'completed' ? 'border-indigo-600/30 text-indigo-700 bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:bg-indigo-950/20' :
                            b.status === 'cancelled' ? 'border-rose-600/30 text-rose-700 bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:bg-rose-950/20' :
                            b.status === 'pending_cancellation' ? 'border-amber-600/30 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-950/20' :
                            'border-amber-600/30 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-950/20'
                          }`}
                        >
                          {getBookingStatusLabel(b.status, language)}
                        </span>

                        {b.status !== 'cancelled' && (
                          <button
                            onClick={() => onChat(b)}
                            title={t('chatAboutLesson')}
                            className="px-2 py-1 text-[8px] font-mono uppercase tracking-widest border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 hover:text-indigo-900 dark:hover:text-indigo-300 transition cursor-pointer flex items-center gap-1.5 rounded-none font-bold shrink-0"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{t('chat')}</span>
                          </button>
                        )}

                        {b.status === 'confirmed' && (
                          <div className="flex items-center gap-1">
                            <button
                              id={`reschedule-btn-${b.id}`}
                              onClick={() => onReschedule(b)}
                              title={t('rescheduleSession')}
                              className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/20 rounded-none border border-transparent hover:border-[var(--border)] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`cancel-btn-${b.id}`}
                              onClick={() => onCancel(b)}
                              title={t('cancelBookingRefund')}
                              className="p-1.5 text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/40 rounded-none border border-transparent transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
};
