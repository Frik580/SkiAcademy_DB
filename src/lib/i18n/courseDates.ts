import type { Language } from './translations';
import { logger } from '../logger';

export function parseCourseDates(datesStr: string) {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);
  let startTime = '09:00';
  let endTime = '13:00';

  if (!datesStr) {
    return { start, end, startTime, endTime };
  }

  try {
    const timeMatch = datesStr.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
    }

    let cleanDatesStr = datesStr.replace(/,?\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/, '').trim();

    const ruMonthMap: { [key: string]: string } = {
      января: 'January',
      февраля: 'February',
      марта: 'March',
      апреля: 'April',
      мая: 'May',
      июня: 'June',
      июля: 'July',
      августа: 'August',
      сентября: 'September',
      октября: 'October',
      ноября: 'November',
      декабря: 'December',
      январь: 'January',
      февраль: 'February',
      март: 'March',
      апрель: 'April',
      май: 'May',
      июнь: 'June',
      июль: 'July',
      август: 'August',
      сентябрь: 'September',
      октябрь: 'October',
      ноябрь: 'November',
      декабрь: 'December',
    };

    Object.keys(ruMonthMap).forEach((ruMonth) => {
      const regex = new RegExp(ruMonth, 'gi');
      cleanDatesStr = cleanDatesStr.replace(regex, ruMonthMap[ruMonth]);
    });

    const parts = cleanDatesStr.split(/[-–]|to/);
    if (parts.length === 1) {
      const parsedDate = new Date(parts[0].trim());
      if (!isNaN(parsedDate.getTime())) {
        start = parsedDate;
        end = parsedDate;
      }
    } else if (parts.length === 2) {
      let startPart = parts[0].trim();
      let endPart = parts[1].trim();

      const hasMonth = /[a-zA-Z]/.test(startPart);
      if (!hasMonth) {
        const monthMatch = endPart.match(/([a-zA-Z]+)/);
        if (monthMatch) {
          startPart = `${monthMatch[1]} ${startPart}`;
        }
      }

      const endHasMonth = /[a-zA-Z]/.test(endPart);
      if (!endHasMonth) {
        const monthMatch = startPart.match(/([a-zA-Z]+)/);
        if (monthMatch) {
          endPart = `${monthMatch[1]} ${endPart}`;
        }
      }

      const yearMatch = endPart.match(/(\d{4})/);
      if (yearMatch && !startPart.includes(yearMatch[1])) {
        startPart = `${startPart}, ${yearMatch[1]}`;
      }

      const parsedStart = new Date(startPart);
      const parsedEnd = new Date(endPart);

      if (!isNaN(parsedStart.getTime())) start = parsedStart;
      if (!isNaN(parsedEnd.getTime())) end = parsedEnd;
    }
  } catch (e) {
    logger.warn('Failed to parse course dates:', e);
  }

  return { start, end, startTime, endTime };
}

export function parseCourseEndDateTime(datesStr: string): Date | null {
  if (!datesStr || !datesStr.trim()) return null;

  try {
    let endTimeStr = '23:59';
    const timeMatch = datesStr.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (timeMatch) {
      endTimeStr = timeMatch[2];
    }

    let cleanDatesStr = datesStr.replace(/,?\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/, '').trim();

    const ruMonthMap: { [key: string]: string } = {
      января: 'January',
      февраля: 'February',
      марта: 'March',
      апреля: 'April',
      мая: 'May',
      июня: 'June',
      июля: 'July',
      августа: 'August',
      сентября: 'September',
      октября: 'October',
      ноября: 'November',
      декабря: 'December',
      январь: 'January',
      февраль: 'February',
      март: 'March',
      апрель: 'April',
      май: 'May',
      июнь: 'June',
      июль: 'July',
      август: 'August',
      сентябрь: 'September',
      октябрь: 'October',
      ноябрь: 'November',
      декабрь: 'December',
    };

    Object.keys(ruMonthMap).forEach((ruMonth) => {
      const regex = new RegExp(ruMonth, 'gi');
      cleanDatesStr = cleanDatesStr.replace(regex, ruMonthMap[ruMonth]);
    });

    const parts = cleanDatesStr.split(/[-–]|to/);
    let endPart = '';

    if (parts.length === 1) {
      endPart = parts[0].trim();
    } else if (parts.length >= 2) {
      const startPart = parts[0].trim();
      endPart = parts[1].trim();

      const endHasMonth = /[a-zA-Z]/.test(endPart);
      if (!endHasMonth) {
        const monthMatch = startPart.match(/([a-zA-Z]+)/);
        if (monthMatch) {
          endPart = `${monthMatch[1]} ${endPart}`;
        }
      }

      const yearMatch = endPart.match(/(\d{4})/);
      if (!yearMatch) {
        const startYearMatch = startPart.match(/(\d{4})/);
        if (startYearMatch) {
          endPart = `${endPart}, ${startYearMatch[1]}`;
        }
      }
    }

    if (!endPart) return null;

    const parsedEnd = new Date(endPart);
    if (isNaN(parsedEnd.getTime())) return null;

    const [h, m] = endTimeStr.split(':').map(Number);
    const hour = isNaN(h) ? 23 : h;
    const minute = isNaN(m) ? 59 : m;

    return new Date(
      parsedEnd.getFullYear(),
      parsedEnd.getMonth(),
      parsedEnd.getDate(),
      hour,
      minute,
      59
    );
  } catch (e) {
    logger.warn('Failed to parse course end date time:', e);
    return null;
  }
}

