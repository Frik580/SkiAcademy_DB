import { useCourseStore } from '../../store/courseStore';
import { Course } from '../../types';

export const selectCourses = (state: ReturnType<typeof useCourseStore.getState>): Course[] =>
  state.courses;
