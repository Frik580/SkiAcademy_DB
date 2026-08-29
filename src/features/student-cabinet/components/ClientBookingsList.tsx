import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, MessageSquare, Trash2 } from 'lucide-react';
import { Course, Instructor, UserProfile } from '../../../types';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import { cabinetItemToLegacyPresentation } from '../../../features/lesson-bookings/mergeCabinetBookings';
import type { CabinetSessionItem } from '../../../features/course-enrollments';
import {
  filterSessionsByScope,
  isSessionOnDate,
  sessionDisplayDate,
  sessionDisplayTime,
  sessionDisplayTitle,
  sessionItemKey,
  type SessionListScope,
} from '../../../features/course-enrollments/sessionScheduleHelpers';
import { BookingCallCoachButton } from './student/BookingCallCoachButton';
import {
  useLanguage,
  MONTHS_EN,
  MONTHS_RU,
  WEEKDAYS_EN,
  WEEKDAYS_RU,
  getDifficultyLabel,
} from '../../../app/providers/LanguageContext';
import { ToggleSwitch } from '../../../ui/ToggleSwitch';
import { StatusBadge } from '../../../ui/StatusBadge';
import { StateCard } from '../../../ui/StateCard';
import { ScTextButton } from './student/StudentCabinetUI';
import { RecommendationIndicator } from './RecommendationIndicator';
import { ChatUnreadIndicator } from '../../../features/chat';
import { ApplePagination } from '../../../ui/ApplePagination';
import { BookingCollaborationActions } from '../../../features/booking-collaboration';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../features/student-cabinet/lessonRecommendations';
import { formatCourseDayDateLabel } from '../../../features/course-enrollments/sessionScheduleHelpers';

const LIST_SCOPE_FILTERS: SessionListScope[] = ['upcoming', 'current', 'past', 'all'];

const LIST_SCOPE_LABEL_KEYS = {
  upcoming: 'scCalendarUpcoming',
  current: 'scCalendarCurrent',
  past: 'scCalendarPast',
  all: 'scHistoryFilterAll',
} as const;

interface ClientBookingsListProps {
  sessionItems: readonly CabinetSessionItem[];
  userBookings: LessonBookingCabinetItem[];
  courses?: Course[];
  instructors?: Instructor[];
  usersList?: UserProfile[];
  unreviewedCompletedBookings?: LessonBookingCabinetItem[];
  showWorkoutCalendar?: boolean;
  onDismissReview?: (bookingId: string) => void;
  onWriteReview?: (booking: LessonBookingCabinetItem) => void;
  onOpenLesson?: (booking: LessonBookingCabinetItem) => void;
  onViewCourseDetails?: (courseId: string) => void;
  onCancel: (booking: LessonBookingCabinetItem) => void;
  onChat: (booking: LessonBookingCabinetItem) => void;
  hasUnreadChat?: (bookingId: string) => boolean;
  onWithdrawCancellation?: (booking: LessonBookingCabinetItem) => void | Promise<void>;
  onRescheduleBooking?: (booking: LessonBookingCabinetItem) => void;
  onCourseWithdraw?: (enrollmentId: string) => void | Promise<void>;
  onCourseRequestCancellation?: (enrollmentId: string) => void | Promise<void>;
  collaborationSubmittingId?: string;
}

