import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_DEFAULT,
  ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX,
  AdminGuestFundsDiscoveryFilterSchema,
  AdminGuestFundsReadModelSchema,
  compareCanonicalTimestamps,
  unmanagedGuestParticipantIds,
  type AdminGuestFundsDiscoveryFilter,
  type AdminGuestFundsDiscoveryRow,
  type AdminGuestFundsReadModel,
  type Booking,
  type CourseEnrollment,
  type Participant,
  type Payment,
  type QueryAdminFinanceReadModelsInput,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parsePayment } from '../finance/financeStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { parseCourse } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';

const GUEST_FUNDS_SCAN_MULTIPLIER = 8;

export class InvalidAdminGuestFundsReadCursorError extends Error {
  constructor() {
    super('The Admin guest funds cursor is invalid for this query.');
    this.name = 'InvalidAdminGuestFundsReadCursorError';
  }
}

interface GuestFundsStreamCursor {
  readonly updatedAtSeconds: number;
  readonly updatedAtNanoseconds: number;
  readonly id: string;
}

interface AdminGuestFundsCursor {
  readonly scope: 'admin_guest_funds';
  readonly filter: AdminGuestFundsDiscoveryFilter;
  readonly bookingExhausted?: boolean;
  readonly enrollmentExhausted?: boolean;
  readonly booking?: GuestFundsStreamCursor;
  readonly enrollment?: GuestFundsStreamCursor;
}

type GuestFundsCandidate =
  | {
      readonly kind: 'booking';
      readonly booking: Booking;
      readonly updatedAt: Booking['updatedAt'];
      readonly id: string;
    }
  | {
      readonly kind: 'enrollment';
      readonly enrollment: CourseEnrollment;
      readonly updatedAt: CourseEnrollment['updatedAt'];
      readonly id: string;
    };

function encodeGuestFundsCursor(cursor: AdminGuestFundsCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeGuestFundsCursor(encoded: string): AdminGuestFundsCursor | undefined {
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (value.scope !== 'admin_guest_funds') return undefined;
    const filterParsed = AdminGuestFundsDiscoveryFilterSchema.safeParse(value.filter);
    if (!filterParsed.success) return undefined;
    const booking = parseStreamCursor(value.booking);
    const enrollment = parseStreamCursor(value.enrollment);
    if (value.booking !== undefined && booking === undefined) return undefined;
    if (value.enrollment !== undefined && enrollment === undefined) return undefined;
    if (value.bookingExhausted !== undefined && typeof value.bookingExhausted !== 'boolean') {
      return undefined;
    }
    if (
      value.enrollmentExhausted !== undefined &&
      typeof value.enrollmentExhausted !== 'boolean'
    ) {
      return undefined;
    }
    return {
      scope: 'admin_guest_funds',
      filter: filterParsed.data,
      ...(value.bookingExhausted === true ? { bookingExhausted: true } : {}),
      ...(value.enrollmentExhausted === true ? { enrollmentExhausted: true } : {}),
      ...(booking ? { booking } : {}),
      ...(enrollment ? { enrollment } : {}),
    };
  } catch {
    return undefined;
  }
}

function parseStreamCursor(value: unknown): GuestFundsStreamCursor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.updatedAtSeconds !== 'number' ||
    !Number.isInteger(record.updatedAtSeconds) ||
    typeof record.updatedAtNanoseconds !== 'number' ||
    !Number.isInteger(record.updatedAtNanoseconds) ||
    typeof record.id !== 'string' ||
    !record.id.trim()
  ) {
    return undefined;
  }
  return {
    updatedAtSeconds: record.updatedAtSeconds,
    updatedAtNanoseconds: record.updatedAtNanoseconds,
    id: record.id,
  };
}

function compareCandidates(left: GuestFundsCandidate, right: GuestFundsCandidate): number {
  const compared = compareCanonicalTimestamps(right.updatedAt, left.updatedAt);
  if (compared !== 0) return compared;
  return left.id.localeCompare(right.id);
}

function guestOriginBookingQuery(
  firestore: Firestore,
  cursor: GuestFundsStreamCursor | undefined
): Query {
  let query: Query = firestore
    .collection('bookings')
    .where('attribution.bookingOrigin', '==', 'guest')
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('bookingId', 'asc');
  if (cursor) {
    query = query.startAfter(cursor.updatedAtSeconds, cursor.updatedAtNanoseconds, cursor.id);
  }
  return query;
}

