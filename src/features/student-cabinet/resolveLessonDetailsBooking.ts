import type { Booking, Instructor } from '../../types';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import { cabinetItemToLegacyPresentation } from '../lesson-bookings/mergeCabinetBookings';
import { useParticipantLessonFeedbackStore } from '../participant-lesson-feedback/participantLessonFeedbackStore';
import {
  selectExactParticipantFeedback,
  selectFeedbackForLesson,
  toLessonFeedbackView,
} from './studentLessonFeedbackPresentation';
import { lessonFeedbackContextFromBookings } from './usePresentedParticipantLessonFeedback';

export function resolveLessonDetailsBookingForModal(input: {
  readonly lessonBookingId: string;
  readonly accountUserId: string;
  readonly cabinetBookings: readonly LessonBookingCabinetItem[];
  readonly instructors?: readonly Instructor[];
}): Booking | null {
  const cabinetItem = input.cabinetBookings.find(
    (item) => item.id === input.lessonBookingId || item.bookingId === input.lessonBookingId
  );
  if (cabinetItem) {
    return cabinetItemToLegacyPresentation(cabinetItem, input.accountUserId);
  }

  const state = useParticipantLessonFeedbackStore.getState();
  const participantId = state.presentationParticipantId;
  if (!participantId) {
    return null;
  }

  const bucket = state.byParticipantId[participantId];
  if (!bucket || bucket.participantId !== participantId) {
    return null;
  }

  const exactItems = selectExactParticipantFeedback(bucket.items, participantId);
  const feedback = selectFeedbackForLesson(exactItems, participantId, input.lessonBookingId);
  if (!feedback || feedback.items.length === 0) {
    return null;
  }

  const legacyFromCabinet = input.cabinetBookings.map((item) =>
    cabinetItemToLegacyPresentation(item, input.accountUserId)
  );
  const contextByLessonId = lessonFeedbackContextFromBookings(legacyFromCabinet);
  const view = toLessonFeedbackView(feedback, contextByLessonId.get(input.lessonBookingId));
  const instructor = input.instructors?.find((entry) => entry.id === view.instructorId);

  return {
    id: view.lessonBookingId,
    userId: input.accountUserId,
    instructorId: view.instructorId ?? '',
    instructorName: view.instructorName ?? instructor?.name ?? '',
    instructorAvatar: instructor?.avatarUrl ?? '',
    date: view.lessonDate ?? '',
    time: view.time ?? '',
    durationHours: 1,
    totalPrice: 0,
    status: 'completed',
  };
}
