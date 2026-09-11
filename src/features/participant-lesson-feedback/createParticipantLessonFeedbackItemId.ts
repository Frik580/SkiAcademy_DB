import { PARTICIPANT_LESSON_FEEDBACK_ITEM_ID_MAX_LENGTH } from '@ski-academy/shared-domain';

export function createParticipantLessonFeedbackItemId(): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `fb_${unique}`.slice(0, PARTICIPANT_LESSON_FEEDBACK_ITEM_ID_MAX_LENGTH);
}
