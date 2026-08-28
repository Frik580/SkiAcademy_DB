import { create } from 'zustand';
import type {
  CourseCatalogOperationalState,
  CourseEnrollmentCabinetItem,
} from './courseEnrollmentContracts';

interface CourseEnrollmentStoreState {
  readonly items: ReadonlyMap<string, CourseEnrollmentCabinetItem>;
  readonly itemsList: readonly CourseEnrollmentCabinetItem[];
  readonly catalogByCourseId: ReadonlyMap<string, CourseCatalogOperationalState>;
  readonly hotLoading: boolean;
  readonly historyLoading: boolean;
  readonly historyHasMore: boolean;
  readonly historyCursor?: string;
  readonly catalogLoading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
  readonly historyRequestNonce: number;
  setItems: (items: ReadonlyMap<string, CourseEnrollmentCabinetItem>) => void;
  mergeItems: (items: ReadonlyMap<string, CourseEnrollmentCabinetItem>) => void;
  mergeCatalog: (catalog: ReadonlyMap<string, CourseCatalogOperationalState>) => void;
  setHotLoading: (loading: boolean) => void;
  setHistoryLoading: (loading: boolean) => void;
  setHistoryHasMore: (hasMore: boolean) => void;
  setHistoryCursor: (cursor?: string) => void;
  setCatalogLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  requestHistoryPage: () => void;
  reset: () => void;
}

const EMPTY_ENROLLMENT_LIST: readonly CourseEnrollmentCabinetItem[] = [];

export function buildCourseEnrollmentItemsList(
  items: ReadonlyMap<string, CourseEnrollmentCabinetItem>
): CourseEnrollmentCabinetItem[] {
  return [...items.values()].sort(
    (left, right) => right.scheduleStartDate.localeCompare(left.scheduleStartDate)
  );
}

const initialState = {
  items: new Map<string, CourseEnrollmentCabinetItem>(),
  itemsList: EMPTY_ENROLLMENT_LIST,
  catalogByCourseId: new Map<string, CourseCatalogOperationalState>(),
  hotLoading: false,
  historyLoading: false,
  historyHasMore: true,
  historyCursor: undefined,
  catalogLoading: false,
  loaded: false,
  error: undefined,
  historyRequestNonce: 0,
};

export const useCourseEnrollmentStore = create<CourseEnrollmentStoreState>((set) => ({
  ...initialState,
  setItems: (items) =>
    set({
      items,
      itemsList: buildCourseEnrollmentItemsList(items),
    }),
  mergeItems: (items) =>
    set((state) => {
      const merged = new Map(state.items);
      let changed = false;
      for (const [key, value] of items) {
        const cached = merged.get(key);
        if (!cached || value.revision >= cached.revision) {
          if (!cached || cached.revision !== value.revision) {
            merged.set(key, value);
            changed = true;
          }
        }
      }
      if (!changed) {
        return state;
      }
      return {
        items: merged,
        itemsList: buildCourseEnrollmentItemsList(merged),
      };
    }),
  mergeCatalog: (catalog) =>
    set((state) => {
      const merged = new Map(state.catalogByCourseId);
      let changed = false;
      for (const [key, value] of catalog) {
        const cached = merged.get(key);
        if (!cached || value.revision >= cached.revision) {
          if (!cached || cached.revision !== value.revision) {
            merged.set(key, value);
            changed = true;
          }
        }
      }
      if (!changed) {
        return state;
      }
      return { catalogByCourseId: merged };
    }),
  setHotLoading: (hotLoading) => set({ hotLoading }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setHistoryHasMore: (historyHasMore) => set({ historyHasMore }),
  setHistoryCursor: (historyCursor) => set({ historyCursor }),
  setCatalogLoading: (catalogLoading) => set({ catalogLoading }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  requestHistoryPage: () =>
    set((state) => ({ historyRequestNonce: state.historyRequestNonce + 1 })),
  reset: () =>
    set({
      ...initialState,
      items: new Map(),
      itemsList: EMPTY_ENROLLMENT_LIST,
      catalogByCourseId: new Map(),
    }),
}));

export function selectCourseEnrollmentItems(
  state: CourseEnrollmentStoreState
): readonly CourseEnrollmentCabinetItem[] {
  return state.itemsList;
}

export function selectCourseEnrollmentById(
  state: CourseEnrollmentStoreState,
  enrollmentId: string
): CourseEnrollmentCabinetItem | undefined {
  return state.items.get(enrollmentId);
}

export function selectCourseCatalogOperationalState(
  state: CourseEnrollmentStoreState,
  courseId: string
): CourseCatalogOperationalState | undefined {
  return state.catalogByCourseId.get(courseId);
}

export function selectAllCourseCatalogOperationalStates(
  state: CourseEnrollmentStoreState
): ReadonlyMap<string, CourseCatalogOperationalState> {
  return state.catalogByCourseId;
}
