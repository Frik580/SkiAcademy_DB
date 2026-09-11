import { describe, expect, it } from 'vitest';
import {
  QueryParticipantLessonFeedbackReadModelsInputSchema,
  emptyParticipantLessonFeedbackReadModel,
  participantLessonFeedbackReadModelItemsWithCompletion,
  rejectSpoofedParticipantLessonFeedbackReadInput,
} from './participantLessonFeedbackReadModel';
import { participantLessonFeedbackIdFromLessonParticipant } from '../deterministicIdentity';
import { BookingIdSchema, ParticipantIdSchema } from '../identifiers';

describe('participant lesson feedback read model contracts', () => {
  it('accepts instructor and managed scopes without legacy booking fields', () => {
    expect(
      QueryParticipantLessonFeedbackReadModelsInputSchema.safeParse({
        scope: 'instructor_lesson',
        participantId: 'participant_read_01',
        lessonBookingId: 'booking_read_01',
      }).success
    ).toBe(true);
    expect(
      QueryParticipantLessonFeedbackReadModelsInputSchema.safeParse({
        scope: 'managed_latest',
        participantId: 'participant_read_01',
      }).success
    ).toBe(true);
    expect(() =>
      rejectSpoofedParticipantLessonFeedbackReadInput({ recommendations: [] })
    ).toThrow();
  });

  it('projects per-item completion for the selected participant', () => {
    const items = participantLessonFeedbackReadModelItemsWithCompletion({
      items: [
        { itemId: 'task_a', text: 'Drill A' },
        { itemId: 'task_b', text: 'Drill B' },
      ],
      completedItemIds: ['task_b'],
    });
    expect(items).toEqual([
      { itemId: 'task_a', text: 'Drill A', completed: false },
      { itemId: 'task_b', text: 'Drill B', completed: true },
    ]);
  });

  it('models empty canonical start without legacy fallback fields', () => {
    const participantId = ParticipantIdSchema.parse('participant_read_empty');
    const lessonBookingId = BookingIdSchema.parse('booking_read_empty');
    expect(
      emptyParticipantLessonFeedbackReadModel({
        feedbackId: participantLessonFeedbackIdFromLessonParticipant({
          participantId,
          lessonBookingId,
        }),
        participantId,
        lessonBookingId,
      })
    ).toMatchObject({
      participantId,
      lessonBookingId,
      items: [],
      revision: 0,
    });
  });
});
