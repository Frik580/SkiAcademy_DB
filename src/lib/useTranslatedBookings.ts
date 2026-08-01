import { useMemo } from 'react';
import { Booking, Course } from '../types';
import type { Language } from './i18n/translations';
import { translateInstructorName, translateCourse } from './i18n/contentTranslation';
import { parseDurationHours, splitCourseDates, getGroupScheduleLabel } from './i18n/courseDates';
import { getGroupCourseEnrollmentNote, getGroupCourseLabel } from './i18n/bookingLabels';

export type TranslatedBooking = Booking & { chatId: string };

export interface UseTranslatedBookingsOptions {
  /** Sync totalPrice from live course data (admin panel). */
  syncCoursePrice?: boolean;
}

export function useTranslatedBookings(
  rawBookings: Booking[],
  courses: Course[] | undefined,
  language: Language,
  options: UseTranslatedBookingsOptions = {}
): TranslatedBooking[] {
  const { syncCoursePrice = false } = options;

  return useMemo(() => {
    const courseList = courses || [];
    return rawBookings.map((b) => {
      const isCourse = b.instructorId.startsWith('course_');
      let name = b.instructorName;
      let avatar = b.instructorAvatar;
      let durationHours = b.durationHours;
      let notes = b.notes;
      let date = b.date;
      let time = b.time;
      let totalPrice = b.totalPrice;

      const chatId = isCourse ? b.instructorId.replace('course_', '') : b.id;

      if (isCourse) {
        const courseId = b.instructorId.replace('course_', '');
        const liveCourse = courseList.find((c) => c.id === courseId);

        if (liveCourse) {
          const translated = translateCourse(liveCourse, language);
          name = getGroupCourseLabel(translated.title, language);
          avatar = translated.bgImageUrl || b.instructorAvatar;
          durationHours = parseDurationHours(translated.duration, b.durationHours);

          const defaultRu = getGroupCourseEnrollmentNote(liveCourse.description, 'ru');
          const defaultEn = getGroupCourseEnrollmentNote(liveCourse.description, 'en');
          const translatedDefaultRu = getGroupCourseEnrollmentNote(translated.description, 'ru');
          const translatedDefaultEn = getGroupCourseEnrollmentNote(translated.description, 'en');

          const rawNote = (b.notes || '').trim();
          const isDefaultCourseNote =
            !rawNote ||
            rawNote === defaultRu ||
            rawNote === defaultEn ||
            rawNote === translatedDefaultRu ||
            rawNote === translatedDefaultEn;

          if (isDefaultCourseNote) {
            notes = getGroupCourseEnrollmentNote(translated.description, language);
          } else {
            notes = b.notes;
          }

          if (syncCoursePrice) {
            totalPrice = liveCourse.price;
          }

          if (translated.dates) {
            const { datePart, timePart } = splitCourseDates(translated.dates, language);
            date = datePart;
            time = timePart;
          }
        } else {
          if (name.includes('(Group Course)') || name.includes('(Групповой курс)')) {
            const cleanTitle = name
              .replace(/\s*\(Group Course\)/i, '')
              .replace(/\s*\(Групповой курс\)/i, '')
              .trim();
            const dummyCourse: Course = {
              id: '',
              title: cleanTitle,
              duration: '',
              description: '',
              dates: '',
              totalSeats: 0,
              availableSeats: 0,
              price: 0,
              bgImageUrl: '',
            };
            const translated = translateCourse(dummyCourse, language);
            name = getGroupCourseLabel(translated.title, language);
          }
          if (
            time === 'Group Schedule' ||
            time === getGroupScheduleLabel('ru') ||
            time === getGroupScheduleLabel('en')
          ) {
            const { datePart, timePart } = splitCourseDates(date, language);
            date = datePart;
            time = timePart;
          }
        }
      } else {
        name = translateInstructorName(name, language);
      }

      return {
        ...b,
        instructorName: name,
        instructorAvatar: avatar,
        durationHours,
        notes,
        date,
        time,
        totalPrice,
        chatId,
      };
    });
  }, [rawBookings, courses, language, syncCoursePrice]);
}
