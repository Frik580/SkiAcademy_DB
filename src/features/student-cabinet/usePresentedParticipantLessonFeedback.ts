import { useMemo } from 'react';
import type { Booking } from '../../types';
import { useParticipantLessonFeedbackStore } from '../participant-lesson-feedback/participantLessonFeedbackStore';
import {
  formatLessonFeedbackDateLabel,
  lessonFeedbackFlagsByLessonId,
  pendingLessonFeedbackCount,
  selectExactParticipantFeedback,
  selectFeedbackForLesson,
  selectIncompleteLessonFeedback,
  selectInstructorParticipantLessonFeedback,
  selectLatestFeedbackHighlight,
  selectLatestParticipantLessonFeedback,
  toLessonFeedbackView,
  type LessonFeedbackContext,
} from './studentLessonFeedbackPresentation';

export function lessonFeedbackContextFromBookings(
  bookings: readonly Pick<Booking, 'id' | 'instructorId' | 'instructorName' | 'date' | 'time'>[]
): Map<string, LessonFeedbackContext> {
  const map = new Map<string, LessonFeedbackContext>();
  for (const booking of bookings) {
    map.set(booking.id, {
      lessonBookingId: booking.id,
      instructorId: booking.instructorId,
      instructorName: booking.instructorName,
      date: booking.date,
      time: booking.time,
    });
  }
  return map;
}

export function usePresentedParticipantLessonFeedback(
  bookings: readonly Pick<
    Booking,
    'id' | 'instructorId' | 'instructorName' | 'date' | 'time'
  >[] = []
) {
  const presentationParticipantId = useParticipantLessonFeedbackStore(
    (state) => state.presentationParticipantId
  );
  const bucket = useParticipantLessonFeedbackStore((state) =>
    presentationParticipantId ? state.byParticipantId[presentationParticipantId] : undefined
  );
  const pendingKeys = useParticipantLessonFeedbackStore((state) => state.pendingKeys);
  const showingPreviousParticipant = Boolean(
    presentationParticipantId && bucket && bucket.participantId !== presentationParticipantId
  );
  const presentedItems = showingPreviousParticipant ? [] : (bucket?.items ?? []);
  const presentedLoadState = showingPreviousParticipant ? 'loading' : (bucket?.loadState ?? 'idle');
  const contextByLessonId = useMemo(() => lessonFeedbackContextFromBookings(bookings), [bookings]);

  const exactItems = useMemo(
    () =>
      presentationParticipantId
        ? selectExactParticipantFeedback(presentedItems, presentationParticipantId)
        : [],
    [presentedItems, presentationParticipantId]
  );

  const flagsByLessonId = useMemo(
    () =>
      presentationParticipantId
        ? lessonFeedbackFlagsByLessonId(exactItems, presentationParticipantId)
        : new Map(),
    [exactItems, presentationParticipantId]
  );

  const latest = useMemo(
    () =>
      presentationParticipantId
        ? selectLatestParticipantLessonFeedback(exactItems, presentationParticipantId)
        : null,
    [exactItems, presentationParticipantId]
  );

  return {
    participantId: showingPreviousParticipant ? presentationParticipantId : bucket?.participantId,
    loadState: presentedLoadState,
    isLoadingPlaceholder:
      Boolean(presentationParticipantId) &&
      (presentedLoadState === 'loading' || presentedLoadState === 'idle') &&
      exactItems.length === 0,
    items: exactItems,
    flagsByLessonId,
    latest,
    latestHighlight: latest ? selectLatestFeedbackHighlight(latest) : null,
    latestView: latest
      ? toLessonFeedbackView(latest, contextByLessonId.get(latest.lessonBookingId))
      : null,
    incomplete: presentationParticipantId
      ? selectIncompleteLessonFeedback(exactItems, presentationParticipantId)
      : [],
    contextByLessonId,
    pendingKeys,
    feedbackForLesson: (lessonBookingId: string) => {
      if (!presentationParticipantId) return null;
      const feedback = selectFeedbackForLesson(
        exactItems,
        presentationParticipantId,
        lessonBookingId
      );
      if (!feedback || feedback.items.length === 0) return null;
      return toLessonFeedbackView(feedback, contextByLessonId.get(lessonBookingId));
    },
    instructorFeedback: (instructorId: string) => {
      if (!presentationParticipantId) return [];
      return selectInstructorParticipantLessonFeedback(
        exactItems,
        presentationParticipantId,
        instructorId
      ).map((feedback) =>
        toLessonFeedbackView(feedback, contextByLessonId.get(feedback.lessonBookingId))
      );
    },
    pendingCountForLesson: (lessonBookingId: string) =>
      presentationParticipantId
        ? pendingLessonFeedbackCount(exactItems, presentationParticipantId, lessonBookingId)
        : 0,
    formatDate: formatLessonFeedbackDateLabel,
  };
}
