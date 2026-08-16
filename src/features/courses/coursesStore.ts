import { create } from 'zustand';
import { Course } from '../../types';

export interface CoursesState {
  courses: Course[];

  setCourses: (courses: Course[]) => void;
}

export const useCoursesStore = create<CoursesState>((set) => ({
  courses: [],

  setCourses: (courses) => set({ courses }),
}));

// Backward compatibility alias
export const useCourseStore = useCoursesStore;
