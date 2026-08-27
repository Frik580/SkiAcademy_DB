import {
  evaluateParticipantManagementAccess,
  isLessonBookingHot,
  ParticipantManagementSchema,
  type Account,
  type AccountId,
  type Booking,
  type LessonBookingReadModel,
  type LessonBookingReadModelCursor,
  type LessonBookingReadModelInstructorProjection,
  type LessonBookingReadModelLifecycleProjection,
  type LessonBookingReadModelOccurrenceProjection,
  type LessonBookingReadModelParticipantProjection,
  type LessonBookingReadModelPaymentPresentation,
  type Participant,
  type ParticipantManagement,
  type Payment,
  type QueryLessonBookingReadModelsInput,
  type QueryLessonBookingReadModelsResult,
  compareCanonicalTimestamps,
  decodeLessonBookingReadModelCursor,
  encodeLessonBookingReadModelCursor,
  LESSON_BOOKING_READ_MODEL_PAGE_SIZE_DEFAULT,
  LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX,
  timestampFromDate,
  guestSubjectIdFromBookingId,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { verifyGuestActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { parseBooking, parseInstructorCatalog } from '../bookings/bookingStore';
import { parsePayment } from '../finance/financeStore';
import { parseAccount, parseParticipant } from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';

export interface LessonBookingReadAuthorizationContext {
  readonly account?: Account;
  readonly participantManagement: readonly ParticipantManagement[];
  readonly participants: readonly Participant[];
}

export async function loadLessonBookingReadAuthorizationContext(
  firestore: Firestore,
  accountId: AccountId
): Promise<LessonBookingReadAuthorizationContext> {
  const accountSnap = await firestore.collection('users').doc(accountId).get();
  const accountData = parseAccount(accountSnap.data() as Record<string, unknown> | undefined);

  const managementSnap = await firestore
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .limit(50)
    .get();

  const participantManagement: ParticipantManagement[] = [];
  for (const doc of managementSnap.docs) {
    const parsed = ParticipantManagementSchema.safeParse(doc.data());
    if (parsed.success && parsed.data.status === 'active') {
      participantManagement.push(parsed.data);
    }
  }

  const participants: Participant[] = [];
  for (const management of participantManagement) {
    const participantSnap = await firestore
      .collection('participants')
      .doc(management.participantId)
      .get();
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (participant) {
      participants.push(participant);
    }
  }

  return {
    account: accountData,
    participantManagement,
    participants,
  };
}

export function canAccountViewLessonBookingService(
  context: LessonBookingReadAuthorizationContext,
  accountId: AccountId,
  booking: Booking
): boolean {
  if (!context.account || context.account.accountId !== accountId) {
    return false;
  }

  for (const participantId of booking.party.participantIds) {
    const management = context.participantManagement.find(
      (record) => record.participantId === participantId
    );
    const participant = context.participants.find(
      (record) => record.participantId === participantId
    );
    if (!management || !participant) {
      continue;
    }
    const scopedTopology = buildParticipantAccessTopology({
      account: context.account,
      participant,
      management,
    });
    const decision = evaluateParticipantManagementAccess(scopedTopology, {
      accountId,
      participantId,
    });
    if (decision.allowed) {
      return true;
    }
  }
  return false;
}

export function canAccountViewLessonBookingFinancial(
  accountId: AccountId,
  booking: Booking,
  payment: Payment | undefined
): boolean {
  const payerAccountId = booking.payerAccountId ?? payment?.payerAccountId;
  return payerAccountId !== undefined && payerAccountId === accountId;
}

function durationMinutesFromInterval(start: CanonicalTimestamp, end: CanonicalTimestamp): number {
  const startMs = start.seconds * 1_000 + start.nanoseconds / 1_000_000;
  const endMs = end.seconds * 1_000 + end.nanoseconds / 1_000_000;
  return Math.max(1, Math.round((endMs - startMs) / 60_000));
}

function buildLifecycleProjection(booking: Booking): LessonBookingReadModelLifecycleProjection {
  const lifecycle = booking.lifecycle;
  if (lifecycle.status === 'pending') {
    return {
      status: lifecycle.status,
      reservationExpiresAt: lifecycle.reservationExpiresAt,
    };
  }
  if (lifecycle.status === 'pending_cancellation') {
    return {
      status: lifecycle.status,
      requestedAt: lifecycle.requestedAt,
    };
  }
  if (lifecycle.status === 'cancelled') {
    return {
      status: lifecycle.status,
      cancelledAt: lifecycle.cancelledAt,
      reasonCode: lifecycle.reasonCode,
    };
  }
  if (lifecycle.status === 'completed') {
    return {
      status: lifecycle.status,
      completedAt: lifecycle.completedAt,
    };
  }
  if (lifecycle.status === 'no_show') {
    return {
      status: lifecycle.status,
      noShowAt: lifecycle.noShowAt,
    };
  }
  return { status: lifecycle.status };
}

export function buildPaymentPresentation(
  accountId: AccountId,
  booking: Booking,
  payment: Payment | undefined
): LessonBookingReadModelPaymentPresentation | undefined {
  if (!payment) {
    return undefined;
  }
  if (!canAccountViewLessonBookingFinancial(accountId, booking, payment)) {
    return { kind: 'withheld' };
  }
  return {
    kind: 'visible',
    paymentStatus: payment.paymentStatus,
    paymentRevision: payment.revision,
  };
}

export async function buildLessonBookingReadModel(
  firestore: Firestore,
  accountId: AccountId,
  booking: Booking
): Promise<LessonBookingReadModel | undefined> {
  const instructorSnap = await firestore
    .collection('instructors')
    .doc(booking.occurrence.instructorId)
    .get();
  const instructorCatalog = parseInstructorCatalog(
    booking.occurrence.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const participants: LessonBookingReadModelParticipantProjection[] = [];
  for (const participantId of booking.party.participantIds) {
    const participantSnap = await firestore.collection('participants').doc(participantId).get();
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      return undefined;
    }
    participants.push({
      participantId: participant.participantId,
      displayName: participant.displayName,
    });
  }

  const paymentSnap = await firestore.collection('payments').doc(booking.paymentId).get();
  const payment = parsePayment(paymentSnap.data() as Record<string, unknown> | undefined);

  const instructor: LessonBookingReadModelInstructorProjection = {
    instructorId: booking.occurrence.instructorId,
    displayName: instructorCatalog.name,
    ...(instructorCatalog.avatarUrl ? { avatarUrl: instructorCatalog.avatarUrl } : {}),
  };

  const occurrence: LessonBookingReadModelOccurrenceProjection = {
    startsAt: booking.occurrence.interval.startsAt,
    endsAt: booking.occurrence.interval.endsAt,
    timeZone: booking.occurrence.timeZone,
    durationMinutes: durationMinutesFromInterval(
      booking.occurrence.interval.startsAt,
      booking.occurrence.interval.endsAt
    ),
  };

  return {
    bookingId: booking.bookingId,
    revision: booking.revision,
    partyKind: booking.party.kind,
    participantIds: [...booking.party.participantIds],
    participants,
    instructor,
    occurrence,
    lifecycle: buildLifecycleProjection(booking),
    bookingOrigin: booking.attribution.bookingOrigin,
    paymentPresentation: buildPaymentPresentation(accountId, booking, payment),
    updatedAt: booking.updatedAt,
  };
}

function compareBookingReadOrder(left: Booking, right: Booking): number {
  const updatedCompare = compareCanonicalTimestamps(left.updatedAt, right.updatedAt);
  if (updatedCompare !== 0) {
    return -updatedCompare;
  }
  return left.bookingId.localeCompare(right.bookingId);
}

function isAfterCursor(booking: Booking, cursor: LessonBookingReadModelCursor): boolean {
  const updatedCompare = compareCanonicalTimestamps(booking.updatedAt, {
    seconds: cursor.updatedAtSeconds,
    nanoseconds: cursor.updatedAtNanoseconds,
  });
  if (updatedCompare < 0) {
    return true;
  }
  if (updatedCompare > 0) {
    return false;
  }
  return booking.bookingId < cursor.bookingId;
}

async function loadAuthorizedAccountBookings(
  firestore: Firestore,
  accountId: AccountId
): Promise<Booking[]> {
  const authContext = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
  const participantIds = authContext.participantManagement.map(
    (management) => management.participantId
  );
  if (participantIds.length === 0) {
    return [];
  }

  const bookingsById = new Map<string, Booking>();
  const batchSize = 10;
  for (let index = 0; index < participantIds.length; index += batchSize) {
    const batch = participantIds.slice(index, index + batchSize);
    const snapshot = await firestore
      .collection('bookings')
      .where('party.participantIds', 'array-contains-any', batch)
      .limit(LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX * 4)
      .get();

    for (const doc of snapshot.docs) {
      const parsed = parseBooking(doc.data() as Record<string, unknown>);
      if (!parsed || parsed.archival?.isDeleted) {
        continue;
      }
      if (!canAccountViewLessonBookingService(authContext, accountId, parsed)) {
        continue;
      }
      bookingsById.set(parsed.bookingId, parsed);
    }
  }

  return [...bookingsById.values()].sort(compareBookingReadOrder);
}

export async function queryLessonBookingReadModels(
  firestore: Firestore,
  input: QueryLessonBookingReadModelsInput,
  options: {
    readonly accountId?: AccountId;
    readonly guestActionSecret?: string;
    readonly now?: Date;
  } = {}
): Promise<QueryLessonBookingReadModelsResult> {
  const pageSize = Math.min(
    input.pageSize ?? LESSON_BOOKING_READ_MODEL_PAGE_SIZE_DEFAULT,
    LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX
  );
  const now = timestampFromDate(options.now ?? new Date());
  const cursor = input.cursor ? decodeLessonBookingReadModelCursor(input.cursor) : undefined;

  if (input.scope === 'guest_single') {
    const bookingId = input.bookingId!;
    const bookingSnap = await firestore.collection('bookings').doc(bookingId).get();
    const booking = parseBooking(bookingSnap.data() as Record<string, unknown> | undefined);
    if (!booking || booking.archival?.isDeleted) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const guestSubjectId = guestSubjectIdFromBookingId(bookingId);
    const verification = verifyGuestActionCredentialPartsAuthoritative({
      secret: options.guestActionSecret ?? '',
      nonce: input.guestActionNonce!,
      signature: input.guestActionSignature!,
      now,
      expectedBookingId: bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
      expiresAt:
        booking.lifecycle.status === 'pending'
          ? booking.lifecycle.reservationExpiresAt
          : booking.updatedAt,
    });
    if (!verification.valid) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const readModel = await buildGuestLessonBookingReadModel(firestore, booking);
    return {
      scope: input.scope,
      items: readModel ? [readModel] : [],
      hasMore: false,
    };
  }

  const accountId = options.accountId;
  if (!accountId) {
    return { scope: input.scope, items: [], hasMore: false };
  }

  const authorizedBookings = await loadAuthorizedAccountBookings(firestore, accountId);
  const filtered = authorizedBookings.filter((booking) => {
    const hot = isLessonBookingHot({
      lifecycleStatus: booking.lifecycle.status,
      endsAt: booking.occurrence.interval.endsAt,
      now,
    });
    return input.scope === 'account_hot' ? hot : !hot;
  });

  const afterCursor = cursor
    ? filtered.filter((booking) => isAfterCursor(booking, cursor))
    : filtered;

  const page = afterCursor.slice(0, pageSize);
  const items: LessonBookingReadModel[] = [];
  for (const booking of page) {
    const readModel = await buildLessonBookingReadModel(firestore, accountId, booking);
    if (readModel) {
      items.push(readModel);
    }
  }

  const hasMore = afterCursor.length > pageSize;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeLessonBookingReadModelCursor({
          updatedAtSeconds: last.updatedAt.seconds,
          updatedAtNanoseconds: last.updatedAt.nanoseconds,
          bookingId: last.bookingId,
        })
      : undefined;

  return {
    scope: input.scope,
    items,
    ...(nextCursor ? { nextCursor } : {}),
    hasMore,
  };
}

async function buildGuestLessonBookingReadModel(
  firestore: Firestore,
  booking: Booking
): Promise<LessonBookingReadModel | undefined> {
  const instructorSnap = await firestore
    .collection('instructors')
    .doc(booking.occurrence.instructorId)
    .get();
  const instructorCatalog = parseInstructorCatalog(
    booking.occurrence.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const participants: LessonBookingReadModelParticipantProjection[] = [];
  for (const participantId of booking.party.participantIds) {
    const participantSnap = await firestore.collection('participants').doc(participantId).get();
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      return undefined;
    }
    participants.push({
      participantId: participant.participantId,
      displayName: participant.displayName,
    });
  }

  const instructor: LessonBookingReadModelInstructorProjection = {
    instructorId: booking.occurrence.instructorId,
    displayName: instructorCatalog.name,
    ...(instructorCatalog.avatarUrl ? { avatarUrl: instructorCatalog.avatarUrl } : {}),
  };

  const occurrence: LessonBookingReadModelOccurrenceProjection = {
    startsAt: booking.occurrence.interval.startsAt,
    endsAt: booking.occurrence.interval.endsAt,
    timeZone: booking.occurrence.timeZone,
    durationMinutes: durationMinutesFromInterval(
      booking.occurrence.interval.startsAt,
      booking.occurrence.interval.endsAt
    ),
  };

  return {
    bookingId: booking.bookingId,
    revision: booking.revision,
    partyKind: booking.party.kind,
    participantIds: [...booking.party.participantIds],
    participants,
    instructor,
    occurrence,
    lifecycle: buildLifecycleProjection(booking),
    bookingOrigin: booking.attribution.bookingOrigin,
    updatedAt: booking.updatedAt,
  };
}
