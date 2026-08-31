import {
  BookingIdSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  calculateFullPaidRefundAmount,
  evaluateParticipantManagementAccess,
  evaluateClientCancellationTiming,
  isConfirmedIndividualBooking,
  isLessonBookingHot,
  isPendingCancellationIndividualBooking,
  isRescheduleEligibleBooking,
  normalizeFirestoreDocument,
  ParticipantManagementSchema,
  paymentIdFromBookingId,
  paymentIdMatchesSubject,
  refundableRetainedAmount,
  evaluateLessonBookingAuthorizedActions,
  sanitizeParticipantProfileForInstructor,
  type Account,
  type AccountId,
  type AdminIssue,
  type Booking,
  type InstructorId,
  type LessonBookingAdminProjection,
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
  type ReadModelAdministratorActor,
  compareCanonicalTimestamps,
  decodeLessonBookingReadModelCursor,
  encodeLessonBookingReadModelCursor,
  LESSON_BOOKING_READ_MODEL_PAGE_SIZE_DEFAULT,
  LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX,
  timestampFromDate,
  guestSubjectIdFromBookingId,
  type CanonicalTimestamp,
} from '@ski-academy/shared-domain';
import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { parseAdminIssue } from '../adminIssues';
import { verifyGuestActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { parseBooking, parseInstructorCatalog } from '../bookings/bookingStore';
import { parsePayment } from '../finance/financeStore';
import { parseAccount, parseParticipant } from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { loadActiveParticipantBlocksForPair } from './participantBlockReadSupport';

export interface LessonBookingReadAuthorizationContext {
  readonly account?: Account;
  readonly participantManagement: readonly ParticipantManagement[];
  readonly participants: readonly Participant[];
}

export class InvalidLessonBookingReadCursorError extends Error {
  constructor() {
    super('The lesson Booking cursor is invalid for this query.');
    this.name = 'InvalidLessonBookingReadCursorError';
  }
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
    price: payment.price,
  };
}

function resolveParticipantManagement(
  context: LessonBookingReadAuthorizationContext,
  participantId: Participant['participantId']
): { readonly participant: Participant; readonly management: ParticipantManagement } | undefined {
  const management = context.participantManagement.find(
    (record) => record.participantId === participantId
  );
  const participant = context.participants.find((record) => record.participantId === participantId);
  if (!management || !participant) {
    return undefined;
  }
  return { participant, management };
}

const INSTRUCTOR_LESSON_DENIED_ACTIONS = {
  canRequestCancellation: false,
  canWithdrawCancellation: false,
  canReschedule: false,
};

function safeAdminAccountIdentity(
  accountId: AccountId,
  data: Record<string, unknown> | undefined
): LessonBookingAdminProjection['payer'] {
  const displayName =
    typeof data?.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim().slice(0, 200)
      : accountId;
  return { accountId, displayName };
}

async function loadRelatedBookingAdminIssues(
  firestore: Firestore,
  booking: Booking
): Promise<AdminIssue[]> {
  const snapshot = await firestore
    .collection('admin_issues')
    .where('subjectRef.bookingId', '==', booking.bookingId)
    .limit(50)
    .get();
  const issues = snapshot.docs.map((document) => {
    const issue = parseAdminIssue(document.data() as Record<string, unknown>);
    if (
      !issue ||
      issue.issueId !== document.id ||
      issue.subjectRef.subjectKind !== 'booking' ||
      issue.subjectRef.bookingId !== booking.bookingId
    ) {
      throw new Error(
        `Canonical lesson Booking read integrity failure: admin_issues/${document.id}`
      );
    }
    return issue;
  });
  return issues.sort((left, right) => {
    const compared = compareCanonicalTimestamps(right.updatedAt, left.updatedAt);
    return compared !== 0 ? compared : left.issueId.localeCompare(right.issueId);
  });
}

