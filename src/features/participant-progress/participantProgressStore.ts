import { create } from 'zustand';
import type { ParticipantProgressView } from './applyParticipantProgressToProfile';

interface ParticipantProgressState {
  readonly byId: Readonly<Record<string, ParticipantProgressView>>;
  readonly loaded: boolean;
  readonly syncGeneration: number;
  setItems: (items: readonly ParticipantProgressView[]) => void;
  upsertItem: (item: ParticipantProgressView) => void;
  clear: () => void;
}

export const useParticipantProgressStore = create<ParticipantProgressState>((set) => ({
  byId: {},
  loaded: false,
  syncGeneration: 0,
  setItems: (items) =>
    set((state) => {
      const next = { ...state.byId };
      for (const item of items) {
        next[item.participantId] = item;
      }
      return { byId: next, loaded: true };
    }),
  upsertItem: (item) =>
    set((state) => ({
      byId: { ...state.byId, [item.participantId]: item },
      loaded: true,
    })),
  clear: () =>
    set((state) => ({
      byId: {},
      loaded: false,
      syncGeneration: state.syncGeneration + 1,
    })),
}));

export function selectParticipantProgress(
  participantId: string | undefined
): ParticipantProgressView | undefined {
  if (!participantId) return undefined;
  return useParticipantProgressStore.getState().byId[participantId];
}
