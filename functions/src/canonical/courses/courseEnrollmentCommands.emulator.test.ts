import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  courseEnrollmentIdFromCommandParticipant,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-course-enrollment-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_enrollment_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_course_enrollment_emulator_02');
const accountId = AccountIdSchema.parse('account_course_enrollment_owner_01');
const adminAccountId = AccountIdSchema.parse('account_course_enrollment_admin_01');
const participantId = ParticipantIdSchema.parse('participant_course_enrollment_01');
const participantIdB = ParticipantIdSchema.parse('participant_course_enrollment_02');
const managementId = ParticipantManagementIdSchema.parse('management_course_enrollment_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_course_enrollment_02');
const instructorId = InstructorIdSchema.parse('instructor_course_enrollment_01');
const courseId = CourseIdSchema.parse('course_course_enrollment_emulator_01');
const courseIdB = CourseIdSchema.parse('course_course_enrollment_emulator_02');
const courseDayId = CourseDayIdSchema.parse('course_day_enrollment_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_enrollment_emulator_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_enrollment_emulator_03');
const courseDayBId = CourseDayIdSchema.parse('course_day_enrollment_emulator_b01');
const bookingId = BookingIdSchema.parse('booking_course_enrollment_emulator_01');
const bookingDayThreeId = BookingIdSchema.parse('booking_course_enrollment_emulator_day_three');
const bookingReverseId = BookingIdSchema.parse('booking_course_enrollment_emulator_reverse');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));
const dayThreeStart = timestampFromDate(new Date('2026-02-03T03:00:00.000Z'));
const dayThreeEnd = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));

