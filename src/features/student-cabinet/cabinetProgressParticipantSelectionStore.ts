import { create } from 'zustand';
import {
  nextCabinetProgressParticipantId,
  type CabinetProgressParticipant,
} from './cabinetProgressParticipantSelection';

interface CabinetProgressParticipantSelectionState {
  readonly accountId?: string;
  readonly selectedParticipantId?: string;
  readonly initialized: boolean;
  syncManagedSet: (input: {
    readonly accountId: string | undefined;
    readonly participants: readonly CabinetProgressParticipant[];
    readonly loading: boolean;
  }) => void;
  selectParticipant: (
    participantId: string,
    participants: readonly Pick<CabinetProgressParticipant, 'participantId'>[]
  ) => void;
  reset: () => void;
}

const EMPTY_STATE = {
  accountId: undefined,
  selectedParticipantId: undefined,
  initialized: false,
} as const;

export const useCabinetProgressParticipantSelectionStore =
  create<CabinetProgressParticipantSelectionState>((set, get) => ({
    ...EMPTY_STATE,
    syncManagedSet: ({ accountId, participants, loading }) => {
      const current = get();
      if (current.accountId !== accountId) {
        if (!accountId) {
          set({ ...EMPTY_STATE });
          return;
        }
        if (loading || participants.length === 0) {
          set({
            accountId,
            selectedParticipantId: undefined,
            initialized: false,
          });
          return;
        }
        const next = nextCabinetProgressParticipantId({
          participants,
          selectedParticipantId: undefined,
          initialized: false,
        });
        set({
          accountId,
          selectedParticipantId: next.selectedParticipantId,
          initialized: next.initialized,
        });
        return;
      }

      if (!accountId || loading || participants.length === 0) {
        return;
      }

      const next = nextCabinetProgressParticipantId({
        participants,
        selectedParticipantId: current.selectedParticipantId,
        initialized: current.initialized,
      });
      if (
        next.selectedParticipantId === current.selectedParticipantId &&
        next.initialized === current.initialized
      ) {
        return;
      }
      set({
        selectedParticipantId: next.selectedParticipantId,
        initialized: next.initialized,
      });
    },
    selectParticipant: (participantId, participants) => {
      if (!participants.some((participant) => participant.participantId === participantId)) {
        return;
      }
      set({ selectedParticipantId: participantId, initialized: true });
    },
    reset: () => set({ ...EMPTY_STATE }),
  }));
