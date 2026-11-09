import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ParticipantIdSchema,
  type QueryInstructorParticipantRecommendationHistoryReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryInstructorParticipantRecommendationHistoryReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/authStore';
import { useParticipantProgressStore } from '../participant-progress';

type HistoryState = {
  items: QueryInstructorParticipantRecommendationHistoryReadModelsResult['items'];
  nextCursor?: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'denied' | 'signedOut';
};

/** The caller remounts this hook when the Participant, Booking or session changes. */
export function useInstructorRecommendationHistory(participantId: string, bookingId: string) {
  const [state, setState] = useState<HistoryState>({ items: [], status: 'idle' });
  const request = useRef(false);
  const generation = useRef(0);
  const viewId = useId();
  const auth = useAuthStore.getState().authGeneration;
  const sync = useParticipantProgressStore.getState().syncGeneration;

  useLayoutEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  async function load() {
    if (request.current || state.status === 'denied' || state.status === 'signedOut') return;
    const token = generation.current;
    const current = () =>
      token === generation.current &&
      auth === useAuthStore.getState().authGeneration &&
      sync === useParticipantProgressStore.getState().syncGeneration;
    if (!current()) return;
    if (!useAuthStore.getState().firebaseUser) {
      setState({ items: [], status: 'signedOut' });
      return;
    }

    request.current = true;
    setState((previous) => ({ ...previous, status: 'loading' }));
    try {
      const page = await queryInstructorParticipantRecommendationHistoryReadModels(
        {
          scope: 'instructor',
          participantId: ParticipantIdSchema.parse(participantId),
          ...(state.nextCursor ? { cursor: state.nextCursor } : {}),
        },
        // A reopened view must receive a fresh authorization decision.
        viewId
      );
      if (!current()) return;
      if (
        page.participantId !== participantId ||
        page.items.some((item) => item.participantId !== participantId)
      ) {
        throw new Error('Recommendation history participant mismatch');
      }

      setState((previous) => {
        const seen = new Set(previous.items.map((item) => item.feedbackId));
        const additions = page.items.filter((item) => {
          if (item.lessonBookingId === bookingId || seen.has(item.feedbackId)) return false;
          seen.add(item.feedbackId);
          return true;
        });
        return {
          items: [...previous.items, ...additions],
          nextCursor: page.nextCursor,
          status: 'ready',
        };
      });
    } catch (error) {
      if (!current()) return;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      switch (code) {
        case 'permission-denied':
        case 'functions/permission-denied':
        case 'forbidden':
          setState({ items: [], status: 'denied' });
          break;
        case 'unauthenticated':
        case 'functions/unauthenticated':
        case 'unauthorized':
          setState({ items: [], status: 'signedOut' });
          break;
        default:
          setState((previous) => ({ ...previous, status: 'error' }));
      }
    } finally {
      request.current = false;
    }
  }

  return { ...state, load };
}
