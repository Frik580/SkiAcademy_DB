import React, { useMemo } from 'react';
import { Booking, Course } from '../../../../types';
import {
  useLanguage,
  parseCourseDates,
  formatShortBookingDate,
  getDifficultyLabel,
  getHourSuffix,
} from '../../../../lib/LanguageContext';
import { StatusBadge } from '../../../../ui/StatusBadge';

interface UpcomingSessionsStripProps {
  userBookings: Booking[];
  courses?: Course[];
}

export const UpcomingSessionsStrip: React.FC<UpcomingSessionsStripProps> = ({
  userBookings,
  courses = [],
}) => {
  const { language, t } = useLanguage();

  const content = useMemo(() => {
    const isBookingOnDate = (b: Booking, dateStr: string) => {
      if (
        b.status === 'cancelled' ||
        b.status === 'completed' ||
        b.userId?.startsWith('system_block_')
      ) {
        return false;
      }
      if (b.instructorId.startsWith('course_')) {
        const courseId = b.instructorId.substring('course_'.length);
        const course = courses.find((c) => c.id === courseId);
        const datesToParse = course ? course.dates : b.date;
        const parsed = parseCourseDates(datesToParse);
        const startDateStr = `${parsed.start.getFullYear()}-${String(parsed.start.getMonth() + 1).padStart(2, '0')}-${String(parsed.start.getDate()).padStart(2, '0')}`;
        const endDateStr = `${parsed.end.getFullYear()}-${String(parsed.end.getMonth() + 1).padStart(2, '0')}-${String(parsed.end.getDate()).padStart(2, '0')}`;
        return dateStr >= startDateStr && dateStr <= endDateStr;
      }
      return b.date === dateStr;
    };

    const todayDate = new Date();
    const upcomingSevenDays: string[] = [];
    const upcomingDaysNumbers: { day: number; dateStr: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(todayDate.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      upcomingSevenDays.push(dateStr);
      upcomingDaysNumbers.push({ day: d.getDate(), dateStr });
    }

    const monthName = todayDate.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
    });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const header = t('weeklyScheduleHeader')
      .replace('{month}', capitalizedMonth)
      .replace('{year}', String(todayDate.getFullYear()));

    const rawActiveBookings = userBookings.filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'pending') &&
        !b.userId?.startsWith('system_block_') &&
        upcomingSevenDays.some((dayStr) => isBookingOnDate(b, dayStr))
    );

    const sortedActiveBookings = [...rawActiveBookings].sort((a, b) => {
      const resolveStartDate = (booking: Booking) => {
        if (booking.instructorId.startsWith('course_')) {
          const courseId = booking.instructorId.substring('course_'.length);
          const course = courses.find((c) => c.id === courseId);
          const parsed = parseCourseDates(course ? course.dates : booking.date);
          return `${parsed.start.getFullYear()}-${String(parsed.start.getMonth() + 1).padStart(2, '0')}-${String(parsed.start.getDate()).padStart(2, '0')}`;
        }
        return booking.date;
      };

      const aDate = resolveStartDate(a);
      const bDate = resolveStartDate(b);
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.time.localeCompare(b.time);
    });

    return { upcomingDaysNumbers, header, sortedActiveBookings, isBookingOnDate };
  }, [userBookings, courses, language, t]);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex justify-between items-center text-[10px] font-mono text-[var(--ink)] font-bold uppercase tracking-wider">
          <span>{content.header}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {content.upcomingDaysNumbers.map(({ day, dateStr }) => {
            const hasBooking = userBookings.some((b) => content.isBookingOnDate(b, dateStr));
            return (
              <div
                key={dateStr}
                className={`text-center py-2 text-[11px] font-mono transition duration-300 rounded-xs ${
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
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink)] font-bold block">
          {t('upcomingSessions7Days')}
        </span>
        {content.sortedActiveBookings.length > 0 ? (
          <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
            {content.sortedActiveBookings.map((b) => (
              <div
                key={b.id}
                className="space-y-2.5 p-3 bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                    <img
                      src={b.instructorAvatar}
                      alt={b.instructorName}
                      className="w-full h-full object-cover filter grayscale"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-base font-normal text-[var(--ink)] leading-none truncate">
                      {b.instructorName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                      <p className="text-[10px] font-mono text-[var(--ink)] uppercase tracking-wider font-medium">
                        {getDifficultyLabel(b.difficulty, language, 'short')} • {b.durationHours}
                        {getHourSuffix(language)}
                      </p>
                      <span className="text-[10px] font-mono text-[var(--ink-dim)]">•</span>
                      <p className="text-[10px] font-mono text-accent font-bold">
                        {formatShortBookingDate(b, language, courses)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                  <span className="font-mono text-[10px] text-[var(--ink)] font-bold">
                    {t('paid')} ${b.totalPrice}
                  </span>
                  <StatusBadge status={b.status} size="xs" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] font-mono text-[var(--ink-dim)] text-center py-3 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xs">
            {t('noSessionsThisWeek')}
          </p>
        )}
      </div>
    </div>
  );
};
