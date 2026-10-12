import React, { useMemo } from 'react';
import type { CabinetSessionItem } from '../../../features/course-enrollments';
import {
  formatCabinetSessionTimeRange,
  getCabinetSessionSubtitle,
  getNextSessionsNext7DaysFromSessions,
  isActiveSessionItem,
  isSessionOnDate,
  sessionDisplayDate,
  sessionStartSortKey,
} from '../../../features/course-enrollments/sessionScheduleHelpers';
import {
  useLanguage,
  formatShortBookingDate,
  formatLessonDifficultyOrUnspecified,
  getHourSuffix,
} from '../../../app/providers/LanguageContext';
import { StatusBadge } from '../../../ui/StatusBadge';
import type { LessonBookingCabinetItem } from '../../../features/lesson-bookings/lessonBookingContracts';
import { cabinetItemToLegacyPresentation } from '../../../features/lesson-bookings/mergeCabinetBookings';

interface UpcomingSessionsStripProps {
  sessionItems: readonly CabinetSessionItem[];
  userBookings?: readonly LessonBookingCabinetItem[];
  accountId?: string;
}

export const UpcomingSessionsStrip: React.FC<UpcomingSessionsStripProps> = ({
  sessionItems,
  userBookings = [],
  accountId = '',
}) => {
  const { language, t } = useLanguage();

  const content = useMemo(() => {
    const todayDate = new Date();
    const upcomingDaysNumbers: { day: number; dateStr: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(todayDate.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      upcomingDaysNumbers.push({ day: d.getDate(), dateStr });
    }

    const monthName = todayDate.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
    });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const header = t('weeklyScheduleHeader')
      .replace('{month}', capitalizedMonth)
      .replace('{year}', String(todayDate.getFullYear()));

    const sortedActiveSessions = getNextSessionsNext7DaysFromSessions(sessionItems, todayDate)
      .map((entry) => entry.session)
      .filter(
        (item, index, items) =>
          items.findIndex((other) => sessionStartSortKey(other) === sessionStartSortKey(item)) ===
          index
      )
      .filter(isActiveSessionItem)
      .sort((left, right) => sessionStartSortKey(left).localeCompare(sessionStartSortKey(right)));

    return { upcomingDaysNumbers, header, sortedActiveSessions };
  }, [sessionItems, language, t]);

  const legacyById = useMemo(
    () =>
      new Map(
        userBookings.map((booking) => [
          booking.id,
          cabinetItemToLegacyPresentation(booking, accountId),
        ])
      ),
    [userBookings, accountId]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex justify-between items-center type-caption text-[var(--ink)] font-medium uppercase">
          <span>{content.header}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {content.upcomingDaysNumbers.map(({ day, dateStr }) => {
            const hasBooking = sessionItems.some(
              (item) => isActiveSessionItem(item) && isSessionOnDate(item, dateStr)
            );
            return (
              <div
                key={dateStr}
                className={`text-center py-2 type-caption transition duration-300 rounded-xs ${
                  hasBooking
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)] font-bold shadow-xs'
                    : 'bg-slate-100/70 dark:bg-slate-800/50 text-[var(--ink)] hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium'
                }`}
                title={hasBooking ? t('bookedLesson') : t('noLessons')}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <span className="type-caption uppercase text-[var(--ink)] font-medium block">
          {t('upcomingSessions7Days')}
        </span>
        {content.sortedActiveSessions.length > 0 ? (
          <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
            {content.sortedActiveSessions.map((item) => {
              const key =
                item.kind === 'lesson'
                  ? item.session.id
                  : `${item.enrollmentId}:${item.courseDayId}`;
              const isCourseDay = item.kind === 'course_day';
              const lessonLegacy =
                item.kind === 'lesson' ? legacyById.get(item.session.id) : undefined;

              return (
                <div
                  key={key}
                  className={`space-y-2.5 p-3 border rounded-xs hover:border-slate-300 dark:hover:border-slate-700 transition ${
                    isCourseDay
                      ? 'bg-violet-50/70 dark:bg-violet-950/20 border-violet-200/70 dark:border-violet-800/70'
                      : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                      {item.kind === 'lesson' ? (
                        <img
                          src={item.session.instructorAvatar}
                          alt={item.session.instructorName}
                          className="w-full h-full object-cover filter grayscale"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center type-caption font-medium text-violet-700 dark:text-violet-300">
                          GC
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="type-card-title text-[var(--ink)] truncate">
                        {item.kind === 'lesson' ? item.session.instructorName : item.courseTitle}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                        <p className="type-caption text-[var(--ink)] uppercase font-medium">
                          {item.kind === 'lesson'
                            ? `${formatLessonDifficultyOrUnspecified(item.session.difficulty, language, t('difficultyUnspecified'), 'short')} • ${item.session.durationHours}${getHourSuffix(language)}`
                            : getCabinetSessionSubtitle(item, language === 'ru' ? 'ru' : 'en')}
                        </p>
                        <span className="type-caption text-[var(--ink-dim)]">•</span>
                        <p className="type-caption text-accent font-medium">
                          {lessonLegacy
                            ? formatShortBookingDate(lessonLegacy, language, [])
                            : sessionDisplayDate(item)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    <span className="type-caption text-[var(--ink)] font-medium">
                      {formatCabinetSessionTimeRange(item)}
                    </span>
                    <StatusBadge
                      status={
                        item.kind === 'lesson'
                          ? item.session.status
                          : item.lifecycleStatus === 'pending_cancellation'
                            ? 'pending_cancellation'
                            : item.lifecycleStatus === 'confirmed'
                              ? 'confirmed'
                              : 'pending'
                      }
                      size="xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="type-caption text-[var(--ink-dim)] text-center py-3 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xs">
            {t('noSessionsThisWeek')}
          </p>
        )}
      </div>
    </div>
  );
};
