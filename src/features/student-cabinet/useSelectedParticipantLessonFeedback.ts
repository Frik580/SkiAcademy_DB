import { useCallback, useEffect } from 'react';
import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { presentCanonicalCommandError } from '../lesson-bookings/presentCanonicalCommandError';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';
import { logger } from '../../shared';
import {
  queryManagedParticipantLessonFeedback,
  setManagedParticipantLessonFeedbackItemCompletion,
} from '../participant-lesson-feedback/participantLessonFeedbackService';
import {
  participantLessonFeedbackItemKey,
  selectExactParticipantLessonFeedback,
  useParticipantLessonFeedbackStore,
} from '../participant-lesson-feedback/participantLessonFeedbackStore';

export function resolveLessonFeedbackCompletionCapability(
  authority: ManagedParticipantOption['authority'] | undefined
): Extract<ClientCallableCapability, 'account_owner' | 'parent_guardian'> | undefined {
  if (authority === 'parent_guardian') return 'parent_guardian';
  if (authority === 'self') return 'account_owner';
  return undefined;
}

export async function loadManagedParticipantLessonFeedback(
  participantId: string
): Promise<boolean> {
  const store = useParticipantLessonFeedbackStore.getState();
  const generation = store.beginLoad(participantId);
  try {
    const items = await queryManagedParticipantLessonFeedback({ participantId });
    return store.applyLoad(participantId, generation, items);
  } catch (error) {
    logger.warn('Failed to load participant lesson feedback', error);
    return store.applyLoadError(
      participantId,
      generation,
      presentCanonicalCommandError(error).message
    );
  }
}

export async function toggleManagedParticipantLessonFeedbackItem(input: {
  readonly accountId: string;
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly itemId: string;
  readonly completed: boolean;
  readonly expectedRevision: number;
  readonly exercisedCapability: Extract<
    ClientCallableCapability,
    'account_owner' | 'parent_guardian'
  >;
}): Promise<boolean> {
  const store = useParticipantLessonFeedbackStore.getState();
  const key = participantLessonFeedbackItemKey(
    input.participantId,
    input.lessonBookingId,
    input.itemId
  );
  if (store.pendingKeys[key]) return false;
  store.setPending(key, true);
  try {
    await setManagedParticipantLessonFeedbackItemCompletion(input);
    try {
      const items = await queryManagedParticipantLessonFeedback({
        participantId: input.participantId,
      });
      store.replaceParticipantItems(input.participantId, items);
    } catch (error) {
      logger.warn('Failed to refetch participant lesson feedback after completion', error);
      store.replaceParticipantItems(
        input.participantId,
        applyLocalCompletion(
          selectExactParticipantLessonFeedback(input.participantId)?.items ?? [],
          {
            lessonBookingId: input.lessonBookingId,
            itemId: input.itemId,
            completed: input.completed,
          }
        )
      );
    }
    return true;
  } catch (error) {
    const presented = presentCanonicalCommandError(error);
    if (presented.shouldRefresh) {
      try {
        const items = await queryManagedParticipantLessonFeedback({
          participantId: input.participantId,
        });
        store.replaceParticipantItems(input.participantId, items);
      } catch (refreshError) {
        logger.warn(
          'Failed to reconcile participant lesson feedback after completion error',
          refreshError
        );
      }
    }
    throw error;
  } finally {
    useParticipantLessonFeedbackStore.getState().setPending(key, false);
  }
}

export function useSelectedParticipantLessonFeedback(input: {
  readonly accountId: string | undefined;
  readonly selectedParticipantId: string | undefined;
  readonly participants?: readonly ManagedParticipantOption[];
}) {
  const { accountId, selectedParticipantId, participants = [] } = input;
  const setPresentationParticipantId = useParticipantLessonFeedbackStore(
    (state) => state.setPresentationParticipantId
  );
  const setCompletionCapability = useParticipantLessonFeedbackStore(
    (state) => state.setCompletionCapability
  );

  useEffect(() => {
    setPresentationParticipantId(selectedParticipantId);
  }, [selectedParticipantId, setPresentationParticipantId]);

  useEffect(() => {
    if (!selectedParticipantId) return;
    const participant = participants.find((item) => item.participantId === selectedParticipantId);
    const capability = resolveLessonFeedbackCompletionCapability(participant?.authority);
    if (capability) {
      setCompletionCapability(selectedParticipantId, capability);
    }
  }, [participants, selectedParticipantId, setCompletionCapability]);

  useEffect(() => {
    if (!accountId || !selectedParticipantId) return;
    void loadManagedParticipantLessonFeedback(selectedParticipantId);
  }, [accountId, selectedParticipantId]);

  const reload = useCallback(() => {
    if (!selectedParticipantId) return;
    void loadManagedParticipantLessonFeedback(selectedParticipantId);
  }, [selectedParticipantId]);

  return { reload };
}

export async function togglePresentedParticipantLessonFeedbackItem(input: {
  readonly accountId: string;
  readonly lessonBookingId: string;
  readonly itemId: string;
  readonly completed: boolean;
}): Promise<boolean> {
  const state = useParticipantLessonFeedbackStore.getState();
  const participantId = state.presentationParticipantId;
  if (!participantId) return false;
  const capability = state.completionCapabilityByParticipantId[participantId];
  if (!capability) return false;
  const feedback = (state.byParticipantId[participantId]?.items ?? []).find(
    (item) => item.lessonBookingId === input.lessonBookingId
  );
  if (!feedback) return false;
  return toggleManagedParticipantLessonFeedbackItem({
    accountId: input.accountId,
    participantId,
    lessonBookingId: input.lessonBookingId,
    itemId: input.itemId,
    completed: input.completed,
    expectedRevision: feedback.revision,
    exercisedCapability: capability,
  });
}

function applyLocalCompletion(
  items: readonly ParticipantLessonFeedbackReadModel[],
  patch: { readonly lessonBookingId: string; readonly itemId: string; readonly completed: boolean }
): ParticipantLessonFeedbackReadModel[] {
  return items.map((feedback) => {
    if (feedback.lessonBookingId !== patch.lessonBookingId) return feedback;
    return {
      ...feedback,
      items: feedback.items.map((item) =>
        item.itemId === patch.itemId ? { ...item, completed: patch.completed } : item
      ),
    };
  });
}
