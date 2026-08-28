import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireFunctions = createRequire(join(rootDir, 'functions/package.json'));
const { initializeApp, getApps } = requireFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore') as typeof import('firebase-admin/firestore');

export type BookingLifecycleStatus =
  | 'pending'
  | 'confirmed'
  | 'pending_cancellation'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface E2EBookingRecord {
  readonly bookingId: string;
  readonly payerAccountId?: string;
  readonly lifecycleStatus: BookingLifecycleStatus;
  readonly participantIds: readonly string[];
  readonly instructorId: string;
  readonly revision: number;
  readonly createdAtSeconds: number;
}

export interface E2EResourceClaimRecord {
  readonly claimId: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly lifecycleStatus: 'active' | 'released' | 'frozen';
}

const BLOCKING_BOOKING_STATUSES = new Set<BookingLifecycleStatus>([
  'pending',
  'confirmed',
  'pending_cancellation',
]);

function ensureFirestore() {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST ?? FIRESTORE_EMULATOR_HOST;

  if (getApps().length === 0) {
    initializeApp({ projectId: E2E_PROJECT_ID });
  }

  return getFirestore();
}

function mapBookingRecord(data: Record<string, unknown>): E2EBookingRecord {
  const createdAtSeconds = Number(
    (data.createdAt as { seconds?: number } | undefined)?.seconds ?? 0
  );
  return {
    bookingId: String(data.bookingId),
    payerAccountId: typeof data.payerAccountId === 'string' ? data.payerAccountId : undefined,
    lifecycleStatus: data.lifecycle?.status as BookingLifecycleStatus,
    participantIds: Array.isArray(data.party?.participantIds)
      ? data.party.participantIds.map(String)
      : [],
    instructorId: String(data.occurrence?.instructorId ?? ''),
    revision: Number(data.revision ?? 0),
    createdAtSeconds,
  };
}

export async function listBookingsForInstructor(instructorId: string): Promise<E2EBookingRecord[]> {
  const firestore = ensureFirestore();
  const snapshot = await firestore
    .collection('bookings')
    .where('occurrence.instructorId', '==', instructorId)
    .get();

  return snapshot.docs.map((doc) => mapBookingRecord(doc.data()));
}

export async function countBlockingBookingsForInstructor(instructorId: string): Promise<number> {
  const bookings = await listBookingsForInstructor(instructorId);
  return bookings.filter((booking) => BLOCKING_BOOKING_STATUSES.has(booking.lifecycleStatus)).length;
}

export async function listBlockingBookingsForPayer(
  payerAccountId: string
): Promise<E2EBookingRecord[]> {
  const firestore = ensureFirestore();
  const snapshot = await firestore
    .collection('bookings')
    .where('payerAccountId', '==', payerAccountId)
    .get();

  return snapshot.docs
    .map((doc) => mapBookingRecord(doc.data()))
    .filter((booking) => BLOCKING_BOOKING_STATUSES.has(booking.lifecycleStatus))
    .sort((left, right) => right.createdAtSeconds - left.createdAtSeconds);
}

export async function getLatestBlockingBookingForPayer(
  payerAccountId: string
): Promise<E2EBookingRecord | null> {
  const blocking = await listBlockingBookingsForPayer(payerAccountId);
  return blocking[0] ?? null;
}

export async function getBlockingBookingIdsForPayer(payerAccountId: string): Promise<Set<string>> {
  const blocking = await listBlockingBookingsForPayer(payerAccountId);
  return new Set(blocking.map((booking) => booking.bookingId));
}

export async function getBookingById(bookingId: string): Promise<E2EBookingRecord | null> {
  const firestore = ensureFirestore();
  const snapshot = await firestore.doc(`bookings/${bookingId}`).get();
  if (!snapshot.exists) {
    return null;
  }
  return mapBookingRecord(snapshot.data() ?? {});
}

export async function listResourceClaimsForBooking(
  bookingId: string
): Promise<E2EResourceClaimRecord[]> {
  const firestore = ensureFirestore();
  const snapshot = await firestore
    .collection('resource_claims')
    .where('ownerKind', '==', 'booking')
    .where('ownerId', '==', bookingId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      claimId: String(data.claimId ?? doc.id),
      resourceKind: String(data.resourceKind ?? ''),
      resourceId: String(data.resourceId ?? ''),
      lifecycleStatus: data.lifecycle?.status as E2EResourceClaimRecord['lifecycleStatus'],
    };
  });
}

export async function countActiveInstructorClaims(instructorId: string): Promise<number> {
  const firestore = ensureFirestore();
  const snapshot = await firestore
    .collection('resource_claims')
    .where('resourceKind', '==', 'instructor')
    .where('resourceId', '==', instructorId)
    .get();

  return snapshot.docs.filter((doc) => doc.data().lifecycle?.status === 'active').length;
}

export async function countGuestBookings(): Promise<number> {
  const firestore = ensureFirestore();
  const snapshot = await firestore.collection('bookings').get();
  return snapshot.docs.filter((doc) => doc.data().lifecycle?.status === 'pending').length;
}

export async function getBookingSlotContext(bookingId: string): Promise<{
  localDate: string;
  localTime: string;
  timezone: string;
  durationMinutes: number;
} | null> {
  const firestore = ensureFirestore();
  const snapshot = await firestore.doc(`bookings/${bookingId}`).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const occurrence = data.occurrence as
    | {
        timeZone?: string;
        interval?: {
          startsAt?: { seconds?: number; nanoseconds?: number };
          endsAt?: { seconds?: number; nanoseconds?: number };
        };
      }
    | undefined;
  const startsAt = occurrence?.interval?.startsAt;
  const endsAt = occurrence?.interval?.endsAt;
  if (!startsAt || !endsAt) {
    return null;
  }

  const timezone = String(occurrence?.timeZone ?? 'Asia/Almaty');
  const startDate = new Date(startsAt.seconds! * 1000 + startsAt.nanoseconds! / 1_000_000);
  const endDate = new Date(endsAt.seconds! * 1000 + endsAt.nanoseconds! / 1_000_000);
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    localDate: dateFormatter.format(startDate),
    localTime: timeFormatter.format(startDate),
    timezone,
    durationMinutes: Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
  };
}

export async function getLatestGuestParticipant(): Promise<{
  participantId: string;
  managementKind: string;
} | null> {
  const firestore = ensureFirestore();
  const snapshot = await firestore.collection('participants').get();
  const guestParticipants = snapshot.docs
    .map((doc) => doc.data())
    .filter((data) => data.management?.kind === 'unmanaged_guest')
    .sort((left, right) => {
      const leftUpdated = Number(left.updatedAt?.seconds ?? 0);
      const rightUpdated = Number(right.updatedAt?.seconds ?? 0);
      return rightUpdated - leftUpdated;
    });

  const latest = guestParticipants[0];
  if (!latest) {
    return null;
  }

  return {
    participantId: String(latest.participantId),
    managementKind: String(latest.management?.kind ?? ''),
  };
}
