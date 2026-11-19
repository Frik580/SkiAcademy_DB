import { create } from 'zustand';
import { Course } from '../../types';

export interface CoursesState {
  courses: Course[];
  catalogueScope: 'full' | 'instructor';
  publicCoursesStatus: 'loading' | 'ready' | 'error';
  publicCoursesRetryNonce: number;

  setCourses: (courses: Course[]) => void;
  retryPublicCourses: () => void;
}

export const useCoursesStore = create<CoursesState>((set) => ({
  courses: [],
  catalogueScope: 'full',
  publicCoursesStatus: 'loading',
  publicCoursesRetryNonce: 0,

  setCourses: (courses) => set({ courses }),
  retryPublicCourses: () =>
    set((state) => ({
      publicCoursesStatus: 'loading',
      publicCoursesRetryNonce: state.publicCoursesRetryNonce + 1,
    })),
}));

// Backward compatibility alias
export const useCourseStore = useCoursesStore;
