import {
  compareCanonicalTimestamps,
  type ParticipantLessonFeedbackReadModel,
} from '@ski-academy/shared-domain';
import { RECOMMENDATION_TODAY_WINDOW_DAYS } from './components/student/studentLessonPresentation';

export interface CanonicalRecommendationTodayTask {
  readonly id: string;
  readonly label: string;
  readonly lessonBookingId: string;
  readonly itemId: string;
  readonly title: string;
  readonly dateLabel: string;
}

export interface LessonFeedbackContext {
  readonly lessonBookingId: string;
  readonly instructorName?: string;
  readonly instructorId?: string;
  readonly date?: string;
  readonly time?: string;
}

export interface LessonFeedbackItemView {
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly itemId: string;
  readonly text: string;
  readonly completed: boolean;
  readonly revision: number;
}

export interface LessonFeedbackView {
  readonly participantId: string;
  readonly lessonBookingId: string;
  readonly items: readonly LessonFeedbackItemView[];
  readonly revision: number;
  readonly lessonDate?: string;
  readonly instructorId?: string;
  readonly instructorName?: string;
  readonly time?: string;
  readonly hasPending: boolean;
}

export function isLessonDateInTodayRecommendationWindow(
  lessonDate: string | undefined,
  maxDays = RECOMMENDATION_TODAY_WINDOW_DAYS,
  fromDate = new Date()
): boolean {
  if (!lessonDate) return true;
  const lesson = new Date(`${lessonDate}T12:00:00`);
  if (Number.isNaN(lesson.getTime())) return true;
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const lessonDay = new Date(lesson.getFullYear(), lesson.getMonth(), lesson.getDate());
  const ageDays = Math.floor((today.getTime() - lessonDay.getTime()) / 86_400_000);
  return ageDays >= 0 && ageDays <= maxDays;
}

