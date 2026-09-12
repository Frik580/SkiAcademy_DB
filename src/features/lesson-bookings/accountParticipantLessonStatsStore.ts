import { create } from 'zustand';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { mergeLessonBookingReadModelsByRevision } from '@ski-academy/shared-domain';

export interface AccountParticipantLessonStatsState {
  readonly accountId: string | undefined;
  readonly generation: number;
  readonly items: readonly LessonBookingReadModel[];
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly lastLoadedAtMs?: number;
  readonly error?: string;
  replaceItems: (input: {
    readonly accountId: string;
    readonly generation: number;
    readonly items: readonly LessonBookingReadModel[];
  }) => void;
  setLoading: (input: { readonly accountId: string; readonly generation: number }) => void;
  setError: (input: {
    readonly accountId: string;
    readonly generation: number;
    readonly error: string;
  }) => void;
  reset: () => void;
}

const initialState = {
  accountId: undefined as string | undefined,
  generation: 0,
  items: [] as readonly LessonBookingReadModel[],
  loading: false,
  loaded: false,
  lastLoadedAtMs: undefined as number | undefined,
  error: undefined as string | undefined,
};

export const useAccountParticipantLessonStatsStore = create<AccountParticipantLessonStatsState>(
  (set) => ({
    ...initialState,
    replaceItems: (input) =>
      set((state) => {
        if (state.generation !== input.generation || state.accountId !== input.accountId) {
          return state;
        }
        return {
          items: mergeLessonBookingReadModelsByRevision(input.items),
          loading: false,
          loaded: true,
          lastLoadedAtMs: Date.now(),
          error: undefined,
        };
      }),
    setLoading: (input) =>
      set((state) => {
        if (state.accountId === input.accountId) {
          return {
            generation: input.generation,
            loading: true,
            error: undefined,
          };
        }
        return {
          accountId: input.accountId,
          generation: input.generation,
          items: [],
          loading: true,
          loaded: false,
          lastLoadedAtMs: undefined,
          error: undefined,
        };
      }),
    setError: (input) =>
      set((state) => {
        if (state.generation !== input.generation || state.accountId !== input.accountId) {
          return state;
        }
        return {
          loading: false,
          error: input.error,
        };
      }),
    reset: () => set({ ...initialState, items: [] }),
  })
);

export function selectAccountParticipantLessonStatsItems(
  state: AccountParticipantLessonStatsState
): readonly LessonBookingReadModel[] {
  return state.items;
}