function buildAdminAuthorizedActions(input: {
  readonly booking: Booking;
  readonly participants: readonly Participant[];
  readonly payment: Payment | undefined;
  readonly administratorAccount: Account | undefined;
  readonly now: CanonicalTimestamp;
}): LessonBookingAdminProjection['authorizedActions'] {
  const accountActive = input.administratorAccount?.lifecycle.status === 'active';
  const participantsActive = input.participants.every(
    (participant) => participant.lifecycle.status === 'active'
  );
  const rescheduleEligible =
    accountActive && participantsActive && isRescheduleEligibleBooking(input.booking);
  const primaryParticipant = input.participants[0];
  const managedServiceChange =
    rescheduleEligible &&
    primaryParticipant?.management.kind === 'managed' &&
    input.payment !== undefined;
  const attendanceLifecycle =
    input.booking.party.kind === 'individual' &&
    (input.booking.lifecycle.status === 'confirmed' ||
      input.booking.lifecycle.status === 'pending_cancellation');
  const servicePartyFrozen = input.booking.occurrence.serviceParty.frozenAt !== undefined;
  const started =
    compareCanonicalTimestamps(input.now, input.booking.occurrence.interval.startsAt) >= 0;
  const ended =
    compareCanonicalTimestamps(input.now, input.booking.occurrence.interval.endsAt) >= 0;

  return {
    canConfirmGuest:
      accountActive &&
      input.booking.party.kind === 'individual' &&
      input.booking.attribution.bookingOrigin === 'guest' &&
      input.booking.lifecycle.status === 'pending' &&
      compareCanonicalTimestamps(input.now, input.booking.lifecycle.reservationExpiresAt) < 0 &&
      compareCanonicalTimestamps(input.now, input.booking.occurrence.interval.startsAt) < 0,
    canDirectCancel:
      accountActive && input.payment !== undefined && isConfirmedIndividualBooking(input.booking),
    canReschedule: rescheduleEligible,
    canChangeInstructor: managedServiceChange,
    canChangeDuration: managedServiceChange,
    canRecordAttendance: accountActive && attendanceLifecycle && servicePartyFrozen && started,
    canResolveCancellation:
      accountActive &&
      input.payment !== undefined &&
      isPendingCancellationIndividualBooking(input.booking),
    canResolveAttendanceOutcome: accountActive && attendanceLifecycle && ended,
    canLinkGuestToAccount: false,
  };
}

