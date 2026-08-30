import { create } from 'zustand';
import type {
  InstructorAssignedCourseRef,
  InstructorCourseViewModel,
} from './instructorCourseContracts';
import { buildInstructorCourseViewModelsList } from './instructorCourseStoreSelectors';

interface InstructorCourseStoreState {
  readonly assignedCourses: readonly InstructorAssignedCourseRef[];
  readonly coursesById: ReadonlyMap<string, InstructorCourseViewModel>;
  readonly coursesList: readonly InstructorCourseViewModel[];
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
  setAssignedCourses: (courses: readonly InstructorAssignedCourseRef[]) => void;
  mergeCourses: (courses: ReadonlyMap<string, InstructorCourseViewModel>) => void;
  setLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  reset: () => void;
}

const EMPTY_COURSES_LIST: readonly InstructorCourseViewModel[] = [];

const initialState = {
  assignedCourses: [] as InstructorAssignedCourseRef[],
  coursesById: new Map<string, InstructorCourseViewModel>(),
  coursesList: EMPTY_COURSES_LIST,
  loading: false,
  loaded: false,
  error: undefined as string | undefined,
};

export const useInstructorCourseStore = create<InstructorCourseStoreState>((set) => ({
  ...initialState,
  setAssignedCourses: (assignedCourses) => set({ assignedCourses }),
  mergeCourses: (courses) =>
    set((state) => {
      const merged = new Map(state.coursesById);
      let changed = false;
      for (const [courseId, viewModel] of courses) {
        const cached = merged.get(courseId);
        if (
          !cached ||
          cached.courseScheduleRevision !== viewModel.courseScheduleRevision ||
          cached.participants.length !== viewModel.participants.length
        ) {
          merged.set(courseId, viewModel);
          changed = true;
          continue;
        }
        const participantRevisionsChanged = viewModel.participants.some((participant, index) => {
          const cachedParticipant = cached.participants[index];
          return (
            !cachedParticipant ||
            cachedParticipant.enrollmentRevision !== participant.enrollmentRevision ||
            cachedParticipant.days.some((day, dayIndex) => {
              const cachedDay = cachedParticipant.days[dayIndex];
              return (
                !cachedDay ||
                cachedDay.factualState !== day.factualState ||
                cachedDay.attendanceRevision !== day.attendanceRevision
              );
            })
          );
        });
        if (participantRevisionsChanged) {
          merged.set(courseId, viewModel);
          changed = true;
        }
      }
      if (!changed) {
        return state;
      }
      return {
        coursesById: merged,
        coursesList: buildInstructorCourseViewModelsList(merged),
      };
    }),
  setLoading: (loading) => set({ loading }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      ...initialState,
      coursesById: new Map(),
      coursesList: EMPTY_COURSES_LIST,
    }),
}));

export function selectInstructorCourseViewModel(
  state: InstructorCourseStoreState,
  courseId: string
): InstructorCourseViewModel | undefined {
  return state.coursesById.get(courseId);
}
