import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  MessageSquare,
  Trash2,
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
import { ToggleSwitch } from '../ToggleSwitch';
import { RecommendationIndicator } from './RecommendationIndicator';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../lib/lessonRecommendations';

interface ClientBookingsListProps {
  userBookings: Booking[];
  unreviewedCompletedBookings?: Booking[];
  showWorkoutCalendar?: boolean;
  onDismissReview?: (bookingId: string) => void;
  onWriteReview?: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
}

export const ClientBookingsList: React.FC<ClientBookingsListProps> = ({
  userBookings,
  showWorkoutCalendar = true,
  onReschedule,
  onCancel,
  onChat,
}) => {
  const { language, t } = useLanguage();

  const [hideCancelled, setHideCancelled] = useState<boolean>(() => {
    const saved = localStorage.getItem('alpine_glide_hide_cancelled_bookings');
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 5;

  const handleToggleHideCancelled = (val: boolean) => {
    setHideCancelled(val);
    setCurrentPage(1);
    localStorage.setItem('alpine_glide_hide_cancelled_bookings', String(val));
  };

  const handleSelectDateFilter = (dateStr: string | null) => {
    setSelectedDateFilter(dateStr);
    setCurrentPage(1);
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
        const currentDate = new Date(
          checkDate.getFullYear(),
          checkDate.getMonth(),
          checkDate.getDate()
        );
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

  const totalPages = Math.max(1, Math.ceil(displayedBookings.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return displayedBookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [displayedBookings, currentPage]);

  return (
    <>
      {showWorkoutCalendar && (
        <div className="space-y-4">
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
              {userBookings.some((b) => b.status === 'cancelled') && (
                <div className="flex items-center gap-2 border border-slate-200/70 dark:border-slate-800/70 px-3 py-1.5 bg-[var(--card-bg)] rounded-xs shadow-xs">
                  <ToggleSwitch
                    checked={hideCancelled}
                    onChange={(checked) => handleToggleHideCancelled(checked)}
                    label={t('hideCancelled')}
                  />
                </div>
              )}
            </div>
          </div>

          {userBookings.length > 0 && (
            <div className="ui-card p-4 lg:p-5 space-y-3 w-full min-w-0 max-w-full overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap w-full min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] font-bold flex items-center gap-1.5 break-words">
                  📅 {t('interactiveCalendar')}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMonth((prev) => {
                        const next = new Date(prev);
                        next.setMonth(next.getMonth() - 1);
                        return next;
                      })
                    }
                    className="p-1 hover:bg-[var(--bg)] rounded-none text-[var(--ink)] transition cursor-pointer border border-transparent hover:border-[var(--border)]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-mono uppercase tracking-wider min-w-[100px] text-center text-[var(--ink)] font-bold">
                    {language === 'ru' ? MONTHS_RU[month] : MONTHS_EN[month]} {year}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMonth((prev) => {
                        const next = new Date(prev);
                        next.setMonth(next.getMonth() + 1);
                        return next;
                      })
                    }
                    className="p-1 hover:bg-[var(--bg)] rounded-none text-[var(--ink)] transition cursor-pointer border border-transparent hover:border-[var(--border)]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold pb-1 border-b border-[var(--border)]">
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
                          handleSelectDateFilter(isSelected ? null : dateStr);
                        }
                      }}
                      className={`h-9 flex flex-col items-center justify-center rounded-xs transition text-[10px] font-mono relative cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--ink)] text-[var(--bg)] font-bold shadow-xs'
                          : hasCourse
                            ? 'text-violet-800 dark:text-violet-200 bg-violet-100/80 dark:bg-violet-950/40 font-bold hover:bg-violet-200/80 cursor-pointer'
                            : hasLesson
                              ? 'text-[var(--ink)] bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
                              : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-default'
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

          {selectedDateFilter && (
            <div className="flex items-center justify-between border border-[var(--border)] bg-black/25 px-3 py-2 rounded-none">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                {t('showingLessonsFor')} {selectedDateFilter}
              </span>
              <button
                onClick={() => handleSelectDateFilter(null)}
                className="text-[10px] font-mono uppercase tracking-widest text-accent hover:text-[var(--accent-hover)] hover:underline cursor-pointer"
              >
                {t('showAll')}
              </button>
            </div>
          )}

          {userBookings.length === 0 ? (
            <div className="ui-empty-state py-16">
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
                  onClick={() => handleSelectDateFilter(null)}
                  className="text-[10px] font-mono uppercase tracking-widest text-accent hover:text-[var(--accent-hover)] hover:underline mt-2 cursor-pointer"
                >
                  {t('clearFilter')}
                </button>
              ) : (
                <button
                  onClick={() => handleToggleHideCancelled(false)}
                  className="text-[10px] font-mono uppercase tracking-widest text-accent hover:text-[var(--accent-hover)] hover:underline mt-2 cursor-pointer"
                >
                  {t('showCancelledSessions')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedBookings.map((b) => {
                const isCourse = b.instructorId.startsWith('course_');
                let displayDate = b.date;
                let displayTime = b.time;

                if (
                  isCourse &&
                  (b.time === 'Group Schedule' ||
                    b.time === getGroupScheduleLabel('en') ||
                    b.time === getGroupScheduleLabel('ru'))
                ) {
                  const { datePart, timePart } = splitCourseDates(b.date, language);
                  displayDate = datePart;
                  displayTime = timePart;
                }

                return (
                  <div
                    key={b.id}
                    id={`booking-card-${b.id}`}
                    className={`p-4 rounded-xs border flex flex-col md:flex-row lg:flex-col 2xl:flex-row md:items-center justify-between gap-4 transition-all duration-300 shadow-xs ${
                      isCourse
                        ? 'border-violet-200/80 dark:border-violet-800/40 hover:border-violet-300 bg-violet-50/60 dark:bg-violet-950/20'
                        : 'border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 bg-[var(--card-bg)]'
                    }`}
                  >
                    <div className="flex flex-1 items-center gap-4 min-w-0 w-full lg:flex-row lg:items-center 2xl:flex-row 2xl:items-center">
                      <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
                        <img
                          src={b.instructorAvatar}
                          alt={b.instructorName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="space-y-1 min-w-0 w-full">
                        <h4 className="text-xs font-serif text-[var(--ink)] flex items-center gap-2 flex-wrap">
                          {b.instructorName}
                          {hasBookingRecommendations(b) && (
                            <RecommendationIndicator pending={hasPendingRecommendations(b)} />
                          )}
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-normal">
                            • {b.durationHours} {t('hrSession')}
                          </span>
                        </h4>
                        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
                          {getDifficultyLabel(b.difficulty, language)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink)] bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-xs flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3 text-accent" /> {displayDate}
                          </span>
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-xs flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3 text-accent" /> {displayTime}
                          </span>
                        </div>
                        {b.status === 'pending_cancellation' && b.cancellationReason && (
                          <p className="text-[9px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 mt-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 px-2.5 py-1.5 rounded-xs">
                            <span className="font-bold">{t('reason')} </span>
                            {b.cancellationReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200/60 dark:border-slate-800/60 flex-wrap min-w-0 max-w-full">
                      <div className="text-left md:text-right shrink-0">
                        <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
                          {t('totalFee')}
                        </span>
                        <span className="text-base font-serif font-light text-[var(--ink)]">
                          ${b.totalPrice}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
                        <span
                          className={`px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest rounded-xs font-bold ${
                            b.status === 'confirmed'
                              ? 'text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-950/50'
                              : b.status === 'completed'
                                ? 'badge-accent'
                                : b.status === 'cancelled'
                                  ? 'text-rose-700 bg-rose-100/80 dark:text-rose-300 dark:bg-rose-950/50'
                                  : 'text-amber-700 bg-amber-100/80 dark:text-amber-300 dark:bg-amber-950/50'
                          }`}
                        >
                          {getBookingStatusLabel(b.status, language)}
                        </span>

                        {b.status !== 'cancelled' && (
                          <button
                            onClick={() => onChat(b)}
                            title={t('chatAboutLesson')}
                            className="px-2.5 py-1 text-[8px] font-mono uppercase tracking-widest badge-accent-outline transition cursor-pointer flex items-center gap-1.5 rounded-xs font-bold shrink-0"
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
                              className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xs transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`cancel-btn-${b.id}`}
                              onClick={() => onCancel(b)}
                              title={t('cancelBookingRefund')}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xs transition cursor-pointer"
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

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200/70 dark:border-slate-800/70 mt-4">
                  <div className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                    {language === 'ru'
                      ? `Показано ${Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, displayedBookings.length)}–${Math.min(currentPage * ITEMS_PER_PAGE, displayedBookings.length)} из ${displayedBookings.length} занятий`
                      : `Showing ${Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, displayedBookings.length)}–${Math.min(currentPage * ITEMS_PER_PAGE, displayedBookings.length)} of ${displayedBookings.length} sessions`}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border rounded-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--ink)] flex items-center gap-1 font-bold"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{language === 'ru' ? 'Назад' : 'Prev'}</span>
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-7 h-7 text-[10px] font-mono font-bold rounded-xs transition cursor-pointer flex items-center justify-center ${
                          currentPage === page
                            ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                            : 'border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--ink-dim)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider border rounded-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--ink)] flex items-center gap-1 font-bold"
                    >
                      <span>{language === 'ru' ? 'Вперед' : 'Next'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