export async function buildAdminLessonBookingReadModel(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  booking: Booking,
  options: { readonly now?: CanonicalTimestamp } = {}
): Promise<LessonBookingReadModel | undefined> {
  const now = options.now ?? timestampFromDate(new Date());
  const [instructorSnap, paymentSnap, administratorSnap, relatedIssues, participantSnaps] =
    await Promise.all([
      firestore.collection('instructors').doc(booking.occurrence.instructorId).get(),
      firestore.collection('payments').doc(booking.paymentId).get(),
      firestore.collection('users').doc(actor.accountId).get(),
      loadRelatedBookingAdminIssues(firestore, booking),
      Promise.all(
        booking.party.participantIds.map((participantId) =>
          firestore.collection('participants').doc(participantId).get()
        )
      ),
    ]);

  const instructorCatalog = parseInstructorCatalog(
    booking.occurrence.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructorCatalog) {
    return undefined;
  }

  const participantRecords: Participant[] = [];
  for (let index = 0; index < booking.party.participantIds.length; index += 1) {
    const participantId = booking.party.participantIds[index]!;
    const snapshot = participantSnaps[index]!;
    const participant = parseParticipant(snapshot.data() as Record<string, unknown> | undefined);
    if (!participant || participant.participantId !== participantId) {
      return undefined;
    }
    participantRecords.push(participant);
  }

  const payment = paymentSnap.exists
    ? parsePayment(paymentSnap.data() as Record<string, unknown>)
    : undefined;
  if (
    !payment ||
    booking.paymentId !== paymentIdFromBookingId(booking.bookingId) ||
    payment.paymentId !== booking.paymentId ||
    !paymentIdMatchesSubject(payment, {
        subjectType: 'booking',
        subjectId: booking.bookingId,
      })
  ) {
    throw new Error(
      `Canonical lesson Booking read integrity failure: payments/${booking.paymentId}`
    );
  }
  if (
    booking.payerAccountId !== undefined &&
    payment?.payerAccountId !== undefined &&
    booking.payerAccountId !== payment.payerAccountId
  ) {
    throw new Error(
      `Canonical lesson Booking read integrity failure: bookings/${booking.bookingId}`
    );
  }

  const payerAccountId = booking.payerAccountId ?? payment?.payerAccountId;
  const payerSnap = payerAccountId
    ? await firestore.collection('users').doc(payerAccountId).get()
    : undefined;
  const administratorAccount = parseAccount(
    administratorSnap.data() as Record<string, unknown> | undefined
  );
  const participants = participantRecords.map((participant) => ({
    participantId: participant.participantId,
    displayName: participant.displayName,
  }));
  const occurrence: LessonBookingReadModelOccurrenceProjection = {
    startsAt: booking.occurrence.interval.startsAt,
    endsAt: booking.occurrence.interval.endsAt,
    timeZone: booking.occurrence.timeZone,
    durationMinutes: durationMinutesFromInterval(
      booking.occurrence.interval.startsAt,
      booking.occurrence.interval.endsAt
    ),
  };
  const cancellationRequestAt =
    booking.lifecycle.status === 'pending_cancellation' ? booking.lifecycle.requestedAt : now;
  const cancellationTiming = evaluateClientCancellationTiming({
    requestAt: cancellationRequestAt,
    startAt: booking.occurrence.interval.startsAt,
  });
  const maximumRefund = payment ? refundableRetainedAmount(payment) : KztMinorUnitsSchema.parse(0);
  const suggestedRefund = payment
    ? calculateFullPaidRefundAmount(payment)
    : KztMinorUnitsSchema.parse(0);

  return {
    bookingId: booking.bookingId,
    revision: booking.revision,
    partyKind: booking.party.kind,
    participantIds: [...booking.party.participantIds],
    participants,
    instructor: {
      instructorId: booking.occurrence.instructorId,
      displayName: instructorCatalog.name,
      ...(instructorCatalog.avatarUrl ? { avatarUrl: instructorCatalog.avatarUrl } : {}),
    },
    occurrence,
    lifecycle: buildLifecycleProjection(booking),
    bookingOrigin: booking.attribution.bookingOrigin,
    authorizedActions: INSTRUCTOR_LESSON_DENIED_ACTIONS,
    admin: {
      participants: participantRecords.map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        skillLevel: participant.skillLevel,
        discipline: participant.discipline,
        age: participant.age,
      })),
      attribution: {
        bookingOrigin: booking.attribution.bookingOrigin,
        bookedBy: booking.attribution.bookedBy,
      },
      ...(payerAccountId
        ? {
            payer: safeAdminAccountIdentity(
              payerAccountId,
              payerSnap?.data() as Record<string, unknown> | undefined
            ),
          }
        : {}),
      payment: {
        paymentId: payment.paymentId,
        status: payment.paymentStatus,
        revision: payment.revision,
        currency: payment.currency,
        originalPrice: payment.originalPrice,
        price: payment.price,
        paid: payment.paidAmount,
        refunded: payment.refundedAmount,
        retained: payment.retainedAmount,
        settled: payment.settledAmount,
        writtenOff: payment.writtenOffAmount,
        outstanding: payment.outstandingAmount,
      },
      cancellationFinancial: {
        timing: cancellationTiming,
        maximumRefund,
        suggestedRefund,
      },
      relatedIssues: relatedIssues.map((issue) => ({
        issueId: issue.issueId,
        kind: issue.kind,
        severity: issue.severity,
        lifecycleStatus: issue.lifecycle.status,
        revision: issue.revision,
        blocksOutcome: issue.blocksOutcome,
        blocksDelivery: issue.blocksDelivery,
        updatedAt: issue.updatedAt,
      })),
      scheduleRevision: booking.occurrence.scheduleRevision,
      serviceParticipantIds: [...booking.occurrence.serviceParty.participantIds],
      authorizedActions: buildAdminAuthorizedActions({
        booking,
        participants: participantRecords,
        payment,
        administratorAccount,
        now,
      }),
    },
    updatedAt: booking.updatedAt,
  };
}