function guestOriginEnrollmentQuery(
  firestore: Firestore,
  cursor: GuestFundsStreamCursor | undefined
): Query {
  let query: Query = firestore
    .collection('course_enrollments')
    .where('attribution.bookingOrigin', '==', 'guest')
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('enrollmentId', 'asc');
  if (cursor) {
    query = query.startAfter(cursor.updatedAtSeconds, cursor.updatedAtNanoseconds, cursor.id);
  }
  return query;
}

function streamCursorFromCandidate(candidate: GuestFundsCandidate): GuestFundsStreamCursor {
  return {
    updatedAtSeconds: candidate.updatedAt.seconds,
    updatedAtNanoseconds: candidate.updatedAt.nanoseconds,
    id: candidate.id,
  };
}

function matchesDiscoveryFilter(
  row: AdminGuestFundsDiscoveryRow,
  filter: AdminGuestFundsDiscoveryFilter
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'linked':
      return row.linkState === 'linked';
    case 'unlinked':
      return row.linkState === 'unlinked';
    case 'outstanding':
      return (row.outstandingAmount ?? 0) > 0;
    case 'unpaid':
      return row.paymentStatus === 'unpaid';
    case 'partially_paid':
      return row.paymentStatus === 'partially_paid';
    case 'paid':
      return row.paymentStatus === 'paid';
    case 'refunded':
      return row.paymentStatus === 'refunded';
    case 'partially_refunded':
      return row.paymentStatus === 'partially_refunded';
  }
}

function safeDisplayName(
  data: Record<string, unknown> | undefined,
  fallback?: string
): string | undefined {
  if (typeof data?.displayName === 'string' && data.displayName.trim()) {
    return data.displayName.trim().slice(0, 200);
  }
  if (fallback && fallback.trim()) return fallback.trim().slice(0, 200);
  return undefined;
}

function paymentFields(payment: Payment | undefined): Pick<
  AdminGuestFundsDiscoveryRow,
  | 'paymentId'
  | 'paymentStatus'
  | 'currency'
  | 'price'
  | 'paidAmount'
  | 'outstandingAmount'
  | 'refundedAmount'
  | 'retainedAmount'
  | 'writtenOffAmount'
> {
  if (!payment) return {};
  return {
    paymentId: payment.paymentId,
    paymentStatus: payment.paymentStatus,
    currency: payment.currency,
    price: payment.price,
    paidAmount: payment.paidAmount,
    outstandingAmount: payment.outstandingAmount,
    ...(payment.refundedAmount > 0 ? { refundedAmount: payment.refundedAmount } : {}),
    ...(payment.retainedAmount > 0 ? { retainedAmount: payment.retainedAmount } : {}),
    ...(payment.writtenOffAmount > 0 ? { writtenOffAmount: payment.writtenOffAmount } : {}),
  };
}

async function loadParticipants(
  firestore: Firestore,
  participantIds: readonly string[]
): Promise<Participant[]> {
  const loaded = await Promise.all(
    participantIds.map(async (participantId) => {
      const snap = await firestore.collection('participants').doc(participantId).get();
      return parseParticipant(snap.data() as Record<string, unknown> | undefined);
    })
  );
  return loaded.filter((participant): participant is Participant => participant !== undefined);
}

async function loadPayment(
  firestore: Firestore,
  paymentId: string
): Promise<Payment | undefined> {
  const snap = await firestore.collection('payments').doc(paymentId).get();
  return parsePayment(snap.data() as Record<string, unknown> | undefined);
}

