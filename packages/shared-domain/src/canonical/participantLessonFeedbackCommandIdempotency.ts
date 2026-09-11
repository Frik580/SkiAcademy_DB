import type { IdempotencyKey } from './commands/commandContext';
import { buildCanonicalCommandIdempotencyKey } from './boundedCanonicalIdempotency';

const SAVE_PARTICIPANT_LESSON_FEEDBACK_IDEMPOTENCY_PREFIX = 'save-participant-lesson-feedback';
const SET_PARTICIPANT_LESSON_FEEDBACK_ITEM_COMPLETION_IDEMPOTENCY_PREFIX =
  'set-participant-lesson-feedback-item-completion';

export function deriveSaveParticipantLessonFeedbackIdempotencyKey(
  participantId: string,
  lessonBookingId: string,
  expectedRevision: number
): IdempotencyKey {
  return buildCanonicalCommandIdempotencyKey([
    SAVE_PARTICIPANT_LESSON_FEEDBACK_IDEMPOTENCY_PREFIX,
    participantId,
    lessonBookingId,
    String(expectedRevision),
  ]);
}

export function deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
  participantId: string,
  lessonBookingId: string,
  itemId: string,
  completed: boolean,
  expectedRevision: number
): IdempotencyKey {
  return buildCanonicalCommandIdempotencyKey([
    SET_PARTICIPANT_LESSON_FEEDBACK_ITEM_COMPLETION_IDEMPOTENCY_PREFIX,
    participantId,
    lessonBookingId,
    itemId,
    completed ? '1' : '0',
    String(expectedRevision),
  ]);
}