export const ClientBookingsList: React.FC<ClientBookingsListProps> = ({
  sessionItems,
  courses = [],
  instructors = [],
  usersList = [],
  unreviewedCompletedBookings = [],
  showWorkoutCalendar = true,
  onWriteReview,
  onOpenLesson,
  onViewCourseDetails,
  onCancel,
  onChat,
  hasUnreadChat,
  onWithdrawCancellation,
  onRescheduleBooking,
  onCourseWithdraw,
  onCourseRequestCancellation,
  collaborationSubmittingId,
}) => {
  const { language, t } = useLanguage();

  const [hideCancelled, setHideCancelled] = useState<boolean>(() => {
    const saved = localStorage.getItem('alpine_glide_hide_cancelled_bookings');
    return saved === 'true';
  });

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const upcoming = sessionItems.find(
      (item) => item.kind === 'lesson' && item.session.status === 'confirmed'
    );
    if (upcoming?.kind === 'lesson') {
      const d = new Date(upcoming.session.date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [listScope, setListScope] = useState<SessionListScope>('upcoming');
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

  const filteredSessions = useMemo(() => {
    return sessionItems.filter((item) => {
      if (!hideCancelled) return true;
      if (item.kind === 'lesson') {
        return item.session.status !== 'cancelled';
      }
      return item.lifecycleStatus !== 'cancelled' && item.lifecycleStatus !== 'withdrawn';
    });
  }, [sessionItems, hideCancelled]);

  const getSessionsOnDate = (dateStr: string) =>
    filteredSessions.filter((item) => isSessionOnDate(item, dateStr));

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

  const scopedSessions = useMemo(
    () =>
      selectedDateFilter ? filteredSessions : filterSessionsByScope(filteredSessions, listScope),
    [filteredSessions, listScope, selectedDateFilter]
  );

  const displayedSessions = selectedDateFilter
    ? getSessionsOnDate(selectedDateFilter)
    : scopedSessions;

  const totalPages = Math.max(1, Math.ceil(displayedSessions.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return displayedSessions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [displayedSessions, currentPage]);

  const unreviewedIds = useMemo(
    () => new Set(unreviewedCompletedBookings.map((booking) => booking.id)),
    [unreviewedCompletedBookings]
  );

  const hasCancelledSessions =
    sessionItems.some((item) => item.kind === 'lesson' && item.session.status === 'cancelled') ||
    sessionItems.some(
      (item) =>
        item.kind === 'course_day' &&
        (item.lifecycleStatus === 'cancelled' || item.lifecycleStatus === 'withdrawn')
    );

  return (
    <>
      {showWorkoutCalendar && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-medium text-[var(--ink)]">{t('yourSlopesCalendar')}</h3>
              <p className="text-sm text-[var(--ink-dim)]">{t('manageLessonsSub')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {hasCancelledSessions && (
                <ToggleSwitch
                  checked={hideCancelled}
                  onChange={(checked) => handleToggleHideCancelled(checked)}
                  label={t('hideCancelled')}
                />
              )}
            </div>
          </div>

          {sessionItems.length > 0 && (
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
                  const daySessions = getSessionsOnDate(dateStr);
                  const isSelected = selectedDateFilter === dateStr;
                  const hasCourse = daySessions.some((item) => item.kind === 'course_day');
                  const hasLesson = daySessions.some((item) => item.kind === 'lesson');

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

          {sessionItems.length === 0 ? (
            <StateCard
              title={t('noSessionsScheduledYet')}
              description={t('browseInstructorsHint')}
              className="py-12"
            />
          ) : displayedSessions.length === 0 ? (
            <StateCard title={selectedDateFilter ? t('noSessionsOnDate') : t('allSessionsHidden')}>
              {selectedDateFilter ? (
                <ScTextButton onClick={() => handleSelectDateFilter(null)}>
                  {t('clearFilter')}
                </ScTextButton>
              ) : (
                <ScTextButton onClick={() => handleToggleHideCancelled(false)}>
                  {t('showCancelledSessions')}
                </ScTextButton>
              )}
            </StateCard>
          ) : (
            <div className="space-y-3">
              {paginatedSessions.map((item) => {
                const key = sessionItemKey(item);
                const displayDate = sessionDisplayDate(item);
                const displayTime = sessionDisplayTime(item);

                if (item.kind === 'lesson') {
                  const b = item.session;
                  return (
                    <div
                      key={key}
                      id={`booking-card-${b.id}`}
                      className="p-4 rounded-lg border flex flex-col gap-4 transition border-[var(--border-subtle)] bg-[var(--profile-bg)]"
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
                            {hasBookingRecommendations(b as never) && (
                              <RecommendationIndicator
                                pending={hasPendingRecommendations(b as never)}
                              />
                            )}
                          </h4>
                          <p className="text-xs text-[var(--ink-dim)]">
                            {b.difficulty ? `${getDifficultyLabel(b.difficulty, language)} · ` : ''}
                            {b.durationHours} {t('hrSession')}
                            {b.partyKind === 'family_group' && b.participantNames.length > 1
                              ? ` · ${b.participantNames.length}`
                              : ''}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--ink-dim)]">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />{' '}
                              {displayDate}
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
                          <span className="text-xs text-[var(--ink-dim)] block">
                            {t('totalFee')}
                          </span>
                          <span className="text-lg font-serif text-[var(--ink)]">
                            {b.payment.kind === 'visible' && b.totalPrice !== undefined
                              ? `$${b.totalPrice}`
                              : 'Payment details unavailable'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={b.status} />

                          {b.status !== 'cancelled' && (
                            <button
                              onClick={() => onChat(b)}
                              title={
                                hasUnreadChat?.(b.id) ? t('chatNewMessages') : t('chatAboutLesson')
                              }
                              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded-lg text-[var(--ink)] hover:border-[var(--accent)] transition flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {t('chat')}
                              <ChatUnreadIndicator show={hasUnreadChat?.(b.id) ?? false} />
                            </button>
                          )}

                          {b.status !== 'cancelled' && (
                            <BookingCallCoachButton
                              booking={cabinetItemToLegacyPresentation(b, usersList[0]?.uid ?? '')}
                              courses={courses}
                              instructors={instructors}
                              usersList={usersList}
                              variant="outline"
                            />
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

                          {b.authorizedActions ? (
                            <BookingCollaborationActions
                              booking={b}
                              onWithdrawCancellation={
                                onWithdrawCancellation ?? (async () => undefined)
                              }
                              onReschedule={onRescheduleBooking ?? (() => undefined)}
                              onCancel={onCancel}
                              submitting={collaborationSubmittingId === b.bookingId}
                            />
                          ) : (
                            b.status === 'confirmed' && (
                              <div className="flex items-center gap-1">
                                <button
                                  id={`cancel-btn-${b.id}`}
                                  onClick={() => onCancel(b)}
                                  title={t('cancelBookingRefund')}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    className="p-4 rounded-lg border flex flex-col gap-4 transition border-violet-200/80 dark:border-violet-800/40 bg-violet-50/40 dark:bg-violet-950/20"
                  >
                    <div className="flex flex-1 items-start gap-4 min-w-0 w-full">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-700 dark:text-violet-300 text-xs font-medium">
                        {t('scCourseDetailsTitle').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-[var(--ink)]">
                          {sessionDisplayTitle(item)}
                        </h4>
                        <p className="text-xs text-[var(--ink-dim)]">
                          {item.participantName} ·{' '}
                          {formatCourseDayDateLabel(item, language === 'ru' ? 'ru' : 'en')}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--ink-dim)]">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-violet-500" /> {displayDate}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-violet-500" /> {displayTime}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-200/60 dark:border-violet-800/40 pt-3">
                      <div>
                        <span className="text-xs text-[var(--ink-dim)] block">
                          {language === 'ru' ? 'Групповой курс' : 'Group course'}
                        </span>
                        <span className="text-sm font-medium text-[var(--ink)]">
                          {t('scCourseDetailsTitle')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge
                          status={
                            item.lifecycleStatus === 'pending_cancellation'
                              ? 'pending_cancellation'
                              : item.lifecycleStatus === 'confirmed'
                                ? 'confirmed'
                                : 'pending'
                          }
                        />

                        {onViewCourseDetails && (
                          <button
                            type="button"
                            onClick={() => onViewCourseDetails(item.courseId)}
                            className="px-3 py-1.5 text-xs font-medium border border-violet-200 dark:border-violet-800 rounded-lg text-[var(--ink)] hover:border-violet-400 transition"
                          >
                            {t('scMoreDetails')}
                          </button>
                        )}

                        {item.authorizedActions.canWithdraw && onCourseWithdraw && (
                          <button
                            type="button"
                            onClick={() => void onCourseWithdraw(item.enrollmentId)}
                            className="px-3 py-1.5 text-xs font-medium border border-rose-200 dark:border-rose-800 rounded-lg text-rose-600 transition"
                          >
                            {t('cancelBookingRefund')}
                          </button>
                        )}

                        {item.authorizedActions.canRequestCancellation &&
                          onCourseRequestCancellation && (
                            <button
                              type="button"
                              onClick={() => void onCourseRequestCancellation(item.enrollmentId)}
                              className="px-3 py-1.5 text-xs font-medium border border-rose-200 dark:border-rose-800 rounded-lg text-rose-600 transition"
                            >
                              {t('cancellationRequested')}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <ApplePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={displayedSessions.length}
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
