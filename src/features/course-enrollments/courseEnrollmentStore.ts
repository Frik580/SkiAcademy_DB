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
  readonly scopedParticipantId?: string;
  readonly loadGeneration: number;
  setItems: (items: ReadonlyMap<string, CourseEnrollmentCabinetItem>) => void;
  mergeItems: (items: ReadonlyMap<string, CourseEnrollmentCabinetItem>) => void;
  mergeCatalog: (catalog: ReadonlyMap<string, CourseCatalogOperationalState>) => void;
  beginScopedLoad: (participantId: string) => number;
  applyScopedItems: (input: {
    readonly participantId: string;
    readonly generation: number;
    readonly incoming: ReadonlyMap<string, CourseEnrollmentCabinetItem>;
    readonly mode: 'replace' | 'merge';
  }) => boolean;
  setHotLoading: (loading: boolean) => void;
  setHistoryLoading: (loading: boolean) => void;
  setHistoryHasMore: (hasMore: boolean) => void;
  setHistoryCursor: (cursor?: string) => void;
  setCatalogLoading: (loading: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  requestHistoryPage: () => void;
  clearScopedEnrollments: () => void;
  reset: () => void;
}

const EMPTY_ENROLLMENT_LIST: readonly CourseEnrollmentCabinetItem[] = [];

function enrollmentsForParticipant(
  items: ReadonlyMap<string, CourseEnrollmentCabinetItem>,
  participantId: string
): Map<string, CourseEnrollmentCabinetItem> {
  const next = new Map<string, CourseEnrollmentCabinetItem>();
  for (const [key, value] of items) {
    if (value.participantId === participantId) {
      next.set(key, value);
    }
  }
  return next;
}

function mergeEnrollmentMaps(
  existing: ReadonlyMap<string, CourseEnrollmentCabinetItem>,
  incoming: ReadonlyMap<string, CourseEnrollmentCabinetItem>
): { readonly items: Map<string, CourseEnrollmentCabinetItem>; readonly changed: boolean } {
  const merged = new Map(existing);
  let changed = false;
  for (const [key, value] of incoming) {
    const cached = merged.get(key);
    if (!cached || value.revision >= cached.revision) {
      if (!cached || cached.revision !== value.revision) {
        merged.set(key, value);
        changed = true;
      }
    }
  }
  return { items: merged, changed };
}

export function buildCourseEnrollmentItemsList(
  items: ReadonlyMap<string, CourseEnrollmentCabinetItem>
): CourseEnrollmentCabinetItem[] {
  return [...items.values()].sort((left, right) =>
    right.scheduleStartDate.localeCompare(left.scheduleStartDate)
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
  scopedParticipantId: undefined as string | undefined,
  loadGeneration: 0,
};

export const useCourseEnrollmentStore = create<CourseEnrollmentStoreState>((set, get) => ({
  ...initialState,
  setItems: (items) =>
    set({
      items,
      itemsList: buildCourseEnrollmentItemsList(items),
    }),
  mergeItems: (items) =>
    set((state) => {
      const incoming = state.scopedParticipantId
        ? enrollmentsForParticipant(items, state.scopedParticipantId)
        : items;
      const { items: merged, changed } = mergeEnrollmentMaps(state.items, incoming);
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
  beginScopedLoad: (participantId) => {
    const current = get();
    const switched = current.scopedParticipantId !== participantId;
    const generation = current.loadGeneration + 1;
    set({
      scopedParticipantId: participantId,
      loadGeneration: generation,
      hotLoading: true,
      error: undefined,
      ...(switched
        ? {
            items: new Map(),
            itemsList: EMPTY_ENROLLMENT_LIST,
            historyCursor: undefined,
            historyHasMore: true,
            historyLoading: false,
            loaded: false,
            historyRequestNonce: 0,
          }
        : {}),
    });
    return generation;
  },
  applyScopedItems: ({ participantId, generation, incoming, mode }) => {
    const state = get();
    if (state.loadGeneration !== generation || state.scopedParticipantId !== participantId) {
      return false;
    }
    const filteredIncoming = enrollmentsForParticipant(incoming, participantId);
    if (mode === 'replace') {
      set({
        items: filteredIncoming,
        itemsList: buildCourseEnrollmentItemsList(filteredIncoming),
      });
      return true;
    }
    const { items: merged, changed } = mergeEnrollmentMaps(state.items, filteredIncoming);
    if (!changed) {
      return true;
    }
    set({
      items: merged,
      itemsList: buildCourseEnrollmentItemsList(merged),
    });
    return true;
  },
  setHotLoading: (hotLoading) => set({ hotLoading }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setHistoryHasMore: (historyHasMore) => set({ historyHasMore }),
  setHistoryCursor: (historyCursor) => set({ historyCursor }),
  setCatalogLoading: (catalogLoading) => set({ catalogLoading }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  requestHistoryPage: () =>
    set((state) => ({ historyRequestNonce: state.historyRequestNonce + 1 })),
  clearScopedEnrollments: () =>
    set({
      items: new Map(),
      itemsList: EMPTY_ENROLLMENT_LIST,
      scopedParticipantId: undefined,
      loadGeneration: 0,
      hotLoading: false,
      historyLoading: false,
      historyHasMore: true,
      historyCursor: undefined,
      loaded: false,
      error: undefined,
      historyRequestNonce: 0,
    }),
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
