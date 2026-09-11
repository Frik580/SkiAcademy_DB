import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import { create } from 'zustand';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';

export type LessonFeedbackCompletionCapability = Extract<
  ClientCallableCapability,
  'account_owner' | 'parent_guardian'
>;

export type ParticipantLessonFeedbackLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ParticipantLessonFeedbackBucket {
  readonly participantId: string;
  readonly items: readonly ParticipantLessonFeedbackReadModel[];
  readonly loadState: ParticipantLessonFeedbackLoadState;
  readonly error: string | null;
  readonly generation: number;
}

export function participantLessonFeedbackItemKey(
  participantId: string,
  lessonBookingId: string,
  itemId: string
): string {
  return `${participantId}:${lessonBookingId}:${itemId}`;
}

interface ParticipantLessonFeedbackState {
  readonly byParticipantId: Readonly<Record<string, ParticipantLessonFeedbackBucket>>;
  readonly presentationParticipantId: string | undefined;
  readonly pendingKeys: Readonly<Record<string, true>>;
  readonly completionCapabilityByParticipantId: Readonly<
    Record<string, LessonFeedbackCompletionCapability>
  >;
  setPresentationParticipantId: (participantId: string | undefined) => void;
  setCompletionCapability: (
    participantId: string,
    capability: LessonFeedbackCompletionCapability
  ) => void;
  beginLoad: (participantId: string) => number;
  applyLoad: (
    participantId: string,
    generation: number,
    items: readonly ParticipantLessonFeedbackReadModel[]
  ) => boolean;
  applyLoadError: (participantId: string, generation: number, error: string) => boolean;
  replaceParticipantItems: (
    participantId: string,
    items: readonly ParticipantLessonFeedbackReadModel[]
  ) => void;
  setPending: (key: string, pending: boolean) => void;
  clear: () => void;
}

function emptyBucket(participantId: string, generation = 0): ParticipantLessonFeedbackBucket {
  return {
    participantId,
    items: [],
    loadState: 'idle',
    error: null,
    generation,
  };
}

export const useParticipantLessonFeedbackStore = create<ParticipantLessonFeedbackState>(
  (set, get) => ({
    byParticipantId: {},
    presentationParticipantId: undefined,
    pendingKeys: {},
    completionCapabilityByParticipantId: {},
    setPresentationParticipantId: (participantId) => {
      if (get().presentationParticipantId === participantId) return;
      set({ presentationParticipantId: participantId });
    },
    setCompletionCapability: (participantId, capability) => {
      const current = get().completionCapabilityByParticipantId[participantId];
      if (current === capability) return;
      set((state) => ({
        completionCapabilityByParticipantId: {
          ...state.completionCapabilityByParticipantId,
          [participantId]: capability,
        },
      }));
    },
    beginLoad: (participantId) => {
      const current = get().byParticipantId[participantId] ?? emptyBucket(participantId);
      const generation = current.generation + 1;
      const keepCachedItems = current.loadState === 'ready' || current.items.length > 0;
      set((state) => ({
        byParticipantId: {
          ...state.byParticipantId,
          [participantId]: {
            participantId,
            items: keepCachedItems ? current.items : [],
            loadState: keepCachedItems ? current.loadState : 'loading',
            error: null,
            generation,
          },
        },
      }));
      return generation;
    },
    applyLoad: (participantId, generation, items) => {
      const current = get().byParticipantId[participantId];
      if (!current || current.generation !== generation) return false;
      set((state) => ({
        byParticipantId: {
          ...state.byParticipantId,
          [participantId]: {
            participantId,
            items,
            loadState: 'ready',
            error: null,
            generation,
          },
        },
      }));
      return true;
    },
    applyLoadError: (participantId, generation, error) => {
      const current = get().byParticipantId[participantId];
      if (!current || current.generation !== generation) return false;
      set((state) => ({
        byParticipantId: {
          ...state.byParticipantId,
          [participantId]: {
            ...current,
            loadState: current.items.length > 0 ? 'ready' : 'error',
            error,
            generation,
          },
        },
      }));
      return true;
    },
    replaceParticipantItems: (participantId, items) => {
      const current = get().byParticipantId[participantId] ?? emptyBucket(participantId);
      set((state) => ({
        byParticipantId: {
          ...state.byParticipantId,
          [participantId]: {
            ...current,
            participantId,
            items,
            loadState: 'ready',
            error: null,
          },
        },
      }));
    },
    setPending: (key, pending) => {
      set((state) => {
        if (pending) {
          if (state.pendingKeys[key]) return state;
          return { pendingKeys: { ...state.pendingKeys, [key]: true } };
        }
        if (!state.pendingKeys[key]) return state;
        const next = { ...state.pendingKeys };
        delete next[key];
        return { pendingKeys: next };
      });
    },
    clear: () =>
      set({
        byParticipantId: {},
        presentationParticipantId: undefined,
        pendingKeys: {},
        completionCapabilityByParticipantId: {},
      }),
  })
);

export function selectExactParticipantLessonFeedback(
  participantId: string | undefined
): ParticipantLessonFeedbackBucket | undefined {
  if (!participantId) return undefined;
  return useParticipantLessonFeedbackStore.getState().byParticipantId[participantId];
}

export function selectPresentedParticipantLessonFeedback():
  ParticipantLessonFeedbackBucket | undefined {
  const state = useParticipantLessonFeedbackStore.getState();
  return selectExactParticipantLessonFeedback(state.presentationParticipantId);
}
