import React, { useMemo } from 'react';
import { Booking, Course } from '../../types';
import {
  useLanguage,
  parseCourseDates,
  formatShortBookingDate,
  getDifficultyLabel,
  getHourSuffix,
} from '../../lib/LanguageContext';

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
      if (b.status === 'cancelled' || b.status === 'completed' || b.userId?.startsWith('system_block_')) {
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

    const monthName = todayDate.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long' });
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
      <div className="space-y-2 pb-2 border-b border-[var(--border)]/40">
        <div className="flex justify-between items-center text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
          <span>{content.header}</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {content.upcomingDaysNumbers.map(({ day, dateStr }) => {
            const hasBooking = userBookings.some((b) => content.isBookingOnDate(b, dateStr));
            return (
              <div
                key={dateStr}
                className={`text-center py-2 text-[10px] border font-mono transition duration-300 ${
                  hasBooking
                    ? 'bg-[var(--ink)] text-[var(--bg)] font-bold border-[var(--ink)]'
                    : 'border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--ink)]'
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
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--ink-dim)] block">
          {t('upcomingSessions7Days')}
        </span>
        {content.sortedActiveBookings.length > 0 ? (
          <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
            {content.sortedActiveBookings.map((b) => (
              <div key={b.id} className="space-y-2 pb-2 border-b border-[var(--border)]/40 last:pb-0 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-none overflow-hidden bg-slate-900 border border-[var(--border)] shrink-0">
                    <img src={b.instructorAvatar} alt={b.instructorName} className="w-full h-full object-cover filter grayscale" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-sm text-[var(--ink)] leading-none truncate">{b.instructorName}</h3>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                      <p className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                        {getDifficultyLabel(b.difficulty, language, 'short')} • {b.durationHours}{getHourSuffix(language)}
                      </p>
                      <span className="text-[9px] font-mono text-[var(--ink-dim)]">•</span>
                      <p className="text-[9px] font-mono text-indigo-700 dark:text-indigo-400 font-medium">
                        {formatShortBookingDate(b, language, courses)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]/20">
                  <span className="font-mono text-[9px] text-[var(--ink)]">
                    {t('paid')} ${b.totalPrice}
                  </span>
                  <span className={`font-mono text-[7px] px-1.5 py-0.5 uppercase font-bold tracking-widest border ${
                    b.status === 'confirmed'
                      ? 'border-emerald-600/30 text-emerald-800 bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:bg-emerald-950/30'
                      : 'border-amber-600/30 text-amber-800 bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:bg-amber-950/30'
                  }`}>
                    {b.status === 'confirmed' ? t('confirmed') : t('pending')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--ink-dim)] text-center py-2">{t('noSessionsThisWeek')}</p>
        )}
      </div>
    </div>
  );
};
