import { create } from 'zustand';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';

interface LessonBookingStoreState {
  readonly items: ReadonlyMap<string, LessonBookingCabinetItem>;
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

const initialState = {
  items: new Map<string, LessonBookingCabinetItem>(),
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
  setItems: (items) => set({ items }),
  mergeItems: (items) =>
    set((state) => {
      const merged = new Map(state.items);
      for (const [key, value] of items) {
        const cached = merged.get(key);
        if (!cached || value.revision >= cached.revision) {
          merged.set(key, value);
        }
      }
      return { items: merged };
    }),
  setHotLoading: (hotLoading) => set({ hotLoading }),
  setHistoryLoading: (historyLoading) => set({ historyLoading }),
  setHistoryHasMore: (historyHasMore) => set({ historyHasMore }),
  setHistoryCursor: (historyCursor) => set({ historyCursor }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  requestHistoryPage: () =>
    set((state) => ({ historyRequestNonce: state.historyRequestNonce + 1 })),
  reset: () => set({ ...initialState, items: new Map() }),
}));

export function selectLessonBookingItems(
  state: LessonBookingStoreState
): LessonBookingCabinetItem[] {
  return [...state.items.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function selectLessonBookingById(
  state: LessonBookingStoreState,
  bookingId: string
): LessonBookingCabinetItem | undefined {
  return state.items.get(bookingId);
}
