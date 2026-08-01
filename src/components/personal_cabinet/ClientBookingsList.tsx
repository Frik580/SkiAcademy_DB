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
  getDifficultyLabel,
} from '../../lib/LanguageContext';
import { ToggleSwitch } from '../ToggleSwitch';
import { StatusBadge } from '../ui/StatusBadge';
import { ScTextButton } from './student/StudentCabinetUI';
import { BookingListScope, filterBookingsByScope } from './student/studentCabinetUtils';
import { RecommendationIndicator } from './RecommendationIndicator';
import { ApplePagination } from '../common/ApplePagination';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../lib/lessonRecommendations';

const LIST_SCOPE_FILTERS: BookingListScope[] = ['upcoming', 'past', 'all'];

const LIST_SCOPE_LABEL_KEYS = {
  upcoming: 'scCalendarUpcoming',
  past: 'scCalendarPast',
  all: 'scHistoryFilterAll',
} as const;

interface ClientBookingsListProps {
  userBookings: Booking[];
  unreviewedCompletedBookings?: Booking[];
  showWorkoutCalendar?: boolean;
  onDismissReview?: (bookingId: string) => void;
  onWriteReview?: (booking: Booking) => void;
  onOpenLesson?: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onChat: (booking: Booking) => void;
}

export const ClientBookingsList: React.FC<ClientBookingsListProps> = ({
  userBookings,
  unreviewedCompletedBookings = [],
  showWorkoutCalendar = true,
  onDismissReview,
  onWriteReview,
  onOpenLesson,
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
  const [listScope, setListScope] = useState<BookingListScope>('upcoming');
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

  const scopedBookings = useMemo(
    () =>
      selectedDateFilter ? filteredBookings : filterBookingsByScope(filteredBookings, listScope),
    [filteredBookings, listScope, selectedDateFilter]
  );

  const displayedBookings = selectedDateFilter
    ? getBookingsOnDate(selectedDateFilter)
    : scopedBookings;

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

  const unreviewedIds = useMemo(
    () => new Set(unreviewedCompletedBookings.map((booking) => booking.id)),
    [unreviewedCompletedBookings]
  );

  return (
    <>
      {unreviewedCompletedBookings.length > 0 && onWriteReview && (
        <div className="mb-4 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 space-y-3">
          <p className="text-sm font-medium text-[var(--ink)]">
            {t('scUnreviewedBanner').replace('{n}', String(unreviewedCompletedBookings.length))}
          </p>
          <ul className="space-y-2">
            {unreviewedCompletedBookings.slice(0, 3).map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-[var(--ink-dim)]">
                  {booking.instructorName} · {booking.date}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onWriteReview(booking)}
                    className="text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    {t('writeReviewBtn')}
                  </button>
                  {onDismissReview && (
                    <button
                      type="button"
                      onClick={() => onDismissReview(booking.id)}
                      className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)]"
                    >
                      {t('scDismissReviewPrompt')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showWorkoutCalendar && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-medium text-[var(--ink)]">{t('yourSlopesCalendar')}</h3>
              <p className="text-sm text-[var(--ink-dim)]">{t('manageLessonsSub')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {userBookings.some((b) => b.status === 'cancelled') && (
                <ToggleSwitch
                  checked={hideCancelled}
                  onChange={(checked) => handleToggleHideCancelled(checked)}
                  label={t('hideCancelled')}
                />
              )}
            </div>
          </div>

          {userBookings.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] p-4 space-y-3 w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap w-full min-w-0">
                <span className="text-sm font-medium text-[var(--ink)]">
                  {t('interactiveCalendar')}
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
                    className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-[var(--ink)] min-w-[120px] text-center">
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
                    className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-[var(--ink-dim)] pb-1">
                {(language === 'ru' ? WEEKDAYS_RU : WEEKDAYS_EN).map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {daysArray.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="h-9" />;
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
                      className={`h-9 flex flex-col items-center justify-center rounded-lg transition text-sm relative ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white font-medium'
                          : hasCourse
                            ? 'text-violet-700 dark:text-violet-300 bg-violet-100/70 dark:bg-violet-950/30 hover:bg-violet-200/70'
                            : hasLesson
                              ? 'text-[var(--ink)] bg-[var(--border-subtle)]/40 font-medium hover:bg-[var(--border-subtle)]'
                              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span>{day}</span>
                      {(hasLesson || hasCourse) && !isSelected && (
                        <span
                          className={`w-1 h-1 rounded-full absolute bottom-1 ${
                            hasCourse ? 'bg-violet-500' : 'bg-[var(--accent)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDateFilter && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-2">
              <span className="text-sm text-[var(--ink-dim)]">
                {t('showingLessonsFor')} {selectedDateFilter}
              </span>
              <ScTextButton onClick={() => handleSelectDateFilter(null)}>
                {t('showAll')}
              </ScTextButton>
            </div>
          )}

          {!selectedDateFilter && (
            <div className="flex flex-wrap gap-2">
              {LIST_SCOPE_FILTERS.map((scope) => {
                const active = listScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      setListScope(scope);
                      setCurrentPage(1);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {t(LIST_SCOPE_LABEL_KEYS[scope])}
                  </button>
                );
              })}
            </div>
          )}

          {userBookings.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Calendar className="w-8 h-8 text-[var(--ink-dim)] mx-auto" />
              <p className="text-sm text-[var(--ink-dim)]">{t('noSessionsScheduledYet')}</p>
              <p className="text-xs text-[var(--ink-dim)]">{t('browseInstructorsHint')}</p>
            </div>
          ) : displayedBookings.length === 0 ? (
            <div className="py-10 text-center rounded-lg border border-dashed border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--ink-dim)]">
                {selectedDateFilter ? t('noSessionsOnDate') : t('allSessionsHidden')}
              </p>
              {selectedDateFilter ? (
                <ScTextButton onClick={() => handleSelectDateFilter(null)} className="mt-2">
                  {t('clearFilter')}
                </ScTextButton>
              ) : (
                <ScTextButton onClick={() => handleToggleHideCancelled(false)} className="mt-2">
                  {t('showCancelledSessions')}
                </ScTextButton>
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
                    className={`p-4 rounded-lg border flex flex-col gap-4 transition ${
                      isCourse
                        ? 'border-violet-200/80 dark:border-violet-800/40 bg-violet-50/40 dark:bg-violet-950/20'
                        : 'border-[var(--border-subtle)] bg-[var(--profile-bg)]'
                    }`}
                  >
                    <div className="flex flex-1 items-start gap-4 min-w-0 w-full">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-[var(--border-subtle)]">
                        <img
                          src={b.instructorAvatar}
                          alt={b.instructorName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-[var(--ink)] flex items-center gap-2 flex-wrap">
                          {b.instructorName}
                          {hasBookingRecommendations(b) && (
                            <RecommendationIndicator pending={hasPendingRecommendations(b)} />
                          )}
                        </h4>
                        <p className="text-xs text-[var(--ink-dim)]">
                          {getDifficultyLabel(b.difficulty, language)} · {b.durationHours}{' '}
                          {t('hrSession')}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--ink-dim)]">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" /> {displayDate}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[var(--accent)]" /> {displayTime}
                          </span>
                        </div>
                        {b.status === 'pending_cancellation' && b.cancellationReason && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                            <span className="font-medium">{t('reason')} </span>
                            {b.cancellationReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                      <div>
                        <span className="text-xs text-[var(--ink-dim)] block">{t('totalFee')}</span>
                        <span className="text-lg font-serif text-[var(--ink)]">
                          ${b.totalPrice}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={b.status} />

                        {b.status !== 'cancelled' && (
                          <button
                            onClick={() => onChat(b)}
                            title={t('chatAboutLesson')}
                            className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--ink)] hover:border-[var(--accent)] transition flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {t('chat')}
                          </button>
                        )}

                        {b.status !== 'cancelled' && onOpenLesson && (
                          <button
                            type="button"
                            onClick={() => onOpenLesson(b)}
                            className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--ink)] hover:border-[var(--accent)] transition"
                          >
                            {t('scMoreDetails')}
                          </button>
                        )}

                        {b.status === 'completed' && unreviewedIds.has(b.id) && onWriteReview && (
                          <button
                            type="button"
                            onClick={() => onWriteReview(b)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white transition"
                          >
                            {t('writeReviewBtn')}
                          </button>
                        )}

                        {b.status === 'confirmed' && (
                          <div className="flex items-center gap-1">
                            <button
                              id={`reschedule-btn-${b.id}`}
                              onClick={() => onReschedule(b)}
                              title={t('rescheduleSession')}
                              className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-lg transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              id={`cancel-btn-${b.id}`}
                              onClick={() => onCancel(b)}
                              title={t('cancelBookingRefund')}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <ApplePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={displayedBookings.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
                itemLabel={language === 'ru' ? 'занятий' : 'sessions'}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};
