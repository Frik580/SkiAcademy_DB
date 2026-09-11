import { describe, expect, it } from 'vitest';
import { timestampFromDate } from './primitives';
import { parseCommandIntent } from './commands/commandIntents';
import { participantLessonFeedbackIdFromLessonParticipant } from './deterministicIdentity';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  BookingIdSchema,
} from './identifiers';
import {
  PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX,
  PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH,
  ParticipantLessonFeedbackSchema,
  emptyParticipantLessonFeedbackProjection,
  normalizeParticipantLessonFeedbackItems,
} from './participantLessonFeedback';

const participantA = ParticipantIdSchema.parse('participant_lesson_feedback_a');
const participantB = ParticipantIdSchema.parse('participant_lesson_feedback_b');
const lessonX = BookingIdSchema.parse('booking_lesson_feedback_x');
const lessonY = BookingIdSchema.parse('booking_lesson_feedback_y');
const instructorId = InstructorIdSchema.parse('instructor_lesson_feedback_01');
const commandId = CommandIdSchema.parse('command_lesson_feedback_01');
const correlationId = CorrelationIdSchema.parse('correlation_lesson_feedback_01');
const now = timestampFromDate(new Date('2026-09-11T12:00:00.000Z'));

const validAggregate = {
  feedbackId: participantLessonFeedbackIdFromLessonParticipant({
    participantId: participantA,
    lessonBookingId: lessonX,
  }),
  participantId: participantA,
  lessonBookingId: lessonX,
  instructorId,
  items: [{ itemId: 'item_a', text: 'Practice carving' }],
  completedItemIds: ['item_a'],
  revision: 1,
  createdAt: now,
  updatedAt: now,
  audit: {
    createdByCommandId: commandId,
    lastChangedByCommandId: commandId,
    correlationId,
  },
};

describe('canonical participant lesson feedback contract', () => {
  it('parses valid participant-level lesson feedback', () => {
    expect(ParticipantLessonFeedbackSchema.safeParse(validAggregate).success).toBe(true);
  });

  it('requires participantId and lessonBookingId on save intent', () => {
    const base = {
      participantId: participantA,
      lessonBookingId: lessonX,
      items: [{ itemId: 'item_1', text: 'Stretch' }],
    };
    expect(parseCommandIntent('save_participant_lesson_feedback', base).success).toBe(true);
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        lessonBookingId: lessonX,
        items: base.items,
      }).success
    ).toBe(false);
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: participantA,
        items: base.items,
      }).success
    ).toBe(false);
  });

  it('does not require account userId for dependent participants', () => {
    const dependentId = ParticipantIdSchema.parse('participant_dependent_no_account');
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: dependentId,
        lessonBookingId: lessonX,
        items: [{ itemId: 'homework_1', text: 'Balance drill' }],
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: dependentId,
        lessonBookingId: lessonX,
        items: [{ itemId: 'homework_1', text: 'Balance drill' }],
        userId: 'account_spoof',
      }).success
    ).toBe(false);
  });

  it('rejects whitespace-only item text and duplicate item ids', () => {
    expect(() =>
      normalizeParticipantLessonFeedbackItems([{ itemId: 'item_1', text: '   ' }])
    ).toThrow();
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: participantA,
        lessonBookingId: lessonX,
        items: [
          { itemId: 'dup', text: 'One' },
          { itemId: 'dup', text: 'Two' },
        ],
      }).success
    ).toBe(false);
  });

  it('enforces item count and text bounds', () => {
    const tooMany = Array.from({ length: PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX + 1 }, (_, index) => ({
      itemId: `item_${index}`,
      text: 'Drill',
    }));
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: participantA,
        lessonBookingId: lessonX,
        items: tooMany,
      }).success
    ).toBe(false);
    expect(
      parseCommandIntent('save_participant_lesson_feedback', {
        participantId: participantA,
        lessonBookingId: lessonX,
        items: [
          {
            itemId: 'long_text',
            text: 'x'.repeat(PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH + 1),
          },
        ],
      }).success
    ).toBe(false);
  });

  it('requires persisted revision and rejects unknown completion targets', () => {
    expect(
      ParticipantLessonFeedbackSchema.safeParse({ ...validAggregate, revision: 0 }).success
    ).toBe(false);
    expect(
      ParticipantLessonFeedbackSchema.safeParse({
        ...validAggregate,
        completedItemIds: ['missing_item'],
      }).success
    ).toBe(false);
  });

  it('targets completion to an exact item for a participant lesson', () => {
    expect(
      parseCommandIntent('set_participant_lesson_feedback_item_completion', {
        participantId: participantA,
        lessonBookingId: lessonX,
        itemId: 'item_a',
        completed: true,
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('set_participant_lesson_feedback_item_completion', {
        participantId: participantB,
        lessonBookingId: lessonX,
        itemId: 'item_a',
        completed: true,
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('set_participant_lesson_feedback_item_completion', {
        participantId: participantA,
        lessonBookingId: lessonX,
        itemId: 'item_a',
        completed: true,
        instructorId: 'instructor_spoof',
      }).success
    ).toBe(false);
  });

  it('keeps multi-participant identities distinct', () => {
    const idA = participantLessonFeedbackIdFromLessonParticipant({
      participantId: participantA,
      lessonBookingId: lessonX,
    });
    const idB = participantLessonFeedbackIdFromLessonParticipant({
      participantId: participantB,
      lessonBookingId: lessonX,
    });
    const idSameParticipantOtherLesson = participantLessonFeedbackIdFromLessonParticipant({
      participantId: participantA,
      lessonBookingId: lessonY,
    });
    expect(idA).not.toBe(idB);
    expect(idA).not.toBe(idSameParticipantOtherLesson);
    expect(
      participantLessonFeedbackIdFromLessonParticipant({
        participantId: participantA,
        lessonBookingId: lessonX,
      })
    ).toBe(idA);
    const projectionA = emptyParticipantLessonFeedbackProjection({
      participantId: participantA,
      lessonBookingId: lessonX,
    });
    const projectionB = emptyParticipantLessonFeedbackProjection({
      participantId: participantB,
      lessonBookingId: lessonX,
    });
    expect(projectionA.feedbackId).not.toBe(projectionB.feedbackId);
  });

  it('does not expose legacy Booking recommendation fields in canonical aggregate', () => {
    const keys = Object.keys(ParticipantLessonFeedbackSchema.shape);
    expect(keys).not.toContain('recommendations');
    expect(keys).not.toContain('completedRecommendationIds');
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('bookingId');
  });
});