export function formatLessonFeedbackDateLabel(
  lessonDate: string | undefined,
  language: 'en' | 'ru'
): string {
  if (!lessonDate) return '';
  const date = new Date(`${lessonDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return lessonDate;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
}

export function sortParticipantLessonFeedback(
  items: readonly ParticipantLessonFeedbackReadModel[]
): ParticipantLessonFeedbackReadModel[] {
  return [...items].sort((left, right) => {
    if (left.lessonStartsAt && right.lessonStartsAt) {
      const compared = compareCanonicalTimestamps(right.lessonStartsAt, left.lessonStartsAt);
      if (compared !== 0) return compared;
    }
    if (left.lessonDate && right.lessonDate) {
      const dateCmp = right.lessonDate.localeCompare(left.lessonDate);
      if (dateCmp !== 0) return dateCmp;
    }
    return right.lessonBookingId.localeCompare(left.lessonBookingId);
  });
}

export function selectExactParticipantFeedback(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string
): ParticipantLessonFeedbackReadModel[] {
  return items.filter((item) => item.participantId === participantId);
}

export function selectLatestParticipantLessonFeedback(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId?: string
): ParticipantLessonFeedbackReadModel | null {
  const scoped = participantId ? selectExactParticipantFeedback(items, participantId) : items;
  return sortParticipantLessonFeedback(scoped).find((item) => item.items.length > 0) ?? null;
}

export function selectLatestFeedbackHighlight(
  feedback: ParticipantLessonFeedbackReadModel
): { readonly item: LessonFeedbackItemView; readonly isPending: boolean } | null {
  if (feedback.items.length === 0) return null;
  const pending = feedback.items.find((item) => !item.completed);
  const chosen = pending ?? feedback.items[feedback.items.length - 1];
  if (!chosen) return null;
  return {
    item: toFeedbackItemView(feedback, chosen),
    isPending: pending != null,
  };
}

export function selectFeedbackForLesson(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string,
  lessonBookingId: string
): ParticipantLessonFeedbackReadModel | null {
  return (
    items.find(
      (item) => item.participantId === participantId && item.lessonBookingId === lessonBookingId
    ) ?? null
  );
}

export function selectInstructorParticipantLessonFeedback(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string,
  instructorId: string
): ParticipantLessonFeedbackReadModel[] {
  return sortParticipantLessonFeedback(
    selectExactParticipantFeedback(items, participantId).filter(
      (item) => item.instructorId === instructorId && item.items.length > 0
    )
  );
}

export function toLessonFeedbackView(
  feedback: ParticipantLessonFeedbackReadModel,
  context?: LessonFeedbackContext
): LessonFeedbackView {
  return {
    participantId: feedback.participantId,
    lessonBookingId: feedback.lessonBookingId,
    items: feedback.items.map((item) => toFeedbackItemView(feedback, item)),
    revision: feedback.revision,
    lessonDate: feedback.lessonDate ?? context?.date,
    instructorId: feedback.instructorId ?? context?.instructorId,
    instructorName: context?.instructorName,
    time: context?.time,
    hasPending: feedback.items.some((item) => !item.completed),
  };
}

export function lessonFeedbackFlagsByLessonId(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string
): ReadonlyMap<string, { readonly hasItems: boolean; readonly hasPending: boolean }> {
  const map = new Map<string, { readonly hasItems: boolean; readonly hasPending: boolean }>();
  for (const feedback of selectExactParticipantFeedback(items, participantId)) {
    if (feedback.items.length === 0) continue;
    map.set(feedback.lessonBookingId, {
      hasItems: true,
      hasPending: feedback.items.some((item) => !item.completed),
    });
  }
  return map;
}

export function pendingLessonFeedbackCount(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string,
  lessonBookingId: string
): number {
  const feedback = selectFeedbackForLesson(items, participantId, lessonBookingId);
  if (!feedback) return 0;
  return feedback.items.filter((item) => !item.completed).length;
}

export function selectIncompleteLessonFeedback(
  items: readonly ParticipantLessonFeedbackReadModel[],
  participantId: string
): ParticipantLessonFeedbackReadModel[] {
  return sortParticipantLessonFeedback(
    selectExactParticipantFeedback(items, participantId).filter((item) =>
      item.items.some((entry) => !entry.completed)
    )
  );
}

export function buildCanonicalRecommendationTodayTasks(input: {
  readonly items: readonly ParticipantLessonFeedbackReadModel[];
  readonly participantId: string;
  readonly dismissedTaskIds?: ReadonlySet<string>;
  readonly contextByLessonId?: ReadonlyMap<string, LessonFeedbackContext>;
  readonly language: 'en' | 'ru';
  readonly fromDate?: Date;
}): CanonicalRecommendationTodayTask[] {
  const { participantId, dismissedTaskIds, contextByLessonId, language, fromDate } = input;
  const tasks: CanonicalRecommendationTodayTask[] = [];
  for (const feedback of sortParticipantLessonFeedback(
    selectExactParticipantFeedback(input.items, participantId)
  )) {
    if (
      !isLessonDateInTodayRecommendationWindow(
        feedback.lessonDate,
        RECOMMENDATION_TODAY_WINDOW_DAYS,
        fromDate
      )
    ) {
      continue;
    }
    const context = contextByLessonId?.get(feedback.lessonBookingId);
    const dateLabel =
      formatLessonFeedbackDateLabel(feedback.lessonDate ?? context?.date, language) ||
      context?.date ||
      '';
    const title = context?.instructorName || dateLabel;
    for (const item of feedback.items) {
      if (item.completed) continue;
      const id = `${feedback.lessonBookingId}_${item.itemId}`;
      if (dismissedTaskIds?.has(id)) continue;
      tasks.push({
        id,
        label: item.text,
        lessonBookingId: feedback.lessonBookingId,
        itemId: item.itemId,
        title,
        dateLabel,
      });
    }
  }
  return tasks;
}

function toFeedbackItemView(
  feedback: ParticipantLessonFeedbackReadModel,
  item: ParticipantLessonFeedbackReadModel['items'][number]
): LessonFeedbackItemView {
  return {
    participantId: feedback.participantId,
    lessonBookingId: feedback.lessonBookingId,
    itemId: item.itemId,
    text: item.text,
    completed: item.completed,
    revision: feedback.revision,
  };
}
