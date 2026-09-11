import {
  AggregateRevisionSchema,
  BookingIdSchema,
  ParticipantIdSchema,
  ParticipantLessonFeedbackItemIdSchema,
  parseCommandResultPayload,
  type IdempotencyKey,
  type ParticipantLessonFeedbackItem,
  type ParticipantLessonFeedbackReadModel,
} from '@ski-academy/shared-domain';
import {
  executeAuthenticatedCanonicalCommand,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { queryParticipantLessonFeedbackReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  participantLessonFeedbackViewFromReadModel,
  persistableParticipantLessonFeedbackItems,
  type ParticipantLessonFeedbackDraftItem,
  type ParticipantLessonFeedbackView,
} from './participantLessonFeedbackView';

export function deriveSaveParticipantLessonFeedbackIdempotencyKey(
  participantId: string,
  lessonBookingId: string,
  expectedRevision: number
): IdempotencyKey {
  return `save-participant-lesson-feedback:${participantId}:${lessonBookingId}:${expectedRevision}` as IdempotencyKey;
}

export async function queryInstructorLessonParticipantFeedback(input: {
  readonly participantId: string;
  readonly lessonBookingId: string;
}): Promise<ParticipantLessonFeedbackView> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const lessonBookingId = BookingIdSchema.parse(input.lessonBookingId);
  const result = await queryParticipantLessonFeedbackReadModels({
    scope: 'instructor_lesson',
    participantId,
    lessonBookingId,
  });
  if (result.scope !== 'instructor_lesson') {
    throw new Error('Unexpected participant lesson feedback read scope.');
  }
  return participantLessonFeedbackViewFromReadModel({
    participantId,
    lessonBookingId,
    item: result.item,
  });
}

export async function saveInstructorParticipantLessonFeedback(input: {
  readonly accountId: string;
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly items:
    readonly ParticipantLessonFeedbackDraftItem[] | readonly ParticipantLessonFeedbackItem[];
  readonly expectedRevision: number;
}): Promise<{ readonly revision: number }> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const lessonBookingId = BookingIdSchema.parse(input.lessonBookingId);
  const items = persistableParticipantLessonFeedbackItems(input.items);
  const expectedRevision = AggregateRevisionSchema.parse(input.expectedRevision);
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'save_participant_lesson_feedback',
    intent: {
      participantId,
      lessonBookingId,
      items,
    },
    idempotencyKey: deriveSaveParticipantLessonFeedbackIdempotencyKey(
      participantId,
      lessonBookingId,
      expectedRevision
    ),
    expectedRevision,
    exercisedCapability: 'instructor',
  });
  if (result.status === 'error') {
    throw (
      mapCanonicalCommandResultError(result) ??
      new Error('Participant lesson feedback command returned an error.')
    );
  }
  const payload = parseCommandResultPayload('save_participant_lesson_feedback', result.payload);
  if (!payload.success) {
    throw new Error('Participant lesson feedback command returned an invalid payload.');
  }
  return { revision: payload.data.revision };
}

export function deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
  participantId: string,
  lessonBookingId: string,
  itemId: string,
  completed: boolean,
  expectedRevision: number
): IdempotencyKey {
  return `set-participant-lesson-feedback-item-completion:${participantId}:${lessonBookingId}:${itemId}:${
    completed ? '1' : '0'
  }:${expectedRevision}` as IdempotencyKey;
}

export async function queryManagedParticipantLessonFeedback(input: {
  readonly participantId: string;
}): Promise<readonly ParticipantLessonFeedbackReadModel[]> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const result = await queryParticipantLessonFeedbackReadModels({
    scope: 'managed_participant',
    participantIds: [participantId],
  });
  if (result.scope !== 'managed_participant') {
    throw new Error('Unexpected participant lesson feedback read scope.');
  }
  return result.items.filter((item) => item.participantId === participantId);
}

export async function setManagedParticipantLessonFeedbackItemCompletion(input: {
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
}): Promise<{
  readonly revision: number;
  readonly completed: boolean;
  readonly itemId: string;
  readonly participantId: string;
  readonly lessonBookingId: string;
}> {
  const participantId = ParticipantIdSchema.parse(input.participantId);
  const lessonBookingId = BookingIdSchema.parse(input.lessonBookingId);
  const itemId = ParticipantLessonFeedbackItemIdSchema.parse(input.itemId);
  const expectedRevision = AggregateRevisionSchema.parse(input.expectedRevision);
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'set_participant_lesson_feedback_item_completion',
    intent: {
      participantId,
      lessonBookingId,
      itemId,
      completed: input.completed,
    },
    idempotencyKey: deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      participantId,
      lessonBookingId,
      itemId,
      input.completed,
      expectedRevision
    ),
    expectedRevision,
    exercisedCapability: input.exercisedCapability,
  });
  if (result.status === 'error') {
    throw (
      mapCanonicalCommandResultError(result) ??
      new Error('Participant lesson feedback command returned an error.')
    );
  }
  const payload = parseCommandResultPayload(
    'set_participant_lesson_feedback_item_completion',
    result.payload
  );
  if (!payload.success) {
    throw new Error('Participant lesson feedback command returned an invalid payload.');
  }
  return {
    revision: payload.data.revision,
    completed: payload.data.completed,
    itemId: payload.data.itemId,
    participantId: payload.data.participantId,
    lessonBookingId: payload.data.lessonBookingId,
  };
}
