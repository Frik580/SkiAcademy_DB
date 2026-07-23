import { useEffect, useMemo, useState } from 'react';
import {
  formatCourseDates,
  parseCourseDates,
  useLanguage,
} from '../../lib/LanguageContext';
import { formatDateLocalYMD } from './scheduleUtils';
import { getDaysInMonth } from './courseCalendarUtils';

export function useCourseDateRange() {
  const { language } = useLanguage();
  const [courseDuration, setCourseDuration] = useState('');
  const [courseDates, setCourseDates] = useState('');
  const [courseStartDate, setCourseStartDate] = useState<string>(() => formatDateLocalYMD(new Date()));
  const [courseEndDate, setCourseEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return formatDateLocalYMD(d);
  });
  const [courseStartTime, setCourseStartTime] = useState<string>('09:00');
  const [courseEndTime, setCourseEndTime] = useState<string>('13:00');
  const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() => new Date());
  const [showCalendarPopover, setShowCalendarPopover] = useState<boolean>(false);

  // Automatically recalculate course dates and duration
  useEffect(() => {
    if (courseStartDate && courseEndDate) {
      const start = new Date(courseStartDate);
      const end = new Date(courseEndDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const formatted = formatCourseDates(start, end, courseStartTime, courseEndTime, language);
        setCourseDates(formatted);

        // Auto-calculate Duration
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        let hoursPerDay = 4; // default
        if (courseStartTime && courseEndTime) {
          const [startH, startM] = courseStartTime.split(':').map(Number);
          const [endH, endM] = courseEndTime.split(':').map(Number);
          hoursPerDay = (endH + endM / 60) - (startH + startM / 60);
          if (hoursPerDay <= 0) hoursPerDay = 4;
        }
        
        const totalHours = Math.round(diffDays * hoursPerDay);
        
        let durationText = "";
        if (language === 'en') {
          const daysStr = diffDays === 1 ? "1 Day" : `${diffDays} Days`;
          durationText = `${daysStr} (${totalHours} Hours)`;
        } else {
          const daysStr = diffDays === 1 ? "1 день" : (diffDays >= 2 && diffDays <= 4 ? `${diffDays} дня` : `${diffDays} дней`);
          durationText = `${daysStr} (${totalHours} ч.)`;
        }
        setCourseDuration(durationText);
      }
    }
  }, [courseStartDate, courseEndDate, courseStartTime, courseEndTime, language]);

  const calendarDays = useMemo(() => {
    return getDaysInMonth(calendarViewMonth);
  }, [calendarViewMonth]);

  const handlePrevMonth = () => {
    setCalendarViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleCalendarDayClick = (dayDate: Date) => {
    const dateStr = formatDateLocalYMD(dayDate);
    
    const startObj = courseStartDate ? new Date(courseStartDate) : null;

    // If no start date, or both are set and they are different (starting a new selection),
    // or if the clicked date is before start date, treat it as a new start date.
    if (!courseStartDate || (courseStartDate && courseEndDate && courseStartDate !== courseEndDate) || (startObj && dayDate < startObj)) {
      setCourseStartDate(dateStr);
      setCourseEndDate(dateStr);
    } else {
      setCourseEndDate(dateStr);
    }
  };

  const loadCourseDateRange = (dates: string, duration: string) => {
    setCourseDuration(duration);
    setCourseDates(dates);

    const parsed = parseCourseDates(dates);
    setCourseStartDate(formatDateLocalYMD(parsed.start));
    setCourseEndDate(formatDateLocalYMD(parsed.end));
    setCourseStartTime(parsed.startTime);
    setCourseEndTime(parsed.endTime);
    setCalendarViewMonth(new Date(parsed.start));
  };

  const resetCourseDateRange = () => {
    setCourseDuration('');
    setCourseDates('');

    const today = new Date();
    setCourseStartDate(formatDateLocalYMD(today));
    const afterTwoDays = new Date();
    afterTwoDays.setDate(today.getDate() + 2);
    setCourseEndDate(formatDateLocalYMD(afterTwoDays));
    setCourseStartTime('09:00');
    setCourseEndTime('13:00');
    setCalendarViewMonth(new Date());
  };

  return {
    courseDuration,
    setCourseDuration,
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
    loadCourseDateRange,
    resetCourseDateRange,
  };
}

export type CourseDateRangeState = ReturnType<typeof useCourseDateRange>;
