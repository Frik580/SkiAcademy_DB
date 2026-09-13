import { create } from 'zustand';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';

export type CalendarMonthLoadStatus = 'loading' | 'loaded';

interface LessonBookingStoreState {
  readonly items: ReadonlyMap<string, LessonBookingCabinetItem>;
  readonly itemsList: readonly LessonBookingCabinetItem[];
  readonly hotLoading: boolean;
  readonly historyLoading: boolean;
  readonly historyHasMore: boolean;
  readonly historyInitialized: boolean;
  readonly historyLoadedAtMs?: number;
  readonly historyCursor?: string;
  readonly loaded: boolean;
  readonly error?: string;
  readonly historyRequestNonce: number;
  readonly calendarMonths: ReadonlyMap<string, CalendarMonthLoadStatus>;
  readonly calendarMonthError?: { readonly monthKey: string; readonly message: string };
  setItems: (items: ReadonlyMap<string, LessonBookingCabinetItem>) => void;
  mergeItems: (items: ReadonlyMap<string, LessonBookingCabinetItem>) => void;
  removeItems: (bookingIds: readonly string[]) => void;
  setHotLoading: (loading: boolean) => void;
  setHistoryLoading: (loading: boolean) => void;
  setHistoryHasMore: (hasMore: boolean) => void;
  setHistoryInitialized: (initialized: boolean) => void;
  setHistoryLoadedAtMs: (loadedAtMs: number) => void;
  resetHistoryPagination: () => void;
  setHistoryCursor: (cursor?: string) => void;
  setLoaded: (loaded: boolean) => void;
  setError: (error?: string) => void;
  requestHistoryPage: () => void;
  setCalendarMonthStatus: (monthKey: string, status: CalendarMonthLoadStatus) => void;
  clearCalendarMonthStatus: (monthKey: string) => void;
  setCalendarMonthError: (error?: { readonly monthKey: string; readonly message: string }) => void;
  reset: () => void;
}

const EMPTY_ITEMS_LIST: readonly LessonBookingCabinetItem[] = [];

export function buildLessonBookingItemsList(
  items: ReadonlyMap<string, LessonBookingCabinetItem>
): LessonBookingCabinetItem[] {
  return [...items.values()].sort((left, right) => right.date.localeCompare(left.date));
}

const EMPTY_CALENDAR_MONTHS = new Map<string, CalendarMonthLoadStatus>();

const initialState = {
  items: new Map<string, LessonBookingCabinetItem>(),
  itemsList: EMPTY_ITEMS_LIST,
  hotLoading: false,
  historyLoading: false,
  historyHasMore: true,
  historyInitialized: false,
  historyLoadedAtMs: undefined,
  historyCursor: undefined,
  loaded: false,
  error: undefined,
  historyRequestNonce: 0,
  calendarMonths: EMPTY_CALENDAR_MONTHS,
  calendarMonthError: undefined,
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
  removeItems: (bookingIds) =>
    set((state) => {
      const merged = new Map(state.items);
      let changed = false;
      for (const bookingId of bookingIds) {
        if (merged.delete(bookingId)) {
          changed = true;
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
  setHistoryInitialized: (historyInitialized) => set({ historyInitialized }),
  setHistoryLoadedAtMs: (historyLoadedAtMs) => set({ historyLoadedAtMs }),
  resetHistoryPagination: () =>
    set({
      historyHasMore: true,
      historyInitialized: false,
      historyLoadedAtMs: undefined,
      historyCursor: undefined,
    }),
  setHistoryCursor: (historyCursor) => set({ historyCursor }),
  setLoaded: (loaded) => set({ loaded }),
  setError: (error) => set({ error }),
  requestHistoryPage: () =>
    set((state) => ({ historyRequestNonce: state.historyRequestNonce + 1 })),
  setCalendarMonthStatus: (monthKey, status) =>
    set((state) => {
      if (state.calendarMonths.get(monthKey) === status) {
        return state;
      }
      const calendarMonths = new Map(state.calendarMonths);
      calendarMonths.set(monthKey, status);
      return {
        calendarMonths,
        ...(state.calendarMonthError?.monthKey === monthKey
          ? { calendarMonthError: undefined }
          : {}),
      };
    }),
  clearCalendarMonthStatus: (monthKey) =>
    set((state) => {
      if (!state.calendarMonths.has(monthKey)) {
        return state;
      }
      const calendarMonths = new Map(state.calendarMonths);
      calendarMonths.delete(monthKey);
      return { calendarMonths };
    }),
  setCalendarMonthError: (calendarMonthError) => set({ calendarMonthError }),
  reset: () =>
    set({
      ...initialState,
      items: new Map(),
      itemsList: EMPTY_ITEMS_LIST,
      calendarMonths: new Map(),
    }),
}));

/** Stable snapshot for Zustand selectors — do not sort/allocate in selector callbacks. */
export function selectLessonBookingItems(
  state: LessonBookingStoreState
): readonly LessonBookingCabinetItem[] {
  return state.itemsList;
}

export function selectLessonBookingById(
  state: LessonBookingStoreState,
  bookingId: string
): LessonBookingCabinetItem | undefined {
  return state.items.get(bookingId);
}

export function selectCalendarMonthStatus(
  state: LessonBookingStoreState,
  monthKey: string
): 'not_loaded' | CalendarMonthLoadStatus {
  return state.calendarMonths.get(monthKey) ?? 'not_loaded';
}
