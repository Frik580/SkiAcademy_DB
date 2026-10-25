import { create } from 'zustand';
import type { ParticipantAchievementsReadModel } from '@ski-academy/shared-domain';

interface ParticipantAchievementsState {
  readonly byId: Readonly<Record<string, ParticipantAchievementsReadModel>>;
  readonly loaded: boolean;
  readonly recordingKeys: Readonly<Record<string, true>>;
  readonly syncGeneration: number;
  readonly attemptedKeys: Readonly<Record<string, true>>;
  readonly blockedAchievements: Readonly<Record<string, readonly string[]>>;
  blockAchievements: (participantId: string, ids: readonly string[]) => void;
  beginRecording: (participantId: string, attemptKey: string) => boolean;
  setItems: (items: readonly ParticipantAchievementsReadModel[]) => void;
  upsertItem: (item: ParticipantAchievementsReadModel) => void;
  setRecording: (participantId: string, recording: boolean) => void;
  clear: () => void;
}

export const useParticipantAchievementsStore = create<ParticipantAchievementsState>((set, get) => ({
  byId: {},
  loaded: false,
  recordingKeys: {},
  syncGeneration: 0,
  attemptedKeys: {},
  blockedAchievements: {},
  blockAchievements: (participantId, ids) =>
    set((state) => ({
      blockedAchievements: {
        ...state.blockedAchievements,
        [participantId]: [
          ...new Set([...(state.blockedAchievements[participantId] ?? []), ...ids]),
        ],
      },
    })),
  beginRecording: (participantId, attemptKey) => {
    if (get().recordingKeys[participantId] || get().attemptedKeys[attemptKey]) return false;
    set((state) => ({
      recordingKeys: { ...state.recordingKeys, [participantId]: true },
      attemptedKeys: { ...state.attemptedKeys, [attemptKey]: true },
    }));
    return true;
  },
  setItems: (items) =>
    set((state) => {
      const next = { ...state.byId };
      for (const item of items) {
        if ((next[item.participantId]?.revision ?? -1) <= item.revision) {
          next[item.participantId] = item;
        }
      }
      return { byId: next, loaded: true };
    }),
  upsertItem: (item) =>
    set((state) =>
      (state.byId[item.participantId]?.revision ?? -1) > item.revision
        ? state
        : {
            byId: { ...state.byId, [item.participantId]: item },
            loaded: true,
          }
    ),
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
  clear: () =>
    set((state) => ({
      byId: {},
      loaded: false,
      recordingKeys: {},
      attemptedKeys: {},
      blockedAchievements: {},
      syncGeneration: state.syncGeneration + 1,
    })),
}));

export function selectParticipantAchievements(
  participantId: string | undefined
): ParticipantAchievementsReadModel | undefined {
  if (!participantId) return undefined;
  const item = useParticipantAchievementsStore.getState().byId[participantId];
  return item && item.participantId === participantId ? item : undefined;
}
