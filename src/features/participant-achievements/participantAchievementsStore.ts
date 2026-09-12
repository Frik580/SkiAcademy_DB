import { create } from 'zustand';
import type { ParticipantAchievementsReadModel } from '@ski-academy/shared-domain';

interface ParticipantAchievementsState {
  readonly byId: Readonly<Record<string, ParticipantAchievementsReadModel>>;
  readonly loaded: boolean;
  readonly recordingKeys: Readonly<Record<string, true>>;
  setItems: (items: readonly ParticipantAchievementsReadModel[]) => void;
  upsertItem: (item: ParticipantAchievementsReadModel) => void;
  setRecording: (participantId: string, recording: boolean) => void;
  clear: () => void;
}

export const useParticipantAchievementsStore = create<ParticipantAchievementsState>((set, get) => ({
  byId: {},
  loaded: false,
  recordingKeys: {},
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
  setRecording: (participantId, recording) => {
    const current = get().recordingKeys[participantId];
    if (recording && current) return;
    if (!recording && !current) return;
    set((state) => {
      const next = { ...state.recordingKeys };
      if (recording) next[participantId] = true;
      else delete next[participantId];
      return { recordingKeys: next };
    });
  },
  clear: () => set({ byId: {}, loaded: false, recordingKeys: {} }),
}));

export function selectParticipantAchievements(
  participantId: string | undefined
): ParticipantAchievementsReadModel | undefined {
  if (!participantId) return undefined;
  const item = useParticipantAchievementsStore.getState().byId[participantId];
  return item && item.participantId === participantId ? item : undefined;
}