export function parseDurationHours(durationStr: string, fallback: number = 1): number {
  if (!durationStr) return fallback;
  const hoursMatch =
    durationStr.match(/\((\d+)\s*(?:Hours?|часов|часа|час|ч|hours?|hrs?)\)/i) ||
    durationStr.match(/(\d+)\s*(?:Hours?|часов|часа|час|ч|hours?|hrs?)/i);
  if (hoursMatch) {
    return Number(hoursMatch[1]);
  }
  const numbers = durationStr.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    return Number(numbers.length > 1 ? numbers[1] : numbers[0]);
  }
  return fallback;
}

export function getGroupScheduleLabel(language: Language): string {
  return language === 'ru' ? 'Групповое расписание' : 'Group Schedule';
}

export function splitCourseDates(datesStr: string, language: Language = 'en') {
  const fallbackTime = getGroupScheduleLabel(language);
  if (!datesStr) return { datePart: '', timePart: fallbackTime };

  const timeMatch = datesStr.match(/(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/);
  if (timeMatch) {
    const timePart = timeMatch[1];
    let datePart = datesStr.replace(timePart, '').replace(/,\s*,/g, ',').trim();
    if (datePart.endsWith(',')) {
      datePart = datePart.slice(0, -1).trim();
    }
    return { datePart, timePart };
  }

  return { datePart: datesStr, timePart: fallbackTime };
}

export function formatCourseDates(
  start: Date,
  end: Date,
  startTime: string,
  endTime: string,
  lang: Language
) {
  const monthsEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthsRu = [
    'Января',
    'Февраля',
    'Марта',
    'Апреля',
    'Мая',
    'Июня',
    'Июля',
    'Августа',
    'Сентября',
    'Октября',
    'Ноября',
    'Декабря',
  ];

  const startDay = start.getDate();
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();

  const endDay = end.getDate();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();

  let formattedDates = '';

  if (start.toDateString() === end.toDateString()) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} ${startYear}`;
    }
  } else if (startMonth === endMonth && startYear === endYear) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay} - ${endDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} - ${endDay} ${monthsRu[startMonth]} ${startYear}`;
    }
  } else if (startYear === endYear) {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay} - ${monthsEn[endMonth]} ${endDay}, ${startYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} - ${endDay} ${monthsRu[endMonth]} ${startYear}`;
    }
  } else {
    if (lang === 'en') {
      formattedDates = `${monthsEn[startMonth]} ${startDay}, ${startYear} - ${monthsEn[endMonth]} ${endDay}, ${endYear}`;
    } else {
      formattedDates = `${startDay} ${monthsRu[startMonth]} ${startYear} - ${endDay} ${monthsRu[endMonth]} ${endYear}`;
    }
  }

  if (startTime && endTime) {
    formattedDates += `, ${startTime} - ${endTime}`;
  }

  return formattedDates;
}
export const MONTHS_SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatShortBookingDate(
  booking: { instructorId: string; date: string; time: string },
  language: Language,
  courses?: { id: string; dates: string }[]
): string {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = (courses || []).find((c) => c.id === courseId);
    const rawDates = course ? course.dates : booking.date;
    const parsed = parseCourseDates(rawDates);

    const startDay = parsed.start.getDate();
    const startMonth = parsed.start.getMonth() + 1;
    const endDay = parsed.end.getDate();
    const endMonth = parsed.end.getMonth() + 1;

    if (language === 'ru') {
      const startMonthName = MONTHS_SHORT_RU[startMonth - 1] || 'июл';
      const endMonthName = MONTHS_SHORT_RU[endMonth - 1] || 'июл';
      if (startMonth === endMonth) {
        return `${startDay}-${endDay} ${startMonthName}`;
      }
      return `${startDay} ${startMonthName} - ${endDay} ${endMonthName}`;
    }

    const startMonthName = MONTHS_SHORT_EN[startMonth - 1] || 'Jul';
    const endMonthName = MONTHS_SHORT_EN[endMonth - 1] || 'Jul';
    if (startMonth === endMonth) {
      return `${startMonthName} ${startDay}-${endDay}`;
    }
    return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}`;
  }

  const [, monthStr, dayStr] = booking.date.split('-');
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);

  if (language === 'ru') {
    const monthName = MONTHS_SHORT_RU[month - 1] || 'июл';
    return `${day} ${monthName} в ${booking.time}`;
  }

  const monthName = MONTHS_SHORT_EN[month - 1] || 'Jul';
  return `${monthName} ${day} at ${booking.time}`;
}

export const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const MONTHS_SHORT_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