async function buildBookingRow(
  firestore: Firestore,
  booking: Booking
): Promise<AdminGuestFundsDiscoveryRow | undefined> {
  if (booking.attribution.bookingOrigin !== 'guest' || booking.archival?.isDeleted) {
    return undefined;
  }
  const participants = await loadParticipants(firestore, booking.party.participantIds);
  if (participants.length !== booking.party.participantIds.length) {
    // Missing identity docs are not authority for "linked".
    return undefined;
  }
  const unmanaged = unmanagedGuestParticipantIds({
    partyParticipantIds: booking.party.participantIds,
    participants,
  });
  const linkState = unmanaged.length === 0 ? 'linked' : 'unlinked';
  const payment = await loadPayment(firestore, booking.paymentId);
  const payerAccountId = booking.payerAccountId ?? payment?.payerAccountId;
  const payerSnap = payerAccountId
    ? await firestore.collection('users').doc(payerAccountId).get()
    : undefined;
  const primary =
    participants.find((participant) =>
      booking.party.participantIds.includes(participant.participantId)
    ) ?? participants[0];
  const guestDisplayName =
    primary?.displayName?.trim() ? primary.displayName.trim().slice(0, 200) : undefined;

  return {
    rowId: `booking:${booking.bookingId}`,
    origin: 'guest',
    linkState,
    ...(guestDisplayName ? { guestDisplayName } : {}),
    ...(payerAccountId
      ? {
          payer: {
            accountId: payerAccountId,
            displayName:
              safeDisplayName(
                payerSnap?.data() as Record<string, unknown> | undefined,
                payerAccountId
              ) ?? payerAccountId,
            ...(() => {
              const email = (payerSnap?.data() as Record<string, unknown> | undefined)?.email;
              return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? { email: email.slice(0, 320) }
                : {};
            })(),
          },
        }
      : {}),
    ...paymentFields(payment),
    service: {
      subjectKind: 'booking',
      bookingId: booking.bookingId,
      startsAt: booking.occurrence.interval.startsAt,
      timeZone: booking.occurrence.timeZone,
    },
    updatedAt: booking.updatedAt,
  };
}

async function buildEnrollmentRow(
  firestore: Firestore,
  enrollment: CourseEnrollment
): Promise<AdminGuestFundsDiscoveryRow | undefined> {
  if (enrollment.attribution.bookingOrigin !== 'guest') return undefined;
  const linkState = enrollment.guestAccountLink ? 'linked' : 'unlinked';
  const [participantSnap, courseSnap, payment] = await Promise.all([
    firestore.collection('participants').doc(enrollment.participantId).get(),
    firestore.collection('courses').doc(enrollment.courseId).get(),
    loadPayment(firestore, enrollment.paymentId),
  ]);
  const participant = parseParticipant(
    participantSnap.data() as Record<string, unknown> | undefined
  );
  const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
  const guestDisplayName =
    participant?.displayName?.trim()
      ? participant.displayName.trim().slice(0, 200)
      : undefined;
  const courseTitle =
    typeof course?.title === 'string' && course.title.trim()
      ? course.title.trim().slice(0, 200)
      : undefined;
  const payerAccountId = enrollment.payerAccountId ?? payment?.payerAccountId;
  const payerSnap = payerAccountId
    ? await firestore.collection('users').doc(payerAccountId).get()
    : undefined;

  return {
    rowId: `course_enrollment:${enrollment.enrollmentId}`,
    origin: 'guest',
    linkState,
    ...(guestDisplayName ? { guestDisplayName } : {}),
    ...(payerAccountId
      ? {
          payer: {
            accountId: payerAccountId,
            displayName:
              safeDisplayName(
                payerSnap?.data() as Record<string, unknown> | undefined,
                payerAccountId
              ) ?? payerAccountId,
            ...(() => {
              const email = (payerSnap?.data() as Record<string, unknown> | undefined)?.email;
              return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? { email: email.slice(0, 320) }
                : {};
            })(),
          },
        }
      : {}),
    ...paymentFields(payment),
    service: {
      subjectKind: 'course_enrollment',
      enrollmentId: enrollment.enrollmentId,
      courseId: enrollment.courseId,
      ...(courseTitle ? { courseTitle } : {}),
    },
    updatedAt: enrollment.updatedAt,
  };
}

async function buildRow(
  firestore: Firestore,
  candidate: GuestFundsCandidate
): Promise<AdminGuestFundsDiscoveryRow | undefined> {
  return candidate.kind === 'booking'
    ? buildBookingRow(firestore, candidate.booking)
    : buildEnrollmentRow(firestore, candidate.enrollment);
}

