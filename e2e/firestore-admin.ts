import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST } from './emulator-config';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireRoot = createRequire(join(rootDir, 'package.json'));
const requireFunctions = createRequire(join(rootDir, 'functions/package.json'));
const {
  CourseSchema,
  CourseDaySchema,
  CourseCatalogContentSchema,
  ParticipantSchema,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');
const { initializeApp, getApps } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');

export type BookingLifecycleStatus =
  'pending' | 'confirmed' | 'pending_cancellation' | 'cancelled' | 'completed' | 'no_show';

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

export async function seedE2ECourse(input: {
  courseId: string;
  title: string;
  instructorId: string;
  dayOffset: number;
  discipline?: 'ski' | 'snowboard';
}): Promise<void> {
  const firestore = ensureFirestore();
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + input.dayOffset);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const metadata = {
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_e2e_seed_course',
      lastChangedByCommandId: 'command_e2e_seed_course',
      correlationId: 'correlation_e2e_seed_course',
    },
  };
  const courseDayId = `${input.courseId}_day_1`;
  await firestore.doc(`courses/${input.courseId}`).set(
    CourseSchema.parse({
      courseId: input.courseId,
      title: input.title,
      lifecycle: 'active',
      price: 20_000,
      capacity: { totalSeats: 8, availableSeats: 8 },
      instructorRosterIds: [input.instructorId],
      startAt: timestampFromDate(startsAt),
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(endsAt),
        courseScheduleRevision: 1,
      },
      ...metadata,
    })
  );
  await firestore.doc(`courses/${input.courseId}/days/${courseDayId}`).set(
    CourseDaySchema.parse({
      courseId: input.courseId,
      courseDayId,
      dayOrder: 1,
      interval: { startsAt: timestampFromDate(startsAt), endsAt: timestampFromDate(endsAt) },
      timeZone: 'Asia/Almaty',
      actualInstructorIds: [input.instructorId],
      ...metadata,
    })
  );
  await firestore.doc(`course_catalog_content/${input.courseId}`).set(
    CourseCatalogContentSchema.parse({
      courseId: input.courseId,
      ...(input.discipline ? { discipline: input.discipline } : {}),
      duration: '2 hours',
      description: 'Playwright course enrollment fixture.',
      dates: startsAt.toISOString().slice(0, 10),
      bgImageUrl: 'data:image/svg+xml,%3Csvg%20xmlns="http://www.w3.org/2000/svg"/%3E',
    })
  );
}

export async function getParticipantProfile(participantId: string) {
  const document = await ensureFirestore().doc(`participants/${participantId}`).get();
  return document.exists ? ParticipantSchema.parse(document.data()) : null;
}

export async function hasCourseEnrollment(
  courseId: string,
  participantId: string
): Promise<boolean> {
  const snapshot = await ensureFirestore()
    .collection('course_enrollments')
    .where('courseId', '==', courseId)
    .where('participantId', '==', participantId)
    .limit(1)
    .get();
  return snapshot.docs.some((doc) => doc.data().lifecycle?.status === 'confirmed');
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
  return bookings.filter((booking) => BLOCKING_BOOKING_STATUSES.has(booking.lifecycleStatus))
    .length;
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
  discipline: string;
  skillLevel: string;
  age: import('@ski-academy/shared-domain').Participant['age'];
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
    discipline: String(latest.discipline),
    skillLevel: String(latest.skillLevel),
    age: latest.age,
  };
}
