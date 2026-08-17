import { Booking, Course } from '../../../../types';
import { getDifficultyLabel, parseCourseDates } from '../../../../lib/LanguageContext';
import {
  translateCourse,
  translateInstructorName,
} from '../../../../lib/i18n/contentTranslation';
import { toYMD } from './studentCabinetPresentation';

const getCourse = (booking: Booking, courses: Course[]) => {
  const courseId = booking.instructorId.substring('course_'.length);
  return courses.find((course) => course.id === courseId);
};

export const resolveBookingStartDate = (booking: Booking, courses: Course[]) => {
  if (!booking.instructorId.startsWith('course_')) return booking.date;
  const course = getCourse(booking, courses);
  return toYMD(parseCourseDates(course ? course.dates : booking.date).start);
};

/** Instructor homework stays in «Today» only for recent lessons. */
export const RECOMMENDATION_TODAY_WINDOW_DAYS = 14;

export const getLessonAgeDays = (
  booking: Booking,
  courses: Course[],
  fromDate = new Date()
): number | null => {
  const lessonDate = new Date(`${resolveBookingStartDate(booking, courses)}T12:00:00`);
  if (Number.isNaN(lessonDate.getTime())) return null;
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());
  return Math.floor((today.getTime() - lessonDay.getTime()) / 86_400_000);
};

export const isBookingInTodayRecommendationWindow = (
  booking: Booking,
  courses: Course[],
  maxDays = RECOMMENDATION_TODAY_WINDOW_DAYS,
  fromDate = new Date()
) => {
  const ageDays = getLessonAgeDays(booking, courses, fromDate);
  return ageDays === null || (ageDays >= 0 && ageDays <= maxDays);
};

export const formatBookingDayMonth = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const dateStr = resolveBookingStartDate(booking, courses);
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export const formatCourseDateRangeLabel = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const course = getCourse(booking, courses);
  const schedule = parseCourseDates(course ? course.dates : booking.date);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const start = schedule.start.toLocaleDateString(locale, options);
  const end = schedule.end.toLocaleDateString(locale, options);
  return start === end ? start : `${start} — ${end}`;
};

export const formatRecentLessonDateLabel = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) =>
  booking.instructorId.startsWith('course_')
    ? formatCourseDateRangeLabel(booking, courses, language)
    : formatBookingDayMonth(booking, courses, language);

export const getRecentLessonTitle = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
) => {
  if (!booking.instructorId.startsWith('course_')) {
    return getDifficultyLabel(booking.difficulty, language, 'short');
  }
  const course = getCourse(booking, courses);
  if (course) return translateCourse(course, language).title;
  const cleanName = booking.instructorName
    .replace(/\s*\((Групповой курс|Group Course)\)\s*$/i, '')
    .trim();
  return translateInstructorName(cleanName, language);
};

export const getRecentLessonInstructorLabel = (booking: Booking, language: 'en' | 'ru') =>
  booking.instructorId.startsWith('course_')
    ? language === 'ru'
      ? 'Групповой курс'
      : 'Group course'
    : translateInstructorName(booking.instructorName, language);
