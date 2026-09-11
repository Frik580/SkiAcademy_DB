import { useCallback, useEffect, useRef, useState } from 'react';
import { presentCanonicalCommandError } from '../lesson-bookings/presentCanonicalCommandError';
import {
  queryInstructorLessonParticipantFeedback,
  saveInstructorParticipantLessonFeedback,
  persistableParticipantLessonFeedbackItems,
  type ParticipantLessonFeedbackDraftItem,
} from '../participant-lesson-feedback';

export type InstructorLessonFeedbackLoadState = 'loading' | 'ready' | 'error';

export function useInstructorParticipantLessonFeedbackEditor(input: {
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly accountId: string | undefined;
}) {
  const [loadState, setLoadState] = useState<InstructorLessonFeedbackLoadState>('loading');
  const [drafts, setDrafts] = useState<ParticipantLessonFeedbackDraftItem[]>([]);
  const [revision, setRevision] = useState(0);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const saveInFlightRef = useRef(false);

  const applyView = useCallback(
    (view: { items: readonly ParticipantLessonFeedbackDraftItem[]; revision: number }) => {
      setDrafts(view.items.map((item) => ({ itemId: item.itemId, text: item.text })));
      setRevision(view.revision);
    },
    []
  );

  const load = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoadState('loading');
    setDrafts([]);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const view = await queryInstructorLessonParticipantFeedback({
        participantId: input.participantId,
        lessonBookingId: input.lessonBookingId,
      });
      if (generation !== generationRef.current) return;
      applyView(view);
      setLoadState('ready');
    } catch (error) {
      if (generation !== generationRef.current) return;
      setLoadState('error');
      setLoadError(presentCanonicalCommandError(error).message);
    }
  }, [applyView, input.lessonBookingId, input.participantId]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  const save = useCallback(async () => {
    if (saveInFlightRef.current || savePending || loadState !== 'ready' || !input.accountId) {
      return;
    }
    saveInFlightRef.current = true;
    const generation = generationRef.current;
    setSavePending(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const items = persistableParticipantLessonFeedbackItems(drafts);
      const result = await saveInstructorParticipantLessonFeedback({
        accountId: input.accountId,
        participantId: input.participantId,
        lessonBookingId: input.lessonBookingId,
        items,
        expectedRevision: revision,
      });
      if (generation !== generationRef.current) return;
      setRevision(result.revision);
      setDrafts(items);
      try {
        const refreshed = await queryInstructorLessonParticipantFeedback({
          participantId: input.participantId,
          lessonBookingId: input.lessonBookingId,
        });
        if (generation !== generationRef.current) return;
        applyView(refreshed);
      } catch {
        if (generation !== generationRef.current) return;
      }
      setSaveSuccess(true);
    } catch (error) {
      if (generation !== generationRef.current) return;
      const presented = presentCanonicalCommandError(error);
      setSaveError(presented.message);
      setSaveSuccess(false);
      if (presented.shouldRefresh) {
        try {
          const refreshed = await queryInstructorLessonParticipantFeedback({
            participantId: input.participantId,
            lessonBookingId: input.lessonBookingId,
          });
          if (generation !== generationRef.current) return;
          applyView(refreshed);
        } catch {
          if (generation !== generationRef.current) return;
        }
      }
    } finally {
      saveInFlightRef.current = false;
      if (generation === generationRef.current) {
        setSavePending(false);
      }
    }
  }, [
    applyView,
    drafts,
    input.accountId,
    input.lessonBookingId,
    input.participantId,
    loadState,
    revision,
    savePending,
  ]);

  return {
    loadState,
    loadError,
    drafts,
    setDrafts,
    revision,
    savePending,
    saveError,
    saveSuccess,
    save,
    retryLoad: load,
  };
}
