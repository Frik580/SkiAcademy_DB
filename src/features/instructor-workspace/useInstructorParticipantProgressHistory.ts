import { useEffect, useRef, useState } from 'react';
import {
  ParticipantIdSchema,
  type ParticipantProgressHistoryItem,
} from '@ski-academy/shared-domain';
import { queryParticipantProgressHistoryReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useAuthStore } from '../auth/authStore';
import { useParticipantProgressStore } from '../participant-progress';

type HistoryState = {
  items: ParticipantProgressHistoryItem[];
  nextCursor?: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'denied';
};

/** Owned by a mounted Participant × Booking × session section; no persistent cache. */
export function useInstructorParticipantProgressHistory(participantId: string) {
  const [state, setState] = useState<HistoryState>({ items: [], status: 'idle' });
  const request = useRef(false);
  const generation = useRef(0);
  const authGeneration = useAuthStore.getState().authGeneration;
  const syncGeneration = useParticipantProgressStore.getState().syncGeneration;
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  async function load() {
    if (request.current || state.status === 'denied') return;
    request.current = true;
    const token = generation.current;
    const current = () =>
      token === generation.current &&
      authGeneration === useAuthStore.getState().authGeneration &&
      syncGeneration === useParticipantProgressStore.getState().syncGeneration;
    setState((previous) => ({ ...previous, status: 'loading' }));
    try {
      const page = await queryParticipantProgressHistoryReadModels({
        scope: 'instructor',
        participantId: ParticipantIdSchema.parse(participantId),
        ...(state.nextCursor ? { cursor: state.nextCursor } : {}),
      });
      if (!current()) return;
      if (
        page.participantId !== participantId ||
        page.items.some((item) => item.participantId !== participantId)
      ) {
        throw new Error('History participant mismatch');
      }
      setState((previous) => {
        const ids = new Set(previous.items.map((item) => item.id));
        const additions = page.items.filter((item) => {
          if (ids.has(item.id)) return false;
          ids.add(item.id);
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
      const denied = [
        'permission-denied',
        'unauthenticated',
        'functions/permission-denied',
        'functions/unauthenticated',
        'forbidden',
        'unauthorized',
      ].includes(code);
      setState((previous) =>
        denied ? { items: [], status: 'denied' } : { ...previous, status: 'error' }
      );
    } finally {
      request.current = false;
    }
  }
  return { ...state, load };
}
