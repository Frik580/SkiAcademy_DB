import { create } from 'zustand';
import type {
  InstructorAssignedCourseRef,
  InstructorCourseReadErrorCode,
  InstructorCourseViewModel,
} from './instructorCourseContracts';
import { buildInstructorCourseViewModelsList } from './instructorCourseStoreSelectors';

interface InstructorCourseStoreState {
  readonly assignedCourses: readonly InstructorAssignedCourseRef[];
  readonly coursesById: ReadonlyMap<string, InstructorCourseViewModel>;
  readonly coursesList: readonly InstructorCourseViewModel[];
  readonly discoveryLoading: boolean;
  readonly discoveryLoadingMore: boolean;
  readonly discoveryHasMore: boolean;
  readonly discoveryNextCursor?: string;
  readonly rosterLoading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
  readonly errorCode?: InstructorCourseReadErrorCode;
  setAssignedCourses: (courses: readonly InstructorAssignedCourseRef[]) => void;
  appendAssignedCourses: (courses: readonly InstructorAssignedCourseRef[]) => void;
  setDiscoveryPagination: (input: Readonly<{ hasMore: boolean; nextCursor?: string }>) => void;
  mergeCourses: (courses: ReadonlyMap<string, InstructorCourseViewModel>) => void;
  setDiscoveryLoading: (loading: boolean) => void;
  setDiscoveryLoadingMore: (loading: boolean) => void;
  setRosterLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string, errorCode?: InstructorCourseReadErrorCode) => void;
  reset: () => void;
}

const EMPTY_COURSES_LIST: readonly InstructorCourseViewModel[] = [];

const initialState = {
  assignedCourses: [] as InstructorAssignedCourseRef[],
  coursesById: new Map<string, InstructorCourseViewModel>(),
  coursesList: EMPTY_COURSES_LIST,
  discoveryLoading: false,
  discoveryLoadingMore: false,
  discoveryHasMore: false,
  discoveryNextCursor: undefined as string | undefined,
  rosterLoading: false,
  loaded: false,
  error: undefined as string | undefined,
  errorCode: undefined as InstructorCourseReadErrorCode | undefined,
};

export const useInstructorCourseStore = create<InstructorCourseStoreState>((set) => ({
  ...initialState,
  setAssignedCourses: (assignedCourses) =>
    set({ assignedCourses, discoveryHasMore: false, discoveryNextCursor: undefined }),
  appendAssignedCourses: (incoming) =>
    set((state) => {
      const byId = new Map(state.assignedCourses.map((course) => [course.courseId, course]));
      for (const course of incoming) {
        byId.set(course.courseId, course);
      }
      return {
        assignedCourses: [...byId.values()].sort((left, right) =>
          left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
        ),
      };
    }),
  setDiscoveryPagination: (input) =>
    set({
      discoveryHasMore: input.hasMore,
      discoveryNextCursor: input.nextCursor,
    }),
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
            cachedParticipant.authorizedActions.canRecordAttendance !==
              participant.authorizedActions.canRecordAttendance ||
            cachedParticipant.days.length !== participant.days.length ||
            participant.days.some((day, dayIndex) => {
              const cachedDay = cachedParticipant.days[dayIndex];
              return (
                !cachedDay ||
                cachedDay.factualState !== day.factualState ||
                cachedDay.attendanceRevision !== day.attendanceRevision ||
                cachedDay.authorizedActions.canRecordAttendance !==
                  day.authorizedActions.canRecordAttendance
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
  setDiscoveryLoading: (discoveryLoading) => set({ discoveryLoading }),
  setDiscoveryLoadingMore: (discoveryLoadingMore) => set({ discoveryLoadingMore }),
  setRosterLoading: (rosterLoading) => set({ rosterLoading }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error, errorCode) => set({ error, errorCode }),
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
