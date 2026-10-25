import { translateCourse } from '../../../../app/providers/LanguageContext';
import type { Course } from '../../../../types';
import type { ScheduleCourse } from './scheduleContracts';

/** Adapts the schedule's minimal course view for shared course presentation. */
export const getScheduleCourseTitle = (
  course: ScheduleCourse,
  language: Parameters<typeof translateCourse>[1]
) => translateCourse(course as Course, language).title;
