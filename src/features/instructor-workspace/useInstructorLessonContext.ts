import { useEffect, useState } from 'react';
import { useAuthStore } from '../auth/authStore';
import {
  refreshInstructorParticipantProgress,
  useParticipantProgressStore,
  type ParticipantProgressView,
} from '../participant-progress';
import { queryInstructorLessonParticipantFeedback } from '../participant-lesson-feedback';
import type { ParticipantLessonFeedbackView } from '../participant-lesson-feedback/participantLessonFeedbackView';
import type { InstructorLessonContextInput } from './instructorLessonContextContracts';

export type ContextRead<T> =
  { status: 'loading' | 'denied' | 'unavailable' | 'error' } | { status: 'ready'; value: T };

function readFailure(error: unknown): 'denied' | 'error' | 'unavailable' {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (
    [
      'forbidden',
      'unauthorized',
      'permission-denied',
      'functions/permission-denied',
      'functions/unauthenticated',
    ].includes(String(code))
  )
    return 'denied';
  if (['not_found', 'not-found', 'functions/not-found'].includes(String(code)))
    return 'unavailable';
  return 'error';
}

/** Revalidate instructor scope; a shared cache entry alone is not access evidence. */
export function useInstructorLessonContext(context: InstructorLessonContextInput) {
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const syncGeneration = useParticipantProgressStore((state) => state.syncGeneration);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    progress: ContextRead<ParticipantProgressView>;
    feedback: ContextRead<ParticipantLessonFeedbackView>;
  }>();
  const { participantId, bookingId, status, canReadFeedback } = context;
  const key = JSON.stringify([
    participantId,
    bookingId,
    status,
    canReadFeedback,
    authGeneration,
    syncGeneration,
    attempt,
  ]);

  useEffect(() => {
    let active = true;
    const current = () =>
      active &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useParticipantProgressStore.getState().syncGeneration === syncGeneration;
    const load = async () => {
      let progress: ContextRead<ParticipantProgressView>;
      try {
        // The existing service owns batching, transport deduplication and the canonical store.
        const items = await refreshInstructorParticipantProgress([participantId]);
        if (!current()) return;
        const value = items.find((item) => item.participantId === participantId);
        progress = value ? { status: 'ready', value } : { status: 'denied' };
      } catch (error) {
        if (!current()) return;
        progress = { status: readFailure(error) };
      }
      setResult({
        key,
        progress,
        feedback: {
          status: canReadFeedback && progress.status === 'ready' ? 'loading' : 'unavailable',
        },
      });
      if (!canReadFeedback || progress.status !== 'ready') return;
      try {
        const value = await queryInstructorLessonParticipantFeedback({
          participantId,
          lessonBookingId: bookingId,
        });
        if (!current()) return;
        const feedback: ContextRead<ParticipantLessonFeedbackView> =
          value.participantId === participantId && value.lessonBookingId === bookingId
            ? { status: 'ready', value }
            : { status: 'error' };
        setResult({ key, progress, feedback });
      } catch (error) {
        if (current()) setResult({ key, progress, feedback: { status: readFailure(error) } });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [key, participantId, bookingId, canReadFeedback, authGeneration, syncGeneration]);

  return {
    progress: result?.key === key ? result.progress : { status: 'loading' as const },
    feedback: result?.key === key ? result.feedback : { status: 'loading' as const },
    retry: () => setAttempt((value) => value + 1),
  };
}
