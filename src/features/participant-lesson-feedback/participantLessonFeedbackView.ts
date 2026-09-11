import {
  emptyParticipantLessonFeedbackProjection,
  normalizeParticipantLessonFeedbackItems,
  BookingIdSchema,
  ParticipantIdSchema,
  type ParticipantLessonFeedbackItem,
  type ParticipantLessonFeedbackReadModel,
} from '@ski-academy/shared-domain';

export interface ParticipantLessonFeedbackDraftItem {
  readonly itemId: string;
  readonly text: string;
}

export interface ParticipantLessonFeedbackView {
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly items: readonly ParticipantLessonFeedbackDraftItem[];
  readonly revision: number;
}

export function persistableParticipantLessonFeedbackItems(
  drafts: readonly ParticipantLessonFeedbackDraftItem[]
): ParticipantLessonFeedbackItem[] {
  return normalizeParticipantLessonFeedbackItems(
    drafts
      .map((item) => ({ itemId: item.itemId, text: item.text.trim() }))
      .filter((item) => item.text.length > 0)
  );
}

export function participantLessonFeedbackViewFromReadModel(input: {
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly item: ParticipantLessonFeedbackReadModel | null;
}): ParticipantLessonFeedbackView {
  if (input.item === null) {
    const empty = emptyParticipantLessonFeedbackProjection({
      participantId: ParticipantIdSchema.parse(input.participantId),
      lessonBookingId: BookingIdSchema.parse(input.lessonBookingId),
    });
    return {
      participantId: empty.participantId,
      lessonBookingId: empty.lessonBookingId,
      items: [],
      revision: empty.revision,
    };
  }

  return {
    participantId: input.item.participantId,
    lessonBookingId: input.item.lessonBookingId,
    items: input.item.items.map((item) => ({ itemId: item.itemId, text: item.text })),
    revision: input.item.revision,
  };
}
