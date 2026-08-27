import { create } from 'zustand';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';

interface LessonBookingStoreState {
  readonly items: ReadonlyMap<string, LessonBookingCabinetItem>;
  readonly itemsList: readonly LessonBookingCabinetItem[];
  readonly hotLoading: boolean;
  readonly historyLoading: boolean;
  readonly historyHasMore: boolean;
  readonly historyCursor?: string;
  readonly loaded: boolean;
  readonly error?: string;
  readonly historyRequestNonce: number;
  setItems: (items: ReadonlyMap<string, LessonBookingCabinetItem>) => void;
  mergeItems: (items: ReadonlyMap<string, LessonBookingCabinetItem>) => void;
  setHotLoading: (loading: boolean) => void;
  setHistoryLoading: (loading: boolean) => void;
  setHistoryHasMore: (hasMore: boolean) => void;
  setHistoryCursor: (cursor?: string) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  requestHistoryPage: () => void;
  reset: () => void;
}

const EMPTY_ITEMS_LIST: readonly LessonBookingCabinetItem[] = [];

export function buildLessonBookingItemsList(
  items: ReadonlyMap<string, LessonBookingCabinetItem>
): LessonBookingCabinetItem[] {
  return [...items.values()].sort((left, right) => right.date.localeCompare(left.date));
}

const initialState = {
  items: new Map<string, LessonBookingCabinetItem>(),
  itemsList: EMPTY_ITEMS_LIST,
  hotLoading: false,
  historyLoading: false,
  historyHasMore: true,
  historyCursor: undefined,
  loaded: false,
  error: undefined,
  historyRequestNonce: 0,
};

export const useLessonBookingStore = create<LessonBookingStoreState>((set) => ({
  ...initialState,
  setItems: (items) =>
    set({
      items,
      itemsList: buildLessonBookingItemsList(items),
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
        itemsList: buildLessonBookingItemsList(merged),
      };
    }),
  setHotLoading: (hotLoading) => set({ hotLoading }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setHistoryHasMore: (historyHasMore) => set({ historyHasMore }),
  setHistoryCursor: (historyCursor) => set({ historyCursor }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  requestHistoryPage: () =>
    set((state) => ({ historyRequestNonce: state.historyRequestNonce + 1 })),
  reset: () =>
    set({
      ...initialState,
      items: new Map(),
      itemsList: EMPTY_ITEMS_LIST,
    }),
}));

/** Stable snapshot for Zustand selectors — do not sort/allocate in selector callbacks. */
export function selectLessonBookingItems(state: LessonBookingStoreState): readonly LessonBookingCabinetItem[] {
  return state.itemsList;
}

export function selectLessonBookingById(
  state: LessonBookingStoreState,
  bookingId: string
): LessonBookingCabinetItem | undefined {
  return state.items.get(bookingId);
}