const COURSE_PRICE_KZT = 50_000;
const WALLET_RACE_COURSE_PRICE_KZT = 10_000;
const WALLET_RACE_BALANCE_KZT = 15_000;
const BOOKING_PRICE_KZT = 12_000;
const WALLET_ENROLLMENT_PLUS_BOOKING_KZT = COURSE_PRICE_KZT + BOOKING_PRICE_KZT;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructors',
  'courses',
  'course_enrollments',
  'bookings',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function accountContext(
  idempotencyKey: string,
  actorAccountId = accountId,
  correlation = correlationId,
  capability: 'account_owner' | 'parent_guardian' | 'administrator' = 'account_owner'
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId: correlation,
    source:
      capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

async function clearCollections(database: Firestore) {
  const coursesSnap = await database.collection('courses').get();
  for (const courseDoc of coursesSnap.docs) {
    const daysSnap = await courseDoc.ref.collection('days').get();
    if (!daysSnap.empty) {
      const batch = database.batch();
      daysSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  for (const collection of COLLECTIONS_TO_CLEAR) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function seedAccountRecord(targetAccountId: typeof accountId) {
  return AccountSchema.parse({
    accountId: targetAccountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
}

function seedWallet(balance: number, targetAccountId = accountId) {
  return WalletSchema.parse({
    accountId: targetAccountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function seedParticipantRecord(input: {
  participantId: typeof participantId;
  managementId: typeof managementId;
  displaySuffix: string;
}) {
  return {
    participantId: input.participantId,
    displayName: `Enrollment Participant ${input.displaySuffix}`,
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  };
}

function seedManagementRecord(input: {
  managementId: typeof managementId;
  participantId: typeof participantId;
}) {
  return {
    participantManagementId: input.managementId,
    participantId: input.participantId,
    accountId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  };
}

const COURSE_DAY_INTERVALS = {
  1: { startsAt: dayOneStart, endsAt: dayOneEnd },
  2: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
  3: { startsAt: dayThreeStart, endsAt: dayThreeEnd },
} as const;

async function seedCourseDayDocument(input: {
  targetCourseId: typeof courseId;
  targetCourseDayId: typeof courseDayId;
  dayOrder: 1 | 2 | 3;
}) {
  const interval = COURSE_DAY_INTERVALS[input.dayOrder];
  await firestore.doc(`courses/${input.targetCourseId}/days/${input.targetCourseDayId}`).set({
    courseId: input.targetCourseId,
    courseDayId: input.targetCourseDayId,
    dayOrder: input.dayOrder,
    interval,
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
}

async function seedCourseWithSchedule(input: {
  targetCourseId?: typeof courseId;
  price?: number;
  availableSeats: number;
  courseDayCount: 1 | 2 | 3;
  courseDayIds?: readonly [typeof courseDayId, typeof courseDayTwoId?, typeof courseDayThreeId?];
}) {
  const targetCourseId = input.targetCourseId ?? courseId;
  const price = input.price ?? COURSE_PRICE_KZT;
  const dayIds = input.courseDayIds ?? [courseDayId, courseDayTwoId, courseDayThreeId];
  const finalEndsAt =
    input.courseDayCount === 1
      ? dayOneEnd
      : input.courseDayCount === 2
        ? dayTwoEnd
        : dayThreeEnd;

  await firestore.doc(`courses/${targetCourseId}`).set({
    courseId: targetCourseId,
    title: `Course Enrollment Emulator ${targetCourseId}`,
    price,
    capacity: { totalSeats: input.availableSeats, availableSeats: input.availableSeats },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: input.courseDayCount,
      finalCourseDayEndsAt: finalEndsAt,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });

  const dayOrders = (
    input.courseDayCount === 1 ? [1] : input.courseDayCount === 2 ? [1, 2] : [1, 2, 3]
  ) as readonly (1 | 2 | 3)[];
  for (const dayOrder of dayOrders) {
    await seedCourseDayDocument({
      targetCourseId,
      targetCourseDayId: dayIds[dayOrder - 1]!,
      dayOrder,
    });
  }
}

async function seedBase(
  walletBalance: number,
  courseDayCount: 1 | 2 | 3 = 1,
  availableSeats = 8,
  options: { includeAdminAccount?: boolean } = {}
) {
  await firestore.doc(`users/${accountId}`).set(seedAccountRecord(accountId));
  if (options.includeAdminAccount) {
    await firestore.doc(`users/${adminAccountId}`).set(seedAccountRecord(adminAccountId));
  }
  await firestore.doc(`users/${accountId}/wallet/state`).set(seedWallet(walletBalance));
  await firestore.doc(`participants/${participantId}`).set(
    seedParticipantRecord({
      participantId,
      managementId,
      displaySuffix: 'A',
    })
  );
  await firestore.doc(`participants/${participantIdB}`).set(
    seedParticipantRecord({
      participantId: participantIdB,
      managementId: managementIdB,
      displaySuffix: 'B',
    })
  );
  await firestore.doc(`participant_management/${managementId}`).set(
    seedManagementRecord({ managementId, participantId })
  );
  await firestore.doc(`participant_management/${managementIdB}`).set(
    seedManagementRecord({ managementId: managementIdB, participantId: participantIdB })
  );
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: `Instructor ${instructorId}`,
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await seedCourseWithSchedule({ availableSeats, courseDayCount });
}

async function seedWalletRaceCourses() {
  await seedBase(WALLET_RACE_BALANCE_KZT, 1, 8);
  await firestore.doc(`courses/${courseId}`).update({
    price: WALLET_RACE_COURSE_PRICE_KZT,
  });
  await seedCourseWithSchedule({
    targetCourseId: courseIdB,
    price: WALLET_RACE_COURSE_PRICE_KZT,
    availableSeats: 8,
    courseDayCount: 1,
    courseDayIds: [courseDayBId],
  });
}

function enrollmentEnvelope(input: {
  idempotencyKey: string;
  participantIds: readonly [typeof participantId] | readonly [typeof participantId, typeof participantIdB];
  correlation?: typeof correlationId;
  targetCourseId?: typeof courseId;
  capability?: 'account_owner' | 'parent_guardian' | 'administrator';
  actorAccountId?: typeof accountId;
  reasonExplanation?: string;
  expectedRevision?: number;
}): CommandEnvelope<'create_course_enrollments'> {
  const context = accountContext(
    input.idempotencyKey,
    input.actorAccountId ?? accountId,
    input.correlation ?? correlationId,
    input.capability ?? 'account_owner'
  );
  return {
    kind: 'create_course_enrollments',
    context: {
      ...context,
      ...(input.expectedRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision) }),
    },
    intent: {
      courseId: input.targetCourseId ?? courseId,
      participantIds: [...input.participantIds],
      ...(input.reasonExplanation === undefined
        ? {}
        : { reasonExplanation: input.reasonExplanation }),
    },
  };
}

function bookingEnvelope(input: {
  targetBookingId: typeof bookingId;
  idempotencyKey: string;
  localDate: string;
  localTime: string;
  durationMinutes?: number;
  targetParticipantId?: typeof participantId;
}): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey,
      correlationId: CorrelationIdSchema.parse(`correlation_booking_${input.idempotencyKey}`),
      source: 'client_callable',
      calendarInput: {
        localDate: input.localDate,
        localTime: input.localTime,
        durationMinutes: input.durationMinutes ?? 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: input.targetBookingId,
      instructorId,
      participantIds: [input.targetParticipantId ?? participantId],
    },
  };
}

async function durableCounts(targetCourseId = courseId) {
  const [
    enrollments,
    courses,
    payments,
    monetaryEvents,
    activityLogs,
    idempotency,
    claims,
    enrollmentGuards,
    wallet,
    attendance,
  ] = await Promise.all([
    firestore.collection('course_enrollments').get(),
    firestore.collection('courses').get(),
    firestore.collection('payments').get(),
    firestore.collection('monetary_events').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('resource_claims').get(),
    firestore.collection('active_course_enrollment_guards').get(),
    firestore.doc(`users/${accountId}/wallet/state`).get(),
    firestore.collection('attendance').get(),
  ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );
  const course = courses.docs.find((doc) => doc.id === targetCourseId)?.data();

  return {
    enrollments: enrollments.size,
    enrollmentIds: enrollments.docs.map((doc) => doc.id),
    availableSeats: course?.capacity?.availableSeats as number | undefined,
    payments: payments.size,
    paymentIds: payments.docs.map((doc) => doc.id),
    monetaryEvents: monetaryEvents.size,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    enrollmentGuards: enrollmentGuards.size,
    walletBalance: wallet.data()?.balance as number | undefined,
    attendance: attendance.size,
    enrollmentClaims: claims.docs.filter((doc) => doc.data()?.ownerKind === 'course_enrollment')
      .length,
    instructorClaims: claims.docs.filter(
      (doc) => doc.data()?.claimKind === 'instructor_course_day'
    ).length,
    participantClaims: claims.docs.filter((doc) => doc.data()?.resourceKind === 'participant')
      .length,
  };
}

async function listParticipantClaims(targetParticipantId = participantId) {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs
    .filter((doc) => doc.data()?.resourceKind === 'participant')
    .filter((doc) => doc.data()?.resourceId === targetParticipantId)
    .map((doc) => doc.data());
}

describe.sequential.runIf(runsOnFirestoreEmulator)('course enrollment commands emulator', () => {
  beforeAll(() => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await clearCollections(firestore);
    await seedBase(WALLET_ENROLLMENT_PLUS_BOOKING_KZT);
  });

  it(
    'A. commits a successful single enrollment with full durable atomicity',
    async () => {
      const commands = createCommands();
      const instructorClaimsBefore = (await durableCounts()).instructorClaims;
      const envelope = enrollmentEnvelope({
        idempotencyKey: 'enrollment-success-atomic',
        participantIds: [participantId],
      });
      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');

      const identity = resolveCommandIdempotencyIdentity(envelope);
      const enrollmentId = courseEnrollmentIdFromCommandParticipant({
        commandId: identity.commandKey,
        participantId,
      });
      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.availableSeats).toBe(7);
      expect(state.claims).toBe(2);
      expect(state.payments).toBe(1);
      expect(state.paymentIds[0]).toBe(paymentIdFromCourseEnrollmentId(enrollmentId));
      expect(state.monetaryEvents).toBe(1);
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.walletBalance).toBe(WALLET_ENROLLMENT_PLUS_BOOKING_KZT - COURSE_PRICE_KZT);
      expect(state.attendance).toBe(0);
      expect(state.instructorClaims).toBe(instructorClaimsBefore);
      expect(
        (await listParticipantClaims()).filter(
          (claim) => claim?.claimKind === 'participant_course_day_enrollment'
        ).length
      ).toBe(1);
    },
    30_000
  );

  it(
    'B. serializes last-seat races so exactly one of two participants wins',
    async () => {
      await clearCollections(firestore);
      await seedBase(WALLET_ENROLLMENT_PLUS_BOOKING_KZT, 1, 1);

      const commands = createCommands();
      const attempts = await Promise.all([
        commands.execute(
          enrollmentEnvelope({
            idempotencyKey: 'enrollment-capacity-race-a',
            participantIds: [participantId],
          })
        ),
        commands.execute(
          enrollmentEnvelope({
            idempotencyKey: 'enrollment-capacity-race-b',
            participantIds: [participantIdB],
            correlation: correlationIdB,
          })
        ),
      ]);

      const successes = attempts.filter((attempt) => attempt.status === 'success');
      const unavailable = attempts.filter(
        (attempt) => attempt.status === 'error' && attempt.error.code === 'unavailable'
      );
      expect(successes).toHaveLength(1);
      expect(unavailable).toHaveLength(1);

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.availableSeats).toBe(0);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.claims).toBe(2);
    },
    30_000
  );

  it(
    'C. serializes duplicate participant+course enrollment races so exactly one wins',
    async () => {
      const commands = createCommands();
      const attempts = await Promise.all([
        commands.execute(
          enrollmentEnvelope({
            idempotencyKey: 'enrollment-duplicate-race-a',
            participantIds: [participantId],
          })
        ),
        commands.execute(
          enrollmentEnvelope({
            idempotencyKey: 'enrollment-duplicate-race-b',
            participantIds: [participantId],
            correlation: correlationIdB,
          })
        ),
      ]);

      const successes = attempts.filter((attempt) => attempt.status === 'success');
      const duplicate = attempts.filter(
        (attempt) =>
          attempt.status === 'error' && attempt.error.code === 'duplicate_active_enrollment'
      );
      expect(successes).toHaveLength(1);
      expect(duplicate).toHaveLength(1);

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.walletBalance).toBe(WALLET_ENROLLMENT_PLUS_BOOKING_KZT - COURSE_PRICE_KZT);
      expect(state.enrollmentGuards).toBe(1);
    },
    30_000
  );

  it(
    'D. rejects enrollment on overlapping booking conflict then succeeds after cancellation',
    async () => {
      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingId,
          idempotencyKey: 'enrollment-booking-conflict',
          localDate: '2026-02-01',
          localTime: '09:00',
        })
      );
      expect(bookingResult.status).toBe('success');

      const participantClaims = await listParticipantClaims();
      expect(
        participantClaims.filter((claim) => claim?.claimKind === 'participant_booking_occurrence')
          .length
      ).toBe(1);

      const blocked = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-booking-blocked',
          participantIds: [participantId],
        })
      );
      expect(blocked.status).toBe('error');
      if (blocked.status === 'error') {
        expect(blocked.error.code).toBe('participant_conflict');
      }

      const blockedState = await durableCounts();
      expect(blockedState.enrollments).toBe(0);
      expect(blockedState.enrollmentGuards).toBe(0);
      expect(blockedState.enrollmentClaims).toBe(0);
      expect(blockedState.payments).toBe(1);
      expect(blockedState.availableSeats).toBe(8);

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const cancelResult = await commands.execute({
        kind: 'request_booking_cancellation',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'enrollment-booking-cancel',
          correlationId: CorrelationIdSchema.parse('correlation_course_enrollment_cancel'),
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1),
          calendarInput: {
            localDate: '2026-02-01',
            localTime: '09:00',
            durationMinutes: 120,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId },
      });
      expect(cancelResult.status).toBe('success');

      const enrolled = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-after-cancel',
          participantIds: [participantId],
        })
      );
      expect(enrolled.status).toBe('success');

      const finalState = await durableCounts();
      expect(finalState.enrollments).toBe(1);
      expect(finalState.payments).toBe(2);
      expect(finalState.availableSeats).toBe(7);
      expect(finalState.enrollmentGuards).toBe(1);
    },
    30_000
  );

  it(
    'E. blocks overlapping booking creation after a successful course enrollment',
    async () => {
      const commands = createCommands();
      const enrolled = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-reverse-block',
          participantIds: [participantId],
        })
      );
      expect(enrolled.status).toBe('success');

      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingReverseId,
          idempotencyKey: 'enrollment-reverse-booking',
          localDate: '2026-02-01',
          localTime: '09:00',
        })
      );
      expect(bookingResult.status).toBe('error');
      if (bookingResult.status === 'error') {
        expect(bookingResult.error.code).toBe('participant_conflict');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect((await firestore.collection('bookings').get()).size).toBe(0);
    },
    30_000
  );

  it(
    'F. rolls back multi-day enrollment when a later course day conflicts with an existing booking',
    async () => {
      await clearCollections(firestore);
      await seedBase(WALLET_ENROLLMENT_PLUS_BOOKING_KZT, 3);

      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingDayThreeId,
          idempotencyKey: 'enrollment-multiday-booking',
          localDate: '2026-02-03',
          localTime: '09:00',
        })
      );
      expect(bookingResult.status).toBe('success');

      const blocked = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-multiday-blocked',
          participantIds: [participantId],
        })
      );
      expect(blocked.status).toBe('error');
      if (blocked.status === 'error') {
        expect(blocked.error.code).toBe('participant_conflict');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.enrollmentGuards).toBe(0);
      expect(state.availableSeats).toBe(8);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.enrollmentClaims).toBe(0);
      expect(state.walletBalance).toBe(WALLET_ENROLLMENT_PLUS_BOOKING_KZT - BOOKING_PRICE_KZT);
      expect(
        (await listParticipantClaims()).filter(
          (claim) => claim?.claimKind === 'participant_course_day_enrollment'
        ).length
      ).toBe(0);
    },
    30_000
  );

  it(
    'G. allows half-open adjacent booking and course day intervals for the same participant',
    async () => {
      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingId,
          idempotencyKey: 'enrollment-adjacent-booking',
          localDate: '2026-02-01',
          localTime: '07:00',
        })
      );
      expect(bookingResult.status).toBe('success');

      const enrolled = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-adjacent-success',
          participantIds: [participantId],
        })
      );
      expect(enrolled.status).toBe('success');

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(2);
      expect(state.claims).toBe(4);
    },
    30_000
  );

  it(
    'H. rejects enrollment when wallet funds are insufficient without durable enrollment state',
    async () => {
      await clearCollections(firestore);
      await seedBase(1_000);

      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-insufficient-wallet',
          participantIds: [participantId],
        })
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('insufficient_funds');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.payments).toBe(0);
      expect(state.monetaryEvents).toBe(0);
      expect(state.enrollmentGuards).toBe(0);
      expect(state.claims).toBe(0);
      expect(state.availableSeats).toBe(8);
      expect(state.walletBalance).toBe(1_000);
    },
    30_000
  );

  it(
    'I. prevents concurrent wallet debits from funding two separate enrollments on the same wallet',
    async () => {
      await clearCollections(firestore);
      await seedWalletRaceCourses();

      const commands = createCommands();
      const envelopeA = enrollmentEnvelope({
        idempotencyKey: 'enrollment-wallet-contention-a',
        participantIds: [participantId],
        targetCourseId: courseId,
      });
      const envelopeB = enrollmentEnvelope({
        idempotencyKey: 'enrollment-wallet-contention-b',
        participantIds: [participantIdB],
        correlation: correlationIdB,
        targetCourseId: courseIdB,
      });

      const settled = await Promise.allSettled([
        commands.execute(envelopeA),
        commands.execute(envelopeB),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const resultA = settled[0]?.status === 'fulfilled' ? settled[0].value : undefined;
      const resultB = settled[1]?.status === 'fulfilled' ? settled[1].value : undefined;
      const successes = [resultA, resultB].filter((result) => result?.status === 'success');
      const insufficient = [resultA, resultB].filter(
        (result) => result?.status === 'error' && result.error.code === 'insufficient_funds'
      );

      expect(successes).toHaveLength(1);
      expect(insufficient).toHaveLength(1);

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(
        WALLET_RACE_BALANCE_KZT - WALLET_RACE_COURSE_PRICE_KZT
      );
    },
    30_000
  );

  it(
    'J. replays the same idempotency key without duplicate enrollment or payment writes',
    async () => {
      const commands = createCommands();
      const envelope = enrollmentEnvelope({
        idempotencyKey: 'enrollment-replay-emulator',
        participantIds: [participantId],
      });
      const first = await commands.execute(envelope);
      const second = await commands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const identity = resolveCommandIdempotencyIdentity(envelope);
      const enrollmentId = courseEnrollmentIdFromCommandParticipant({
        commandId: identity.commandKey,
        participantId,
      });
      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.paymentIds[0]).toBe(paymentIdFromCourseEnrollmentId(enrollmentId));
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(true);
    },
    30_000
  );

  it(
    'K. rejects enrollment when expected course revision is stale',
    async () => {
      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-stale-revision',
          participantIds: [participantId],
          expectedRevision: 99,
        })
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('stale_version');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.payments).toBe(0);
      expect(state.availableSeats).toBe(8);
    },
    30_000
  );

  it(
    'M. commits enrollment without undefined-field write failures when optional fields are absent',
    async () => {
      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-serialization-boundary',
          participantIds: [participantId],
        })
      );
      expect(result.status).toBe('success');

      const identity = resolveCommandIdempotencyIdentity(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-serialization-boundary',
          participantIds: [participantId],
        })
      );
      const enrollmentId = courseEnrollmentIdFromCommandParticipant({
        commandId: identity.commandKey,
        participantId,
      });
      const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
      expect(enrollment).toBeDefined();
      for (const value of Object.values(enrollment ?? {})) {
        expect(value).not.toBeUndefined();
      }
    },
    30_000
  );

  it(
    'N. commits all children atomically when multi-child enrollment is fully valid and funded',
    async () => {
      await clearCollections(firestore);
      await seedBase(COURSE_PRICE_KZT * 2, 1, 8);

      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-multi-child-success',
          participantIds: [participantId, participantIdB],
        })
      );
      expect(result.status).toBe('success');

      const state = await durableCounts();
      expect(state.enrollments).toBe(2);
      expect(state.payments).toBe(2);
      expect(state.monetaryEvents).toBe(2);
      expect(state.enrollmentGuards).toBe(2);
      expect(state.availableSeats).toBe(6);
      expect(state.walletBalance).toBe(0);
    },
    30_000
  );

  it(
    'O. rejects multi-child enrollment when one child has a participant conflict',
    async () => {
      await clearCollections(firestore);
      await seedBase(COURSE_PRICE_KZT * 2 + BOOKING_PRICE_KZT, 1, 8);

      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingId,
          idempotencyKey: 'enrollment-multi-child-booking',
          localDate: '2026-02-01',
          localTime: '09:00',
          targetParticipantId: participantIdB,
        })
      );
      expect(bookingResult.status).toBe('success');

      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-multi-child-conflict',
          participantIds: [participantId, participantIdB],
        })
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('participant_conflict');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.enrollmentGuards).toBe(0);
      expect(state.payments).toBe(1);
      expect(state.availableSeats).toBe(8);
    },
    30_000
  );

  it(
    'P. rejects multi-child enrollment when wallet can fund only a subset',
    async () => {
      await clearCollections(firestore);
      await seedBase(COURSE_PRICE_KZT + 1_000, 1, 8);

      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-multi-child-wallet',
          participantIds: [participantId, participantIdB],
        })
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('insufficient_funds');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.payments).toBe(0);
      expect(state.availableSeats).toBe(8);
      expect(state.walletBalance).toBe(COURSE_PRICE_KZT + 1_000);
    },
    30_000
  );

  it(
    'Q. rejects multi-child enrollment when capacity cannot fit the whole batch',
    async () => {
      await clearCollections(firestore);
      await seedBase(COURSE_PRICE_KZT * 2, 1, 1);

      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-multi-child-capacity',
          participantIds: [participantId, participantIdB],
        })
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('unavailable');
      }

      const state = await durableCounts();
      expect(state.enrollments).toBe(0);
      expect(state.payments).toBe(0);
      expect(state.availableSeats).toBe(1);
    },
    30_000
  );

  it(
    'R. allows administrator underfunded enrollment with explicit reason and no negative wallet',
    async () => {
      await clearCollections(firestore);
      await seedBase(20_000, 1, 8, { includeAdminAccount: true });

      const commands = createCommands();
      const result = await commands.execute(
        enrollmentEnvelope({
          idempotencyKey: 'enrollment-admin-underfunded',
          participantIds: [participantId],
          capability: 'administrator',
          actorAccountId: adminAccountId,
          reasonExplanation: 'Approved partial payment for trusted family',
        })
      );
      expect(result.status).toBe('success');

      const state = await durableCounts();
      expect(state.enrollments).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.walletBalance).toBe(0);
      const payment = (await firestore.collection('payments').get()).docs[0]?.data();
      expect(payment?.outstandingAmount).toBeGreaterThan(0);
    },
    30_000
  );
});
