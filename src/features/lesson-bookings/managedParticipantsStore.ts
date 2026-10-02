import { create } from 'zustand';
import type { ManagedParticipantOption } from './lessonBookingContracts';

interface ManagedParticipantsState {
  readonly accountId?: string;
  readonly authGeneration: number;
  readonly participants: readonly ManagedParticipantOption[];
  readonly loading: boolean;
  readonly error?: string;
  beginLoad: (input: { readonly accountId: string; readonly authGeneration: number }) => void;
  replaceParticipants: (input: {
    readonly accountId: string;
    readonly authGeneration: number;
    readonly participants: readonly ManagedParticipantOption[];
  }) => void;
  setError: (input: {
    readonly accountId: string;
    readonly authGeneration: number;
    readonly error: string;
  }) => void;
  reset: () => void;
}

const initialState = {
  accountId: undefined as string | undefined,
  authGeneration: 0,
  participants: [] as readonly ManagedParticipantOption[],
  loading: false,
  error: undefined as string | undefined,
};

export const useManagedParticipantsStore = create<ManagedParticipantsState>((set) => ({
  ...initialState,
  beginLoad: ({ accountId, authGeneration }) =>
    set((state) => {
      const sameScope = state.accountId === accountId && state.authGeneration === authGeneration;
      return {
        accountId,
        authGeneration,
        participants: sameScope ? state.participants : [],
        loading: true,
        error: undefined,
      };
    }),
  replaceParticipants: ({ accountId, authGeneration, participants }) =>
    set((state) => {
      if (state.accountId !== accountId || state.authGeneration !== authGeneration) return state;
      return { participants, loading: false, error: undefined };
    }),
  setError: ({ accountId, authGeneration, error }) =>
    set((state) => {
      if (state.accountId !== accountId || state.authGeneration !== authGeneration) return state;
      return { participants: [], loading: false, error };
    }),
  reset: () => set({ ...initialState, participants: [] }),
}));
