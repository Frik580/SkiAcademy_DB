import type { CoursesState } from './coursesStore';
import { Course } from '../../types';

export const selectCourses = (state: CoursesState): Course[] => state.courses;
