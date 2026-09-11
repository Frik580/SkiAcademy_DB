import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  parseCommandEnvelope,
} from './index';
import { accountCommandActor } from './commands/actors';
import {
  deriveSaveParticipantLessonFeedbackIdempotencyKey,
  deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey,
} from './participantLessonFeedbackCommandIdempotency';

const REPORTED_PARTICIPANT_ID =
  '2df3b3f88bad9e47232a77a29813a5eb220bc2917f6495db87d3edc0d0323bd7';
const REPORTED_LESSON_BOOKING_ID =
  '09a49722799639b26f230cf7858c4271b918f648fe3e8f9b71d6ea6062de8b30';
const REPORTED_ITEM_ID = 'fb_3040394dda67409cb0f4853182f217dd';

describe('participant lesson feedback command idempotency keys', () => {
  it('parses the reported completion envelope through CommandEnvelopeSchema', () => {
    const idempotencyKey = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      REPORTED_ITEM_ID,
      true,
      1
    );
    expect(idempotencyKey.length).toBeLessThanOrEqual(200);
    expect(IdempotencyKeySchema.safeParse(idempotencyKey).success).toBe(true);

    const parsed = parseCommandEnvelope({
      kind: 'set_participant_lesson_feedback_item_completion',
      context: {
        actor: accountCommandActor(AccountIdSchema.parse('account_feedback_report_01')),
        exercisedCapability: 'parent_guardian',
        idempotencyKey,
        correlationId: CorrelationIdSchema.parse('correlation_feedback_report_01'),
        source: 'client_callable',
      },
      intent: {
        participantId: REPORTED_PARTICIPANT_ID,
        lessonBookingId: REPORTED_LESSON_BOOKING_ID,
        itemId: REPORTED_ITEM_ID,
        completed: true,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('keeps completion keys bounded and deterministic for long opaque ids', () => {
    const keyA = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      REPORTED_ITEM_ID,
      true,
      1
    );
    const keyB = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      REPORTED_ITEM_ID,
      true,
      1
    );
    expect(keyA).toBe(keyB);
    expect(keyA.length).toBeLessThanOrEqual(200);

    const otherItem = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      'fb_other_item_fixture_01',
      true,
      1
    );
    const notCompleted = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      REPORTED_ITEM_ID,
      false,
      1
    );
    const otherRevision = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      REPORTED_ITEM_ID,
      true,
      2
    );
    expect(otherItem).not.toBe(keyA);
    expect(notCompleted).not.toBe(keyA);
    expect(otherRevision).not.toBe(keyA);
    expect(IdempotencyKeySchema.safeParse(otherItem).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(notCompleted).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(otherRevision).success).toBe(true);
  });

  it('keeps save feedback keys within IdempotencyKeySchema for long ids', () => {
    const key = deriveSaveParticipantLessonFeedbackIdempotencyKey(
      REPORTED_PARTICIPANT_ID,
      REPORTED_LESSON_BOOKING_ID,
      1
    );
    expect(key.length).toBeLessThanOrEqual(200);
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(true);

    const parsed = parseCommandEnvelope({
      kind: 'save_participant_lesson_feedback',
      context: {
        actor: accountCommandActor(AccountIdSchema.parse('account_feedback_report_02')),
        exercisedCapability: 'instructor',
        idempotencyKey: key,
        correlationId: CorrelationIdSchema.parse('correlation_feedback_report_02'),
        source: 'client_callable',
        expectedRevision: 1,
      },
      intent: {
        participantId: REPORTED_PARTICIPANT_ID,
        lessonBookingId: REPORTED_LESSON_BOOKING_ID,
        items: [{ itemId: REPORTED_ITEM_ID, text: 'Practice carving' }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('passes through short completion keys unchanged for stable fixtures', () => {
    const key = deriveSetParticipantLessonFeedbackItemCompletionIdempotencyKey(
      'participant_lesson_feedback_a',
      'booking_lesson_feedback_x',
      'item_a',
      true,
      1
    );
    expect(key).toBe(
      'set-participant-lesson-feedback-item-completion:participant_lesson_feedback_a:booking_lesson_feedback_x:item_a:1:1'
    );
  });
});
