import { Booking, Course } from '../../../../types';
import { getDifficultyLabel } from '../../../../lib/LanguageContext';
import { translateInstructorName } from '../../../../lib/i18n/contentTranslation';
import { formatRecentLessonDateLabel, getRecentLessonTitle } from './studentLessonPresentation';

export interface TodayTaskBookingContext {
  bookingId: string;
  title: string;
  dateLabel: string;
  isCourse: boolean;
}

export const getTodayTaskBookingContext = (
  booking: Booking,
  courses: Course[],
  language: 'en' | 'ru'
): TodayTaskBookingContext => {
  const isCourse = booking.instructorId.startsWith('course_');
  const instructorName = translateInstructorName(booking.instructorName, language);
  return {
    bookingId: booking.id,
    title: isCourse
      ? getRecentLessonTitle(booking, courses, language)
      : `${getDifficultyLabel(booking.difficulty, language, 'short')} — ${instructorName}`,
    dateLabel: formatRecentLessonDateLabel(booking, courses, language),
    isCourse,
  };
};
