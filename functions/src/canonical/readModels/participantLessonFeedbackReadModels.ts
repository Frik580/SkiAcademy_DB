import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  PARTICIPANT_RECOMMENDATIONS_PAGE_SIZE,
  type ManagedRecommendation,
  InstructorIdSchema,
  PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_LESSON_IDS_MAX,
  ParticipantLessonFeedbackReadModelSchema,
  emptyParticipantLessonFeedbackReadModel,
  evaluateParticipantManagementAccess,
  participantLessonFeedbackIdFromLessonParticipant,
  participantLessonFeedbackReadModelItemsWithCompletion,
  timestampFromDate,
  type AccountId,
  type Booking,
  type BookingId,
  type InstructorId,
  type ParticipantId,
  type ParticipantLessonFeedbackReadModel,
  type QueryParticipantLessonFeedbackReadModelsInput,
  type QueryParticipantLessonFeedbackReadModelsResult,
  LIVE_CANONICAL_READ_SCOPE,
  documentMatchesReadScope,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { loadAuthorizedInstructorLessonFeedbackBooking } from '../lessonFeedback/participantLessonFeedbackAuthorization';
import {
  calendarDateInTimeZone,
  parseParticipantLessonFeedbackRecord,
  participantLessonFeedbackPath,
} from '../lessonFeedback/participantLessonFeedbackStore';
import { parseBooking } from '../bookings/bookingStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import {
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { type ReadModelRequestContext } from './readModelRequestContext';
import { decodeHistoryCursor, encodeHistoryCursor } from './historyCursor';
import { parseIfVisibleInReadScope } from './readModelScope';

const MANAGED_FEEDBACK_HISTORY_LIMIT = PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_LESSON_IDS_MAX;

export class ParticipantLessonFeedbackReadDeniedError extends Error {
  constructor() {
    super('This action is not permitted.');
    this.name = 'ParticipantLessonFeedbackReadDeniedError';
  }
}

function lessonProjectionFromBooking(booking: Booking): {
  readonly lessonDate: string;
  readonly lessonStartsAt: Booking['occurrence']['interval']['startsAt'];
} {
  return {
    lessonDate: calendarDateInTimeZone(
      booking.occurrence.interval.startsAt,
      booking.occurrence.timeZone
    ),
    lessonStartsAt: booking.occurrence.interval.startsAt,
  };
}

function toReadModel(
  record: ReturnType<typeof parseParticipantLessonFeedbackRecord>
): ParticipantLessonFeedbackReadModel | undefined {
  if (!record) return undefined;
  const { feedback, lessonStartsAt, lessonDate } = record;
  return ParticipantLessonFeedbackReadModelSchema.parse({
    feedbackId: feedback.feedbackId,
    participantId: feedback.participantId,
    lessonBookingId: feedback.lessonBookingId,
    instructorId: feedback.instructorId,
    items: participantLessonFeedbackReadModelItemsWithCompletion({
      items: feedback.items,
      completedItemIds: feedback.completedItemIds,
    }),
    revision: feedback.revision,
    ...(lessonDate ? { lessonDate } : {}),
    ...(lessonStartsAt ? { lessonStartsAt } : {}),
    updatedAt: feedback.updatedAt,
    ...(feedback.updatedBy ? { updatedBy: feedback.updatedBy } : {}),
  });
}

function emptyInstructorLessonReadModel(input: {
  readonly participantId: ParticipantId;
  readonly lessonBookingId: BookingId;
  readonly booking?: Booking;
}): ParticipantLessonFeedbackReadModel {
  const empty = emptyParticipantLessonFeedbackReadModel({
    feedbackId: participantLessonFeedbackIdFromLessonParticipant({
      participantId: input.participantId,
      lessonBookingId: input.lessonBookingId,
    }),
    participantId: input.participantId,
    lessonBookingId: input.lessonBookingId,
  });
  if (!input.booking) return empty;
  const projection = lessonProjectionFromBooking(input.booking);
  return ParticipantLessonFeedbackReadModelSchema.parse({
    ...empty,
    ...projection,
  });
}