export async function buildLessonBookingReadModel(
  firestore: Firestore,
  accountId: AccountId,
  booking: Booking,
  options: {
    readonly authContext?: LessonBookingReadAuthorizationContext;
    readonly now?: CanonicalTimestamp;
  } = {}
): Promise<LessonBookingReadModel | undefined> {
  const authContext =
    options.authContext ?? (await loadLessonBookingReadAuthorizationContext(firestore, accountId));
  const now = options.now ?? timestampFromDate(new Date());

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
  let authorizedActions = INSTRUCTOR_LESSON_DENIED_ACTIONS;

  const primaryParticipantId = booking.party.participantIds[0];
  const resolvedManagement = primaryParticipantId
    ? resolveParticipantManagement(authContext, primaryParticipantId)
    : undefined;

  if (resolvedManagement && authContext.account) {
    const blocks = await loadActiveParticipantBlocksForPair(
      firestore,
      primaryParticipantId!,
      booking.occurrence.instructorId
    );
    const topology = buildParticipantAccessTopology({
      account: authContext.account,
      participant: resolvedManagement.participant,
      management: resolvedManagement.management,
      additionalBlocks: blocks,
    });
    authorizedActions = evaluateLessonBookingAuthorizedActions({
      actor: {
        kind: 'account_manager',
        accountId,
        participantManagementId: resolvedManagement.management.participantManagementId,
        authority: resolvedManagement.management.authority,
      },
      account: authContext.account,
      participant: resolvedManagement.participant,
      management: resolvedManagement.management,
      booking,
      topology,
      now,
    });
  }

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
    authorizedActions,
    paymentPresentation: buildPaymentPresentation(accountId, booking, payment),
    updatedAt: booking.updatedAt,
  };
}

