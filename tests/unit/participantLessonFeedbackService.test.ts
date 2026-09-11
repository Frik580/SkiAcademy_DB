import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdempotencyKeySchema,
  participantLessonFeedbackIdFromLessonParticipant,
} from '@ski-academy/shared-domain';
import {
  deriveSaveParticipantLessonFeedbackIdempotencyKey,
  deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey,
  persistableParticipantLessonFeedbackItems,
  queryInstructorLessonParticipantFeedback,
  queryManagedParticipantLessonFeedback,
  saveInstructorParticipantLessonFeedback,
  setManagedParticipantLessonFeedbackItemCompletion,
} from '../../src/features/participant-lesson-feedback';

const executeAuthenticatedCanonicalCommand = vi.fn();
const queryParticipantLessonFeedbackReadModels = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryParticipantLessonFeedbackReadModels: (...args: unknown[]) =>
    queryParticipantLessonFeedbackReadModels(...args),
}));

describe('instructor participant lesson feedback service', () => {
  beforeEach(() => {
    executeAuthenticatedCanonicalCommand.mockReset();
    queryParticipantLessonFeedbackReadModels.mockReset();
  });

  it('queries instructor_lesson by participantId and lessonBookingId without spoofed actor fields', async () => {
    queryParticipantLessonFeedbackReadModels.mockResolvedValue({
      scope: 'instructor_lesson',
      item: null,
    });

    const view = await queryInstructorLessonParticipantFeedback({
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
    });

    expect(view).toEqual({
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
      items: [],
      revision: 0,
    });
    expect(queryParticipantLessonFeedbackReadModels).toHaveBeenCalledWith({
      scope: 'instructor_lesson',
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
    });
    const readInput = queryParticipantLessonFeedbackReadModels.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(readInput).not.toHaveProperty('accountId');
    expect(readInput).not.toHaveProperty('userId');
    expect(readInput).not.toHaveProperty('instructorId');
    expect(readInput).not.toHaveProperty('recommendations');
  });

  it('saves through save_participant_lesson_feedback with expectedRevision and no actor ids in intent', async () => {
    const participantId = 'participant_lesson_feedback_a';
    const lessonBookingId = 'booking_lesson_feedback_x';
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'save_participant_lesson_feedback',
      correlationId: 'correlation_feedback_01',
      payload: {
        feedbackId: participantLessonFeedbackIdFromLessonParticipant({
          participantId,
          lessonBookingId,
        }),
        participantId,
        lessonBookingId,
        revision: 1,
      },
    });

    const result = await saveInstructorParticipantLessonFeedback({
      accountId: 'account_instructor_01',
      participantId,
      lessonBookingId,
      items: [{ itemId: 'item_a', text: '  Practice carving  ' }],
      expectedRevision: 0,
    });

    expect(result).toEqual({ revision: 1 });
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledWith(
      'account_instructor_01',
      expect.objectContaining({
        kind: 'save_participant_lesson_feedback',
        expectedRevision: 0,
        exercisedCapability: 'instructor',
        idempotencyKey: deriveSaveParticipantLessonFeedbackIdempotencyKey(
          participantId,
          lessonBookingId,
          0
        ),
        intent: {
          participantId,
          lessonBookingId,
          items: [{ itemId: 'item_a', text: 'Practice carving' }],
        },
      })
    );
    const submission = executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1] as {
      intent: Record<string, unknown>;
    };
    expect(Object.keys(submission.intent).sort()).toEqual([
      'items',
      'lessonBookingId',
      'participantId',
    ]);
  });

  it('persists items=[] as a canonical empty aggregate', async () => {
    expect(
      persistableParticipantLessonFeedbackItems([{ itemId: 'item_blank', text: '   ' }])
    ).toEqual([]);
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'save_participant_lesson_feedback',
      correlationId: 'correlation_feedback_empty_01',
      payload: {
        feedbackId: participantLessonFeedbackIdFromLessonParticipant({
          participantId: 'participant_lesson_feedback_a',
          lessonBookingId: 'booking_lesson_feedback_x',
        }),
        participantId: 'participant_lesson_feedback_a',
        lessonBookingId: 'booking_lesson_feedback_x',
        revision: 2,
      },
    });

    await saveInstructorParticipantLessonFeedback({
      accountId: 'account_instructor_01',
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
      items: [],
      expectedRevision: 1,
    });

    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.items).toEqual([]);
  });

  it('queries managed_participant history for the selected participant only', async () => {
    queryParticipantLessonFeedbackReadModels.mockResolvedValue({
      scope: 'managed_participant',
      items: [
        {
          feedbackId: 'feedback_a',
          participantId: 'participant_lesson_feedback_a',
          lessonBookingId: 'booking_lesson_feedback_x',
          items: [{ itemId: 'item_a', text: 'Practice carving', completed: false }],
          revision: 1,
        },
        {
          feedbackId: 'feedback_b',
          participantId: 'participant_lesson_feedback_b',
          lessonBookingId: 'booking_lesson_feedback_y',
          items: [{ itemId: 'item_b', text: 'Other child', completed: false }],
          revision: 1,
        },
      ],
    });

    const items = await queryManagedParticipantLessonFeedback({
      participantId: 'participant_lesson_feedback_a',
    });

    expect(items.map((item) => item.participantId)).toEqual(['participant_lesson_feedback_a']);
    expect(queryParticipantLessonFeedbackReadModels).toHaveBeenCalledWith({
      scope: 'managed_participant',
      participantIds: ['participant_lesson_feedback_a'],
    });
    const readInput = queryParticipantLessonFeedbackReadModels.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(readInput).not.toHaveProperty('accountId');
    expect(readInput).not.toHaveProperty('userId');
    expect(readInput).not.toHaveProperty('instructorId');
  });

  it('toggles completion through set_participant_lesson_feedback_item_completion without actor ids', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'set_participant_lesson_feedback_item_completion',
      correlationId: 'correlation_feedback_complete_01',
      payload: {
        feedbackId: participantLessonFeedbackIdFromLessonParticipant({
          participantId: 'participant_lesson_feedback_a',
          lessonBookingId: 'booking_lesson_feedback_x',
        }),
        participantId: 'participant_lesson_feedback_a',
        lessonBookingId: 'booking_lesson_feedback_x',
        itemId: 'item_a',
        completed: true,
        revision: 2,
      },
    });

    const result = await setManagedParticipantLessonFeedbackItemCompletion({
      accountId: 'account_guardian_01',
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
      itemId: 'item_a',
      completed: true,
      expectedRevision: 1,
      exercisedCapability: 'parent_guardian',
    });

    expect(result).toEqual({
      revision: 2,
      completed: true,
      itemId: 'item_a',
      participantId: 'participant_lesson_feedback_a',
      lessonBookingId: 'booking_lesson_feedback_x',
    });
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledWith(
      'account_guardian_01',
      expect.objectContaining({
        kind: 'set_participant_lesson_feedback_item_completion',
        expectedRevision: 1,
        exercisedCapability: 'parent_guardian',
        idempotencyKey: deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
          'participant_lesson_feedback_a',
          'booking_lesson_feedback_x',
          'item_a',
          true,
          1
        ),
        intent: {
          participantId: 'participant_lesson_feedback_a',
          lessonBookingId: 'booking_lesson_feedback_x',
          itemId: 'item_a',
          completed: true,
        },
      })
    );
    const submission = executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1] as {
      intent: Record<string, unknown>;
    };
    expect(Object.keys(submission.intent).sort()).toEqual([
      'completed',
      'itemId',
      'lessonBookingId',
      'participantId',
    ]);
  });

  it('bounds completion idempotency keys for production-length opaque ids', () => {
    const participantId =
      '2df3b3f88bad9e47232a77a29813a5eb220bc2917f6495db87d3edc0d0323bd7';
    const lessonBookingId =
      '09a49722799639b26f230cf7858c4271b918f648fe3e8f9b71d6ea6062de8b30';
    const itemId = 'fb_3040394dda67409cb0f4853182f217dd';
    const key = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      participantId,
      lessonBookingId,
      itemId,
      true,
      1
    );
    expect(key.length).toBeLessThanOrEqual(200);
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(true);
    expect(key).not.toBe(
      `set-participant-lesson-feedback-item-completion:${participantId}:${lessonBookingId}:${itemId}:1:1`
    );
  });
});