async function assertManagedAccess(
  firestore: Firestore,
  accountId: AccountId,
  participantIds: readonly ParticipantId[],
  readScope?: CanonicalReadScope
): Promise<void> {
  if (participantIds.length === 0) return;
  const accountSnap = await firestore.collection('users').doc(accountId).get();
  const account = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);
  if (!account || account.lifecycle.status !== 'active') {
    throw new ParticipantLessonFeedbackReadDeniedError();
  }

  const participantSnaps = await firestore.getAll(
    ...participantIds.map((participantId) =>
      firestore.collection('participants').doc(participantId)
    )
  );

  for (let index = 0; index < participantIds.length; index += 1) {
    const participantData = participantSnaps[index]?.data() as Record<string, unknown> | undefined;
    const participant = readScope
      ? parseIfVisibleInReadScope(participantData, parseParticipant, readScope, 'identity')
      : parseParticipant(participantData);
    if (
      !participant ||
      participant.participantId !== participantIds[index] ||
      participant.management.kind !== 'managed'
    ) {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
    const managementSnap = await firestore
      .collection('participant_management')
      .doc(participant.management.participantManagementId)
      .get();
    const managementData = managementSnap.data() as Record<string, unknown> | undefined;
    const management = readScope
      ? parseIfVisibleInReadScope(managementData, parseParticipantManagement, readScope, 'identity')
      : parseParticipantManagement(managementData);
    if (!management || management.status !== 'active') {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
    const topology = buildParticipantAccessTopology({
      account,
      participant,
      management,
    });
    const access = evaluateParticipantManagementAccess(topology, {
      accountId,
      participantId: participant.participantId,
    });
    if (!access.allowed) {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
  }
}

function toScopedReadModel(
  data: Record<string, unknown> | undefined,
  readScope: CanonicalReadScope
): ParticipantLessonFeedbackReadModel | undefined {
  if (!documentMatchesReadScope(readScope, data ?? {})) return undefined;
  return toReadModel(parseParticipantLessonFeedbackRecord(data));
}

async function loadFeedbackByIds(
  firestore: Firestore,
  feedbackIds: readonly string[],
  readScope: CanonicalReadScope
): Promise<ParticipantLessonFeedbackReadModel[]> {
  if (feedbackIds.length === 0) return [];
  const snapshots = await firestore.getAll(
    ...feedbackIds.map((feedbackId) =>
      firestore.collection('participant_lesson_feedback').doc(feedbackId)
    )
  );
  return snapshots
    .map((snapshot) =>
      toScopedReadModel(
        snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined,
        readScope
      )
    )
    .filter((model): model is ParticipantLessonFeedbackReadModel => model !== undefined);
}

export function participantLessonFeedbackHistoryQuery(
  firestore: Firestore,
  participantId: ParticipantId
): Query {
  return firestore
    .collection('participant_lesson_feedback')
    .where('participantId', '==', participantId)
    .orderBy('lessonStartsAt.seconds', 'desc')
    .orderBy('lessonStartsAt.nanoseconds', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
}

async function loadParticipantHistory(
  firestore: Firestore,
  participantId: ParticipantId,
  lessonBookingIds: readonly BookingId[] | undefined,
  readScope: CanonicalReadScope
): Promise<ParticipantLessonFeedbackReadModel[]> {
  if (lessonBookingIds && lessonBookingIds.length > 0) {
    const feedbackIds = lessonBookingIds.map((lessonBookingId) =>
      participantLessonFeedbackIdFromLessonParticipant({ participantId, lessonBookingId })
    );
    const items = await loadFeedbackByIds(firestore, feedbackIds, readScope);
    return items.filter(
      (item) =>
        item.participantId === participantId && lessonBookingIds.includes(item.lessonBookingId)
    );
  }

  const snapshot = await participantLessonFeedbackHistoryQuery(firestore, participantId)
    .limit(MANAGED_FEEDBACK_HISTORY_LIMIT)
    .get();
  return snapshot.docs
    .map((document) => toScopedReadModel(document.data() as Record<string, unknown>, readScope))
    .filter(
      (model): model is ParticipantLessonFeedbackReadModel =>
        model !== undefined && model.participantId === participantId
    );
}

async function queryInstructorLesson(
  firestore: Firestore,
  input: Extract<QueryParticipantLessonFeedbackReadModelsInput, { scope: 'instructor_lesson' }>,
  instructorId: InstructorId,
  readScope: CanonicalReadScope
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  const at = timestampFromDate(new Date());
  const booking = await loadAuthorizedInstructorLessonFeedbackBooking(firestore, {
    instructorId,
    participantId: input.participantId,
    lessonBookingId: input.lessonBookingId,
    at,
  });
  if (!booking || !documentMatchesReadScope(readScope, booking)) {
    throw new ParticipantLessonFeedbackReadDeniedError();
  }

  const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
    participantId: input.participantId,
    lessonBookingId: input.lessonBookingId,
  });
  const snapshot = await firestore.doc(participantLessonFeedbackPath(feedbackId)).get();
  const model = toScopedReadModel(
    snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined,
    readScope
  );
  if (model && model.participantId !== input.participantId) {
    throw new ParticipantLessonFeedbackReadDeniedError();
  }
  if (model && model.lessonBookingId !== input.lessonBookingId) {
    throw new ParticipantLessonFeedbackReadDeniedError();
  }

  return {
    scope: 'instructor_lesson',
    item:
      model ??
      emptyInstructorLessonReadModel({
        participantId: input.participantId,
        lessonBookingId: input.lessonBookingId,
        booking,
      }),
  };
}

async function queryManagedParticipant(
  firestore: Firestore,
  input: Extract<QueryParticipantLessonFeedbackReadModelsInput, { scope: 'managed_participant' }>,
  accountId: AccountId,
  readScope: CanonicalReadScope
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  const uniqueParticipantIds = [...new Set(input.participantIds)];
  await assertManagedAccess(firestore, accountId, uniqueParticipantIds);
  const items: ParticipantLessonFeedbackReadModel[] = [];
  for (const participantId of uniqueParticipantIds) {
    const history = await loadParticipantHistory(
      firestore,
      participantId,
      input.lessonBookingIds,
      readScope
    );
    items.push(...history.filter((item) => item.participantId === participantId));
  }
  return { scope: 'managed_participant', items };
}

async function queryManagedLatest(
  firestore: Firestore,
  input: Extract<QueryParticipantLessonFeedbackReadModelsInput, { scope: 'managed_latest' }>,
  accountId: AccountId,
  readScope: CanonicalReadScope
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  await assertManagedAccess(firestore, accountId, [input.participantId]);
  const snapshot = await participantLessonFeedbackHistoryQuery(firestore, input.participantId)
    .limit(1)
    .get();
  const model = snapshot.docs[0]
    ? toScopedReadModel(snapshot.docs[0].data() as Record<string, unknown>, readScope)
    : undefined;
  return {
    scope: 'managed_latest',
    item: model && model.participantId === input.participantId ? model : null,
  };
}

const RecommendationCursorSchema = z.tuple([
  z.tuple([
    z.number().finite(),
    z.number().finite(),
    z
      .string()
      .min(1)
      .max(1500)
      .refine((id) => !id.includes('/')),
    z.string().min(1).max(64).optional(),
  ]),
  z.number().int().min(0).max(PARTICIPANT_RECOMMENDATIONS_PAGE_SIZE),
]);

async function queryManagedRecommendations(
  firestore: Firestore,
  input: Extract<
    QueryParticipantLessonFeedbackReadModelsInput,
    { scope: 'managed_recommendations' }
  >,
  accountId: AccountId,
  readScope: CanonicalReadScope,
  cursorSecret: string | undefined
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  await assertManagedAccess(firestore, accountId, [input.participantId], readScope);
  if (!cursorSecret) {
    throw new HttpsError('failed-precondition', 'Recommendation pagination is unavailable.');
  }

  const cursorContext = JSON.stringify([
    'managed-recommendations:v1',
    accountId,
    input.participantId,
    readScope.dataScope,
    readScope.dataScope === 'test' ? readScope.testSessionId : null,
    readScope.purpose,
  ]);
  const encodeCursor = (value: z.output<typeof RecommendationCursorSchema>) =>
    encodeHistoryCursor(cursorContext, value, cursorSecret);
  const [anchor, emitted] =
    input.cursor === undefined
      ? ([undefined, 0] as const)
      : decodeHistoryCursor(cursorContext, input.cursor, cursorSecret, RecommendationCursorSchema);
  const batchSize = 8;
  const maxBatches = 4;
  const history = participantLessonFeedbackHistoryQuery(firestore, input.participantId)
    .where('lessonStartsAt.seconds', '>=', -Number.MAX_SAFE_INTEGER)
    .where('lessonStartsAt.seconds', '<=', Number.MAX_SAFE_INTEGER)
    .where('lessonStartsAt.nanoseconds', '>=', 0)
    .where('lessonStartsAt.nanoseconds', '<=', 999_999_999)
    .limit(batchSize);
  let query = history;
  if (anchor) {
    const [seconds, nanoseconds, documentId, itemId] = anchor;
    query =
      itemId === undefined
        ? history.startAfter(seconds, nanoseconds, documentId)
        : history.startAt(seconds, nanoseconds, documentId);
  }

  const items: Omit<ManagedRecommendation, 'lessonAvailable'>[] = [];
  async function result(
    nextCursor: string | null,
    scanCursor?: string
  ): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
    const ids = [...new Set(items.map((item) => item.lessonBookingId))];
    const bookings = ids.length
      ? await firestore.getAll(...ids.map((id) => firestore.collection('bookings').doc(id)))
      : [];
    const available = new Map(
      bookings.flatMap((snapshot) => {
        const data = snapshot.data() as Record<string, unknown> | undefined;
        const booking = documentMatchesReadScope(readScope, data) ? parseBooking(data) : undefined;
        return booking &&
          booking.bookingId === snapshot.id &&
          !booking.archival?.isDeleted &&
          booking.party.participantIds.includes(input.participantId)
          ? [[booking.bookingId, booking] as const]
          : [];
      })
    );
    return {
      scope: 'managed_recommendations',
      items: items.map((item) => {
        const booking = available.get(item.lessonBookingId);
        const lessonDate =
          item.lessonDate ?? (booking && lessonProjectionFromBooking(booking).lessonDate);
        return {
          ...item,
          ...(lessonDate ? { lessonDate } : {}),
          lessonAvailable: Boolean(booking),
        };
      }),
      nextCursor,
      ...(scanCursor ? { scanCursor } : {}),
    };
  }
  let scanCursor: string | undefined;
  // The existing index includes legacy LIVE records. Filter scope before projecting any item.
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      const model = toScopedReadModel(doc.data() as Record<string, unknown>, readScope);
      if (
        !model?.lessonStartsAt ||
        model.participantId !== input.participantId ||
        model.feedbackId !== doc.id ||
        model.feedbackId !==
          participantLessonFeedbackIdFromLessonParticipant({
            participantId: input.participantId,
            lessonBookingId: model.lessonBookingId,
          })
      )
        continue;

      const { seconds, nanoseconds } = model.lessonStartsAt;
      const minimumItemId =
        anchor?.[2] === doc.id && anchor[0] === seconds && anchor[1] === nanoseconds
          ? anchor[3]
          : undefined;
      // Order by ID so editing or reordering the list does not shift the cursor.
      const ordered = [...model.items].sort((left, right) =>
        left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0
      );
      for (const item of ordered) {
        if (!item.text.trim() || (minimumItemId !== undefined && item.itemId < minimumItemId))
          continue;
        if (emitted + items.length === PARTICIPANT_RECOMMENDATIONS_PAGE_SIZE) {
          // Point at the first item of the next page, even after a long run of empty records.
          return result(encodeCursor([[seconds, nanoseconds, doc.id, item.itemId], 0]));
        }
        items.push({
          ...item,
          lessonBookingId: model.lessonBookingId,
          ...(model.instructorId ? { instructorId: model.instructorId } : {}),
          ...(model.lessonDate ? { lessonDate: model.lessonDate } : {}),
        });
      }
    }
    if (snapshot.size < batchSize) return result(null);
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    query = history.startAfter(lastDoc);
    scanCursor = encodeCursor([
      [
        lastDoc.get('lessonStartsAt.seconds'),
        lastDoc.get('lessonStartsAt.nanoseconds'),
        lastDoc.id,
      ],
      emitted + items.length,
    ]);
  }
  return result(null, scanCursor);
}

export async function queryParticipantLessonFeedbackReadModels(
  firestore: Firestore,
  input: QueryParticipantLessonFeedbackReadModelsInput,
  options: Readonly<{
    accountId: AccountId;
    instructorId?: InstructorId;
    readContext?: ReadModelRequestContext;
    readScope?: CanonicalReadScope;
    cursorSecret?: string;
  }>
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  const readScope =
    options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  if (input.scope === 'instructor_lesson') {
    if (!options.instructorId) {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
    return queryInstructorLesson(firestore, input, options.instructorId, readScope);
  }
  if (input.scope === 'managed_participant') {
    return queryManagedParticipant(firestore, input, options.accountId, readScope);
  }
  if (input.scope === 'managed_recommendations') {
    return queryManagedRecommendations(
      firestore,
      input,
      options.accountId,
      readScope,
      options.cursorSecret
    );
  }
  return queryManagedLatest(firestore, input, options.accountId, readScope);
}

export function parseFeedbackReadAccountId(authUid: string | undefined): AccountId | undefined {
  const parsed = AccountIdSchema.safeParse(authUid);
  return parsed.success ? parsed.data : undefined;
}

export function parseFeedbackReadInstructorId(value: string | undefined): InstructorId | undefined {
  const parsed = InstructorIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
