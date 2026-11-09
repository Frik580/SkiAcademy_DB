import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  CanonicalExecutionScopeSchema,
  INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE,
  ParticipantIdSchema,
  QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema,
  compareCanonicalTimestamps,
  documentMatchesReadScope,
  executionScopeFromReadScope,
  participantLessonFeedbackIdFromLessonParticipant,
  participantLessonFeedbackReadModelItemsWithCompletion,
  timestampFromDate,
  type CanonicalReadScope,
  type InstructorId,
  type QueryInstructorParticipantRecommendationHistoryReadModelsInput,
  type QueryInstructorParticipantRecommendationHistoryReadModelsResult,
} from '@ski-academy/shared-domain';
import { parseParticipantLessonFeedbackRecord } from '../lessonFeedback/participantLessonFeedbackStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { decodeHistoryCursor, encodeHistoryCursor } from './historyCursor';
import { participantLessonFeedbackHistoryQuery } from './participantLessonFeedbackReadModels';
import {
  instructorHasProgressAccess,
  ParticipantProgressReadDeniedError,
} from './participantProgressReadModels';
import { parseIfVisibleInReadScope } from './readModelScope';

const SCAN_MAX = 100;
const CURSOR_NAMESPACE = 'instructor-participant-recommendation-history:v1';
const CursorSchema = z
  .object({
    participantId: ParticipantIdSchema,
    readScope: CanonicalExecutionScopeSchema,
    // Fractional legacy sort keys must still be traversable when skipping invalid records.
    seconds: z.number().finite(),
    nanoseconds: z.number().finite(),
    id: z
      .string()
      .min(1)
      .max(1500)
      .refine((id) => !id.includes('/')),
  })
  .strict();

export async function queryInstructorParticipantRecommendationHistoryReadModels(
  firestore: Firestore,
  input: QueryInstructorParticipantRecommendationHistoryReadModelsInput,
  options: {
    instructorId: InstructorId;
    readScope: CanonicalReadScope;
    cursorSecret: string;
    now?: () => Date;
  }
): Promise<QueryInstructorParticipantRecommendationHistoryReadModelsResult> {
  const { readScope, instructorId, cursorSecret } = options;
  const at = timestampFromDate(options.now?.() ?? new Date());
  const participant = parseIfVisibleInReadScope(
    (await firestore.collection('participants').doc(input.participantId).get()).data(),
    parseParticipant,
    readScope,
    'identity'
  );
  if (
    !participant ||
    participant.participantId !== input.participantId ||
    participant.lifecycle.status !== 'active' ||
    !(await instructorHasProgressAccess(firestore, instructorId, participant, at, readScope))
  ) {
    throw new ParticipantProgressReadDeniedError();
  }

  const executionScope = executionScopeFromReadScope(readScope);
  let cursor = input.cursor
    ? decodeHistoryCursor(CURSOR_NAMESPACE, input.cursor, cursorSecret, CursorSchema)
    : undefined;
  if (
    cursor &&
    (cursor.participantId !== input.participantId ||
      JSON.stringify(cursor.readScope) !== JSON.stringify(executionScope))
  ) {
    throw new ParticipantProgressReadDeniedError();
  }

  const base = participantLessonFeedbackHistoryQuery(firestore, input.participantId)
    .where('lessonStartsAt.seconds', '>=', -Number.MAX_SAFE_INTEGER)
    .where('lessonStartsAt.seconds', '<=', at.seconds)
    .where('lessonStartsAt.nanoseconds', '>=', 0)
    .where('lessonStartsAt.nanoseconds', '<=', 999_999_999);
  const items: QueryInstructorParticipantRecommendationHistoryReadModelsResult['items'] = [];
  let reads = 0;
  let hasMore = false;
  while (reads < SCAN_MAX) {
    const limit = Math.min(INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE + 1, SCAN_MAX - reads);
    const page = await (
      cursor ? base.startAfter(cursor.seconds, cursor.nanoseconds, cursor.id) : base
    )
      .limit(limit)
      .get();
    reads += page.size;
    for (const [index, doc] of page.docs.entries()) {
      cursor = {
        participantId: input.participantId,
        readScope: executionScope,
        seconds: doc.get('lessonStartsAt.seconds'),
        nanoseconds: doc.get('lessonStartsAt.nanoseconds'),
        id: doc.id,
      };
      const data = doc.data();
      if (!documentMatchesReadScope(readScope, data)) continue;
      const record = parseParticipantLessonFeedbackRecord(data);
      if (!record?.lessonStartsAt || compareCanonicalTimestamps(record.lessonStartsAt, at) > 0)
        continue;
      const { feedback, lessonStartsAt } = record;
      if (
        feedback.participantId !== input.participantId ||
        feedback.feedbackId !== doc.id ||
        feedback.feedbackId !==
          participantLessonFeedbackIdFromLessonParticipant({
            participantId: feedback.participantId,
            lessonBookingId: feedback.lessonBookingId,
          }) ||
        !feedback.items.length
      )
        continue;

      const date = z.iso.date().safeParse(record.lessonDate);
      items.push({
        feedbackId: feedback.feedbackId,
        participantId: feedback.participantId,
        lessonBookingId: feedback.lessonBookingId,
        instructorId: feedback.instructorId,
        lessonStartsAt,
        ...(date.success ? { lessonDate: date.data } : {}),
        items: participantLessonFeedbackReadModelItemsWithCompletion(feedback),
        revision: feedback.revision,
        updatedAt: feedback.updatedAt,
      });
      if (items.length === INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE) {
        hasMore = index < page.size - 1 || page.size === limit;
        break;
      }
    }
    if (items.length === INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE || page.size < limit) break;
    if (reads === SCAN_MAX) hasMore = true;
  }

  return QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema.parse({
    scope: 'instructor',
    participantId: input.participantId,
    items,
    ...(hasMore && cursor
      ? { nextCursor: encodeHistoryCursor(CURSOR_NAMESPACE, cursor, cursorSecret) }
      : {}),
  });
}
