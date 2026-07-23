import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { formatDateLocalYMD } from './scheduleUtils';
import type { CourseDateRangeState } from './useCourseDateRange';

interface CourseDateRangePickerProps {
  dateRange: CourseDateRangeState;
}

export const CourseDateRangePicker: React.FC<CourseDateRangePickerProps> = ({
  dateRange,
}) => {
  const { t, language } = useLanguage();
  const {
    courseDates,
    courseStartDate,
    courseEndDate,
    courseStartTime,
    setCourseStartTime,
    courseEndTime,
    setCourseEndTime,
    calendarViewMonth,
    showCalendarPopover,
    setShowCalendarPopover,
    calendarDays,
    handlePrevMonth,
    handleNextMonth,
    handleCalendarDayClick,
  } = dateRange;

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
        {t('datesTimeOfCourse')}
      </label>
      
      {/* Visual trigger / current selection display */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            required
            readOnly
            value={courseDates}
            className="w-full px-3.5 py-2 pr-10 border border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink)] text-xs font-mono focus:outline-none cursor-pointer rounded-none"
            onClick={() => setShowCalendarPopover(!showCalendarPopover)}
            placeholder={t('openCalendarPlaceholder')}
          />
          <Calendar className="absolute right-3 top-2.5 w-4.5 h-4.5 text-[var(--ink-dim)] pointer-events-none" />
        </div>
        
        <button
          type="button"
          onClick={() => setShowCalendarPopover(!showCalendarPopover)}
          className="px-3 py-2 border border-[var(--border)] text-xs text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition rounded-none font-mono font-bold"
        >
          {showCalendarPopover ? t('closeCalendar') : t('openCalendar')}
        </button>
      </div>

      {/* Calendar Popover / Expanded Section */}
      {showCalendarPopover && (
        <div className="border border-[var(--border)] p-4 bg-black/5 dark:bg-white/5 space-y-4 animate-fade-in rounded-none">
          {/* Month Navigation */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <span className="font-serif text-xs font-bold text-[var(--ink)] capitalize">
              {calendarViewMonth.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' })}
            </span>
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent rounded-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent rounded-none"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono">
            {/* Weekday Headers */}
            {(language === 'ru' ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((wd) => (
              <span key={wd} className="text-[9px] font-bold text-[var(--ink-dim)] py-1">
                {wd}
              </span>
            ))}

            {/* Month Days */}
            {calendarDays.map((cell, idx) => {
              const cellDateStr = formatDateLocalYMD(cell.date);
              const isStart = cellDateStr === courseStartDate;
              const isEnd = cellDateStr === courseEndDate;
              
              const startObj = courseStartDate ? new Date(courseStartDate) : null;
              const endObj = courseEndDate ? new Date(courseEndDate) : null;
              const isRange = startObj && endObj && cell.date >= startObj && cell.date <= endObj;
              
              let cellBgClass = "bg-transparent text-[var(--ink)] hover:bg-black/10 dark:hover:bg-white/10";
              if (isStart || isEnd) {
                cellBgClass = "bg-[var(--ink)] text-[var(--bg)] font-bold";
              } else if (isRange) {
                cellBgClass = "bg-sky-550/20 text-[var(--ink)] font-bold border-y border-dashed border-sky-500/20";
              } else if (!cell.isCurrentMonth) {
                cellBgClass = "text-[var(--ink-dim)] opacity-40 hover:bg-black/5 dark:hover:bg-white/5";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleCalendarDayClick(cell.date)}
                  className={`h-7 w-7 text-[10px] flex items-center justify-center transition cursor-pointer rounded-none border border-transparent ${cellBgClass}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Guide Text */}
          <div className="text-[9px] text-[var(--ink-dim)] font-mono text-center">
            {t('calendarRangeHint')}
          </div>

          {/* Time Slot Customizer within calendar panel */}
          <div className="border-t border-[var(--border)] pt-3 space-y-3">
            <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {t('dailyHours')}
            </span>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] text-[var(--ink-dim)] block">
                  {t('startTime')}
                </label>
                <input
                  type="time"
                  required
                  value={courseStartTime}
                  onChange={(e) => setCourseStartTime(e.target.value)}
                  className="w-full px-2 py-1 bg-transparent border border-[var(--border)] text-[var(--ink)] text-xs font-mono focus:outline-none focus:border-[var(--ink)] rounded-none"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-[9px] text-[var(--ink-dim)] block">
                  {t('endTime')}
                </label>
                <input
                  type="time"
                  required
                  value={courseEndTime}
                  onChange={(e) => setCourseEndTime(e.target.value)}
                  className="w-full px-2 py-1 bg-transparent border border-[var(--border)] text-[var(--ink)] text-xs font-mono focus:outline-none focus:border-[var(--ink)] rounded-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
