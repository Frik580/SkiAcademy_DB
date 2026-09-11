import {
  CanonicalTimestampSchema,
  ParticipantLessonFeedbackSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type CanonicalTimestamp,
  type ParticipantLessonFeedback,
  type ParticipantLessonFeedbackId,
} from '@ski-academy/shared-domain';

function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

const PARTICIPANT_LESSON_FEEDBACK_DOCUMENT_FIELD_KEYS = [
  'feedbackId',
  'participantId',
  'lessonBookingId',
  'instructorId',
  'items',
  'completedItemIds',
  'updatedBy',
  'revision',
  'createdAt',
  'updatedAt',
  'audit',
] as const;

export const PARTICIPANT_LESSON_FEEDBACK_PLANNING_ESTIMATES = {
  feedbackBytes: 73_728,
} as const;

export interface ParticipantLessonFeedbackRecord {
  readonly feedback: ParticipantLessonFeedback;
  readonly lessonStartsAt?: CanonicalTimestamp;
  readonly lessonDate?: string;
}

export function participantLessonFeedbackPath(
  feedbackId: ParticipantLessonFeedbackId
): string {
  return toTransactionPath(canonicalPaths.participantLessonFeedback(feedbackId));
}

function pickAggregateFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    PARTICIPANT_LESSON_FEEDBACK_DOCUMENT_FIELD_KEYS.flatMap((key) =>
      key in data ? [[key, data[key]]] : []
    )
  );
}

export function calendarDateInTimeZone(
  timestamp: CanonicalTimestamp,
  timeZone: string
): string {
  const date = new Date(timestamp.seconds * 1_000);
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return formatted.replace(/\//g, '-');
}

export function parseParticipantLessonFeedback(
  data: Record<string, unknown> | undefined
): ParticipantLessonFeedback | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ParticipantLessonFeedbackSchema.safeParse(pickAggregateFields(normalized));
  return parsed.success ? parsed.data : undefined;
}

export function parseParticipantLessonFeedbackRecord(
  data: Record<string, unknown> | undefined
): ParticipantLessonFeedbackRecord | undefined {
  const feedback = parseParticipantLessonFeedback(data);
  if (!feedback) return undefined;
  const normalized = normalizeFirestoreDocument(data);
  const lessonStartsAt = CanonicalTimestampSchema.safeParse(normalized?.lessonStartsAt);
  const lessonDate =
    typeof normalized?.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(normalized.lessonDate)
      ? normalized.lessonDate
      : undefined;
  return {
    feedback,
    ...(lessonStartsAt.success ? { lessonStartsAt: lessonStartsAt.data } : {}),
    ...(lessonDate ? { lessonDate } : {}),
  };
}

export function toFirestoreWritePayload(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
