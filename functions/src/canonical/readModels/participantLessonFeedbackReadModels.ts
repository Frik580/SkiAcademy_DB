import {
  AccountIdSchema,
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
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import {
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { type ReadModelRequestContext } from './readModelRequestContext';

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
  participantIds: readonly ParticipantId[]
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
    const participant = parseParticipant(
      participantSnaps[index]?.data() as Record<string, unknown> | undefined
    );
    if (!participant || participant.management.kind !== 'managed') {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
    const managementSnap = await firestore
      .collection('participant_management')
      .doc(participant.management.participantManagementId)
      .get();
    const management = parseParticipantManagement(
      managementSnap.data() as Record<string, unknown> | undefined
    );
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

function historyQuery(
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
        item.participantId === participantId &&
        lessonBookingIds.includes(item.lessonBookingId)
    );
  }

  const snapshot = await historyQuery(firestore, participantId)
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
  const snapshot = await historyQuery(firestore, input.participantId).limit(1).get();
  const model = snapshot.docs[0]
    ? toScopedReadModel(snapshot.docs[0].data() as Record<string, unknown>, readScope)
    : undefined;
  return {
    scope: 'managed_latest',
    item:
      model && model.participantId === input.participantId
        ? model
        : null,
  };
}

export async function queryParticipantLessonFeedbackReadModels(
  firestore: Firestore,
  input: QueryParticipantLessonFeedbackReadModelsInput,
  options: Readonly<{
    accountId: AccountId;
    instructorId?: InstructorId;
    readContext?: ReadModelRequestContext;
    readScope?: CanonicalReadScope;
  }>
): Promise<QueryParticipantLessonFeedbackReadModelsResult> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  if (input.scope === 'instructor_lesson') {
    if (!options.instructorId) {
      throw new ParticipantLessonFeedbackReadDeniedError();
    }
    return queryInstructorLesson(firestore, input, options.instructorId, readScope);
  }
  if (input.scope === 'managed_participant') {
    return queryManagedParticipant(firestore, input, options.accountId, readScope);
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