export async function queryAdminGuestFundsReadModel(
  firestore: Firestore,
  input: Extract<QueryAdminFinanceReadModelsInput, { scope: 'admin_guest_funds' }>
): Promise<AdminGuestFundsReadModel> {
  const filter = input.filter ?? 'all';
  const pageSize = Math.min(
    input.pageSize ?? ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_DEFAULT,
    ADMIN_FINANCE_READ_MODEL_PAGE_SIZE_MAX
  );
  const cursor = input.cursor ? decodeGuestFundsCursor(input.cursor) : undefined;
  if (input.cursor && (!cursor || cursor.filter !== filter)) {
    throw new InvalidAdminGuestFundsReadCursorError();
  }

  let bookingExhausted = cursor?.bookingExhausted === true;
  let enrollmentExhausted = cursor?.enrollmentExhausted === true;
  let bookingCursor = cursor?.booking;
  let enrollmentCursor = cursor?.enrollment;

  const items: AdminGuestFundsDiscoveryRow[] = [];
  let scanned = 0;
  const scanBudget = pageSize * GUEST_FUNDS_SCAN_MULTIPLIER;
  const maxScanPasses = filter === 'all' ? 1 : 6;
  let scanPass = 0;

  while (
    items.length < pageSize &&
    scanPass < maxScanPasses &&
    !(bookingExhausted && enrollmentExhausted)
  ) {
    scanPass += 1;
    const passScanLimit = scanned + scanBudget;
    while (
      items.length < pageSize &&
      scanned < passScanLimit &&
      !(bookingExhausted && enrollmentExhausted)
    ) {
    const remaining = Math.max(pageSize - items.length, 1);
    const fetchLimit = remaining + 1;

    const [bookingSnap, enrollmentSnap] = await Promise.all([
      bookingExhausted
        ? Promise.resolve({ docs: [] as const })
        : guestOriginBookingQuery(firestore, bookingCursor).limit(fetchLimit).get(),
      enrollmentExhausted
        ? Promise.resolve({ docs: [] as const })
        : guestOriginEnrollmentQuery(firestore, enrollmentCursor).limit(fetchLimit).get(),
    ]);

    const bookingCandidates: GuestFundsCandidate[] = bookingSnap.docs.flatMap((document) => {
      const booking = parseBooking(document.data() as Record<string, unknown>);
      if (!booking || booking.bookingId !== document.id) return [];
      return [
        {
          kind: 'booking' as const,
          booking,
          updatedAt: booking.updatedAt,
          id: booking.bookingId,
        },
      ];
    });
    const enrollmentCandidates: GuestFundsCandidate[] = enrollmentSnap.docs.flatMap((document) => {
      const enrollment = parseCourseEnrollment(document.data() as Record<string, unknown>);
      if (!enrollment || enrollment.enrollmentId !== document.id) return [];
      return [
        {
          kind: 'enrollment' as const,
          enrollment,
          updatedAt: enrollment.updatedAt,
          id: enrollment.enrollmentId,
        },
      ];
    });

    if (bookingCandidates.length === 0) bookingExhausted = true;
    if (enrollmentCandidates.length === 0) enrollmentExhausted = true;
    if (bookingCandidates.length === 0 && enrollmentCandidates.length === 0) break;

    const bookingHasMore = !bookingExhausted && bookingSnap.docs.length >= fetchLimit;
    const enrollmentHasMore =
      !enrollmentExhausted && enrollmentSnap.docs.length >= fetchLimit;

    const merged = [...bookingCandidates, ...enrollmentCandidates].sort(compareCandidates);
    if (merged.length === 0) break;

    let consumedBookingCount = 0;
    let consumedEnrollmentCount = 0;
    let progressed = false;
    for (const candidate of merged) {
      if (items.length >= pageSize || scanned >= passScanLimit) break;
      scanned += 1;
      progressed = true;
      if (candidate.kind === 'booking') {
        bookingCursor = streamCursorFromCandidate(candidate);
        consumedBookingCount += 1;
      } else {
        enrollmentCursor = streamCursorFromCandidate(candidate);
        consumedEnrollmentCount += 1;
      }
      const row = await buildRow(firestore, candidate);
      if (!row) continue;
      if (!matchesDiscoveryFilter(row, filter)) continue;
      items.push(row);
    }

    if (!bookingHasMore && consumedBookingCount >= bookingCandidates.length) {
      bookingExhausted = true;
    }
    if (!enrollmentHasMore && consumedEnrollmentCount >= enrollmentCandidates.length) {
      enrollmentExhausted = true;
    }
    if (!progressed) break;
    }
  }

  const hasMore = !bookingExhausted || !enrollmentExhausted;

  const result: AdminGuestFundsReadModel = {
    filter,
    items,
    hasMore,
    ...(hasMore
      ? {
          nextCursor: encodeGuestFundsCursor({
            scope: 'admin_guest_funds',
            filter,
            ...(bookingExhausted ? { bookingExhausted: true } : {}),
            ...(enrollmentExhausted ? { enrollmentExhausted: true } : {}),
            ...(bookingCursor ? { booking: bookingCursor } : {}),
            ...(enrollmentCursor ? { enrollment: enrollmentCursor } : {}),
          }),
        }
      : {}),
  };
  return AdminGuestFundsReadModelSchema.parse(result);
}