export async function buildInstructorLessonBookingReadModel(
  firestore: Firestore,
  instructorId: InstructorId,
  booking: Booking
): Promise<LessonBookingReadModel | undefined> {
  if (booking.occurrence.instructorId !== instructorId) {
    return undefined;
  }

  const instructorSnap = await firestore.collection('instructors').doc(instructorId).get();
  const instructorCatalog = parseInstructorCatalog(
    instructorId,
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
    const sanitized = sanitizeParticipantProfileForInstructor(participant);
    participants.push({
      participantId: sanitized.participantId,
      displayName: sanitized.displayName,
    });
  }

  const instructor: LessonBookingReadModelInstructorProjection = {
    instructorId,
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
    authorizedActions: INSTRUCTOR_LESSON_DENIED_ACTIONS,
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

function adminListQuery(
  firestore: Firestore,
  cursor: LessonBookingReadModelCursor | undefined
): Query {
  let query: Query = firestore
    .collection('bookings')
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('bookingId', 'asc');
  if (cursor) {
    query = query.startAfter(
      cursor.updatedAtSeconds,
      cursor.updatedAtNanoseconds,
      cursor.bookingId
    );
  }
  return query;
}

function cursorFromBookingDocument(
  document: QueryDocumentSnapshot
): LessonBookingReadModelCursor | undefined {
  const normalized = normalizeFirestoreDocument(document.data() as Record<string, unknown>);
  const updatedAt = CanonicalTimestampSchema.safeParse(normalized?.updatedAt);
  const bookingId = BookingIdSchema.safeParse(normalized?.bookingId ?? document.id);
  if (!updatedAt.success || !bookingId.success) {
    return undefined;
  }
  return {
    updatedAtSeconds: updatedAt.data.seconds,
    updatedAtNanoseconds: updatedAt.data.nanoseconds,
    bookingId: bookingId.data,
  };
}

export async function loadAuthorizedAccountBookings(
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

export async function loadInstructorHotBookings(
  firestore: Firestore,
  instructorId: InstructorId
): Promise<Booking[]> {
  const snapshot = await firestore
    .collection('bookings')
    .where('occurrence.instructorId', '==', instructorId)
    .limit(LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX * 4)
    .get();

  const bookings: Booking[] = [];
  for (const doc of snapshot.docs) {
    const parsed = parseBooking(doc.data() as Record<string, unknown>);
    if (!parsed || parsed.archival?.isDeleted) {
      continue;
    }
    bookings.push(parsed);
  }
  return bookings.sort(compareBookingReadOrder);
}

export async function queryLessonBookingReadModels(
  firestore: Firestore,
  input: QueryLessonBookingReadModelsInput,
  options: {
    readonly accountId?: AccountId;
    readonly instructorId?: InstructorId;
    readonly administratorActor?: ReadModelAdministratorActor;
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
  if (
    input.cursor &&
    (!cursor ||
      (cursor.scope !== undefined && cursor.scope !== input.scope) ||
      ((input.scope === 'admin_hot' || input.scope === 'admin_history') &&
        cursor.scope !== input.scope))
  ) {
    throw new InvalidLessonBookingReadCursorError();
  }

  if (input.scope === 'admin_detail') {
    const actor = options.administratorActor;
    if (!actor) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const bookingSnap = await firestore.collection('bookings').doc(input.bookingId!).get();
    const booking = parseBooking(bookingSnap.data() as Record<string, unknown> | undefined);
    if (!booking || booking.archival?.isDeleted || booking.bookingId !== input.bookingId) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const item = await buildAdminLessonBookingReadModel(firestore, actor, booking, { now });
    return {
      scope: input.scope,
      items: item ? [item] : [],
      hasMore: false,
    };
  }

  if (input.scope === 'admin_hot' || input.scope === 'admin_history') {
    const actor = options.administratorActor;
    if (!actor) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const snapshot = await adminListQuery(firestore, cursor)
      .limit(pageSize + 1)
      .get();
    const scannedDocuments = snapshot.docs.slice(0, pageSize);
    const bookings = scannedDocuments
      .map((document) => parseBooking(document.data() as Record<string, unknown>))
      .filter(
        (booking): booking is Booking =>
          booking !== undefined && booking.archival?.isDeleted !== true
      );
    const filtered = bookings.filter((booking) => {
      const hot = isLessonBookingHot({
        lifecycleStatus: booking.lifecycle.status,
        endsAt: booking.occurrence.interval.endsAt,
        now,
      });
      return input.scope === 'admin_hot' ? hot : !hot;
    });
    const items = (
      await Promise.all(
        filtered.map((booking) =>
          buildAdminLessonBookingReadModel(firestore, actor, booking, { now })
        )
      )
    ).filter((item): item is LessonBookingReadModel => item !== undefined);
    const hasMore = snapshot.docs.length > pageSize;
    const lastDocument = scannedDocuments.at(-1);
    const next = lastDocument ? cursorFromBookingDocument(lastDocument) : undefined;
    if (hasMore && !next) {
      throw new InvalidLessonBookingReadCursorError();
    }
    return {
      scope: input.scope,
      items,
      hasMore,
      ...(hasMore && next
        ? {
            nextCursor: encodeLessonBookingReadModelCursor({
              ...next,
              scope: input.scope,
            }),
          }
        : {}),
    };
  }

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

  if (input.scope === 'instructor_hot') {
    const instructorId = options.instructorId;
    if (!instructorId) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const instructorBookings = await loadInstructorHotBookings(firestore, instructorId);
    const filtered = instructorBookings.filter((booking) =>
      isLessonBookingHot({
        lifecycleStatus: booking.lifecycle.status,
        endsAt: booking.occurrence.interval.endsAt,
        now,
      })
    );

    const afterCursor = cursor
      ? filtered.filter((booking) => isAfterCursor(booking, cursor))
      : filtered;

    const page = afterCursor.slice(0, pageSize);
    const items: LessonBookingReadModel[] = [];
    for (const booking of page) {
      const readModel = await buildInstructorLessonBookingReadModel(
        firestore,
        instructorId,
        booking
      );
      if (readModel) {
        items.push(readModel);
      }
    }

    const hasMore = afterCursor.length > pageSize;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeLessonBookingReadModelCursor({
            scope: input.scope,
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

  const accountId = options.accountId;
  if (!accountId) {
    return { scope: input.scope, items: [], hasMore: false };
  }

  const authorizedBookings = await loadAuthorizedAccountBookings(firestore, accountId);
  const authContext = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
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
    const readModel = await buildLessonBookingReadModel(firestore, accountId, booking, {
      authContext,
      now,
    });
    if (readModel) {
      items.push(readModel);
    }
  }

  const hasMore = afterCursor.length > pageSize;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeLessonBookingReadModelCursor({
          scope: input.scope,
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
    authorizedActions: INSTRUCTOR_LESSON_DENIED_ACTIONS,
    updatedAt: booking.updatedAt,
  };
}
