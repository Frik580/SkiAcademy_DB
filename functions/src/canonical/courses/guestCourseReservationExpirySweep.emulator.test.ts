import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromCourseEnrollmentId,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  buildGuestCourseReservationExpiryEnvelope,
  sweepExpiredGuestCourseReservations,
} from './guestCourseReservationExpirySweep';

const PROJECT_ID = 'ski-academy-guest-course-expiry-sweep-test';
const correlationId = CorrelationIdSchema.parse('correlation_guest_course_expiry_sweep_01');
const adminAccountId = AccountIdSchema.parse('account_guest_course_expiry_sweep_admin');
const courseId = CourseIdSchema.parse('course_guest_course_expiry_sweep_01');
const courseDayId = CourseDayIdSchema.parse('course_day_guest_course_expiry_sweep_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_course_expiry_sweep_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const courseStartsAt = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const courseEndsAt = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const COURSE_PRICE = 50_000;
const INITIAL_SEATS = 20;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'instructors',
  'courses',
  'course_enrollments',
  'payments',
  'monetary_events',
  'provider_event_receipts',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'admin_issues',
] as const;

let app: App;
let firestore: Firestore;

function createCommands(at: string) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret: 'guest-course-expiry-sweep-secret' }
  );
}

async function clearCollections(): Promise<void> {
  const courses = await firestore.collection('courses').get();
  for (const course of courses.docs) {
    const days = await course.ref.collection('days').get();
    if (!days.empty) {
      const batch = firestore.batch();
      days.docs.forEach((day) => batch.delete(day.ref));
      await batch.commit();
    }
  }
  for (const collection of COLLECTIONS_TO_CLEAR) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function seedBase(): Promise<void> {
  await firestore.doc(`users/${adminAccountId}`).set({
    accountId: adminAccountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Guest Course Expiry Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Guest Course Expiry Sweep',
    price: COURSE_PRICE,
    capacity: { totalSeats: INITIAL_SEATS, availableSeats: INITIAL_SEATS },
    instructorRosterIds: [instructorId],
    startAt: courseStartsAt,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: courseEndsAt,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`courses/${courseId}/days/${courseDayId}`).set({
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: courseStartsAt, endsAt: courseEndsAt },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
}

function enrollmentId(suffix: string): CourseEnrollmentId {
  return CourseEnrollmentIdSchema.parse(`enrollment_guest_course_expiry_${suffix}`);
}

function participantId(suffix: string): ParticipantId {
  return ParticipantIdSchema.parse(`participant_guest_course_expiry_${suffix}`);
}

async function seedGuestParticipant(id: ParticipantId): Promise<void> {
  await firestore.doc(`participants/${id}`).set({
    participantId: id,
    displayName: `Guest ${id}`,
    age: { kind: 'age_years', years: 24 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
}

async function createGuestEnrollment(suffix: string, at: string): Promise<CourseEnrollmentId> {
  const id = enrollmentId(suffix);
  const participant = participantId(suffix);
  await seedGuestParticipant(participant);
  const envelope: CommandEnvelope<'create_course_enrollments'> = {
    kind: 'create_course_enrollments',
    context: {
      actor: guestCommandActor(guestSubjectIdFromCourseEnrollmentId(id)),
      exercisedCapability: 'guest',
      idempotencyKey: `create-guest-course-expiry:${suffix}`,
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-02-01',
        localTime: '09:00',
        durationMinutes: 120,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: `Guest ${suffix}`,
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 24,
      }),
    },
    intent: { courseId, participantIds: [participant], enrollmentIds: [id] },
  };
  const result = await createCommands(at).execute(envelope);
  if (result.status === 'error') {
    throw new Error(`create failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
  }
  return id;
}

async function fundEnrollment(
  id: CourseEnrollmentId,
  amount: number,
  suffix: string,
  at = '2026-01-01T01:00:00.000Z'
): Promise<void> {
  const paymentId = paymentIdFromCourseEnrollmentId(id);
  const envelope: CommandEnvelope<'record_provider_payment_event'> = {
    kind: 'record_provider_payment_event',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: `fund-guest-course-expiry:${suffix}`,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: {
      paymentId: PaymentIdSchema.parse(paymentId),
      amount,
      sourceKind: 'manual_external',
      manualReference: `guest-course-expiry-${suffix}`,
    },
  };
  const result = await createCommands(at).execute(envelope);
  if (result.status === 'error') {
    throw new Error(`fund failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
  }
}

async function reopenAsPending(id: CourseEnrollmentId): Promise<void> {
  const reference = firestore.doc(`course_enrollments/${id}`);
  const snapshot = await reference.get();
  await reference.update({
    lifecycle: {
      status: 'pending',
      reservationExpiresAt: snapshot.data()?.createdAt
        ? timestampFromDate(
            new Date(snapshot.data()!.createdAt.seconds * 1000 + 24 * 60 * 60 * 1_000)
          )
        : timestampFromDate(new Date('2026-01-02T00:00:00.000Z')),
    },
  });
}

async function enrollmentClaims(id: CourseEnrollmentId) {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs
    .filter((document) => document.data().ownerId === id)
    .map((document) => document.data());
}

describe.sequential.runIf(runsOnFirestoreEmulator)(
  'guest course reservation expiry sweep (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    });

    afterAll(async () => {
      if (app) await deleteApp(app);
    });

    beforeEach(async () => {
      await clearCollections();
      await seedBase();
    }, 30_000);

    it('selects only expired pending guests and safely classifies funding and malformed state', async () => {
      const unpaid = await createGuestEnrollment('a_unpaid', '2026-01-01T00:00:00.000Z');
      const partial = await createGuestEnrollment('b_partial', '2026-01-01T00:00:00.000Z');
      await fundEnrollment(partial, 10_000, 'partial');
      const funded = await createGuestEnrollment('c_funded', '2026-01-01T00:00:00.000Z');
      await fundEnrollment(funded, COURSE_PRICE, 'funded');
      await reopenAsPending(funded);
      const future = await createGuestEnrollment('d_future', '2026-01-01T12:00:00.000Z');
      const confirmed = await createGuestEnrollment('e_confirmed', '2026-01-01T00:00:00.000Z');
      await fundEnrollment(confirmed, COURSE_PRICE, 'confirmed');
      const cancelled = await createGuestEnrollment('f_cancelled', '2026-01-01T00:00:00.000Z');
      const cancelledSnapshot = await firestore.doc(`course_enrollments/${cancelled}`).get();
      await createCommands('2026-01-02T00:00:00.000Z').execute(
        buildGuestCourseReservationExpiryEnvelope({
          enrollmentId: cancelled,
          revision: AggregateRevisionSchema.parse(cancelledSnapshot.data()?.revision ?? 1),
        })
      );

      await firestore.doc('course_enrollments/enrollment_guest_course_expiry_non_guest').set({
        enrollmentId: 'enrollment_guest_course_expiry_non_guest',
        attribution: { bookingOrigin: 'account' },
        lifecycle: {
          status: 'pending',
          reservationExpiresAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        },
      });
      const malformedSource = (await firestore.doc(`course_enrollments/${unpaid}`).get()).data()!;
      await firestore.doc('course_enrollments/enrollment_guest_course_expiry_malformed').set({
        ...malformedSource,
        enrollmentId: 'enrollment_guest_course_expiry_wrong_identity',
      });

      const monetaryEventsBefore = (await firestore.collection('monetary_events').get()).size;
      const result = await sweepExpiredGuestCourseReservations(firestore, {
        now: new Date('2026-01-02T00:00:00.000Z'),
      });

      expect(result).toMatchObject({
        scannedCandidates: 4,
        expired: 2,
        fullyFunded: 1,
        invalidIntegrity: 1,
        alreadyTerminal: 0,
        alreadyIneligible: 0,
        stale: 0,
        failed: 0,
        truncated: false,
      });
      expect(
        (await firestore.doc(`course_enrollments/${unpaid}`).get()).data()?.lifecycle
      ).toMatchObject({
        status: 'cancelled',
        reasonCode: 'reservation_expired',
      });
      expect(
        (await firestore.doc(`course_enrollments/${partial}`).get()).data()?.lifecycle.status
      ).toBe('cancelled');
      expect(
        (await firestore.doc(`payments/${paymentIdFromCourseEnrollmentId(unpaid)}`).get()).data()
      ).toMatchObject({
        paidAmount: 0,
        refundedAmount: 0,
        outstandingAmount: COURSE_PRICE,
        paymentStatus: 'unpaid',
      });
      expect(
        (await firestore.doc(`payments/${paymentIdFromCourseEnrollmentId(partial)}`).get()).data()
      ).toMatchObject({
        paidAmount: 10_000,
        refundedAmount: 0,
        outstandingAmount: COURSE_PRICE - 10_000,
      });
      expect(
        (await firestore.doc(`course_enrollments/${funded}`).get()).data()?.lifecycle.status
      ).toBe('pending');
      expect(
        (await firestore.doc(`course_enrollments/${future}`).get()).data()?.lifecycle.status
      ).toBe('pending');
      expect(
        (await firestore.doc(`course_enrollments/${confirmed}`).get()).data()?.lifecycle.status
      ).toBe('confirmed');
      expect(
        (await firestore.doc(`course_enrollments/${cancelled}`).get()).data()?.lifecycle.status
      ).toBe('cancelled');
      expect(
        (
          await firestore.doc('course_enrollments/enrollment_guest_course_expiry_non_guest').get()
        ).data()?.lifecycle.status
      ).toBe('pending');
      expect((await firestore.collection('monetary_events').get()).size).toBe(monetaryEventsBefore);
    }, 30_000);

    it('releases seat and participant-day claims once under concurrent and repeated sweeps', async () => {
      const id = await createGuestEnrollment('concurrent', '2026-01-01T00:00:00.000Z');
      expect(
        (await firestore.doc(`courses/${courseId}`).get()).data()?.capacity.availableSeats
      ).toBe(INITIAL_SEATS - 1);

      const [left, right] = await Promise.all([
        sweepExpiredGuestCourseReservations(firestore, {
          now: new Date('2026-01-02T00:00:00.000Z'),
        }),
        sweepExpiredGuestCourseReservations(firestore, {
          now: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ]);
      expect(left.expired + right.expired).toBeGreaterThanOrEqual(1);
      expect(
        (await firestore.doc(`courses/${courseId}`).get()).data()?.capacity.availableSeats
      ).toBe(INITIAL_SEATS);
      const claims = await enrollmentClaims(id);
      expect(claims.some((claim) => claim.claimKind === 'course_seat_pre_start')).toBe(true);
      expect(claims.some((claim) => claim.claimKind === 'participant_course_day_enrollment')).toBe(
        true
      );
      expect(claims.every((claim) => claim.lifecycle?.status === 'released')).toBe(true);

      const repeat = await sweepExpiredGuestCourseReservations(firestore, {
        now: new Date('2026-01-02T00:01:00.000Z'),
      });
      expect(repeat.scannedCandidates).toBe(0);
      expect(
        (await firestore.doc(`courses/${courseId}`).get()).data()?.capacity.availableSeats
      ).toBe(INITIAL_SEATS);
    }, 30_000);

    it('paginates with a cursor and truncates at maxCandidates', async () => {
      await createGuestEnrollment('page_a', '2026-01-01T00:00:00.000Z');
      await createGuestEnrollment('page_b', '2026-01-01T00:00:00.000Z');
      await createGuestEnrollment('page_c', '2026-01-01T00:00:00.000Z');

      const limited = await sweepExpiredGuestCourseReservations(firestore, {
        now: new Date('2026-01-02T00:00:00.000Z'),
        pageSize: 1,
        maxCandidates: 2,
      });
      expect(limited).toMatchObject({
        scannedCandidates: 2,
        expired: 2,
        pages: 2,
        truncated: true,
      });
      expect(limited.cursor).toBeDefined();

      const remainder = await sweepExpiredGuestCourseReservations(firestore, {
        now: new Date('2026-01-02T00:00:00.000Z'),
        pageSize: 1,
        maxCandidates: 10,
        startAfter: limited.cursor,
      });
      expect(remainder).toMatchObject({
        scannedCandidates: 1,
        expired: 1,
        truncated: false,
      });
      expect(
        (await firestore.collection('course_enrollments').get()).docs.every(
          (document) => document.data().lifecycle.status === 'cancelled'
        )
      ).toBe(true);
    }, 30_000);
  }
);
