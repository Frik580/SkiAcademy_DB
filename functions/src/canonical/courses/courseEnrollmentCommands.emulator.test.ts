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
const participantId = ParticipantIdSchema.parse('participant_course_enrollment_01');
const participantIdB = ParticipantIdSchema.parse('participant_course_enrollment_02');
const managementId = ParticipantManagementIdSchema.parse('management_course_enrollment_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_course_enrollment_02');
const instructorId = InstructorIdSchema.parse('instructor_course_enrollment_01');
const courseId = CourseIdSchema.parse('course_course_enrollment_emulator_01');
const courseDayId = CourseDayIdSchema.parse('course_day_enrollment_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_enrollment_emulator_02');
const bookingId = BookingIdSchema.parse('booking_course_enrollment_emulator_01');
const bookingDayTwoId = BookingIdSchema.parse('booking_course_enrollment_emulator_day_two');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));

const COURSE_PRICE_KZT = 50_000;
const BOOKING_PRICE_KZT = 12_000;
const WALLET_ONE_ENROLLMENT_KZT = COURSE_PRICE_KZT;
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
  correlation = correlationId
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: 'account_owner' as const,
    idempotencyKey,
    correlationId: correlation,
    source: 'client_callable' as const,
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

function seedWallet(balance: number) {
  return WalletSchema.parse({
    accountId,
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

async function seedCourseDayDocument(input: {
  targetCourseId: typeof courseId;
  targetCourseDayId: typeof courseDayId;
  dayOrder: number;
  interval: { startsAt: typeof dayOneStart; endsAt: typeof dayOneEnd };
}) {
  await firestore.doc(`courses/${input.targetCourseId}/days/${input.targetCourseDayId}`).set({
    courseId: input.targetCourseId,
    courseDayId: input.targetCourseDayId,
    dayOrder: input.dayOrder,
    interval: input.interval,
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
  availableSeats: number;
  courseDayCount: 1 | 2;
}) {
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Course Enrollment Emulator Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: input.availableSeats, availableSeats: input.availableSeats },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: input.courseDayCount,
      finalCourseDayEndsAt: input.courseDayCount === 1 ? dayOneEnd : dayTwoEnd,
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

  await seedCourseDayDocument({
    targetCourseId: courseId,
    targetCourseDayId: courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
  });

  if (input.courseDayCount === 2) {
    await seedCourseDayDocument({
      targetCourseId: courseId,
      targetCourseDayId: courseDayTwoId,
      dayOrder: 2,
      interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
    });
  }
}

async function seedBase(walletBalance: number, courseDayCount: 1 | 2 = 1, availableSeats = 8) {
  await firestore.doc(`users/${accountId}`).set(seedAccountRecord(accountId));
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

function enrollmentEnvelope(input: {
  idempotencyKey: string;
  participantIds: readonly [typeof participantId] | readonly [typeof participantId, typeof participantIdB];
  correlation?: typeof correlationId;
}): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: accountContext(input.idempotencyKey, accountId, input.correlation ?? correlationId),
    intent: {
      courseId,
      participantIds: [...input.participantIds],
    },
  };
}

function bookingEnvelope(input: {
  targetBookingId: typeof bookingId;
  idempotencyKey: string;
  localDate: string;
  localTime: string;
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
        durationMinutes: 60,
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

async function durableCounts() {
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
  ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );
  const course = courses.docs.find((doc) => doc.id === courseId)?.data();

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
  };
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
    'serializes last-seat races so exactly one of two participants wins',
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
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.availableSeats).toBe(0);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(WALLET_ENROLLMENT_PLUS_BOOKING_KZT - COURSE_PRICE_KZT);
    },
    30_000
  );

  it(
    'serializes duplicate participant+course enrollment races so exactly one wins',
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
      expect(state.monetaryEvents).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.claims).toBe(2);
    },
    30_000
  );

  it(
    'rejects enrollment on booking conflict then succeeds after cancellation reverses the conflict',
    async () => {
      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingId,
          idempotencyKey: 'enrollment-booking-conflict',
          localDate: '2026-02-01',
          localTime: '10:00',
        })
      );
      expect(bookingResult.status).toBe('success');

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
      expect(finalState.claims).toBe(2);
    },
    30_000
  );

  it(
    'rolls back multi-day enrollment when a later course day conflicts with an existing booking',
    async () => {
      await clearCollections(firestore);
      await seedBase(WALLET_ENROLLMENT_PLUS_BOOKING_KZT, 2);

      const commands = createCommands();
      const bookingResult = await commands.execute(
        bookingEnvelope({
          targetBookingId: bookingDayTwoId,
          idempotencyKey: 'enrollment-multiday-booking',
          localDate: '2026-02-02',
          localTime: '10:00',
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
      expect(
        (await firestore.collection('resource_claims').get()).docs.filter(
          (doc) => doc.data()?.ownerKind === 'course_enrollment'
        ).length
      ).toBe(0);
    },
    30_000
  );

  it(
    'rejects enrollment when wallet funds are insufficient without durable enrollment state',
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
    'prevents concurrent wallet debits from funding two separate enrollments on the same wallet',
    async () => {
      await clearCollections(firestore);
      await seedBase(WALLET_ONE_ENROLLMENT_KZT, 1, 2);

      const commands = createCommands();
      const envelopeA = enrollmentEnvelope({
        idempotencyKey: 'enrollment-wallet-contention-a',
        participantIds: [participantId],
      });
      const envelopeB = enrollmentEnvelope({
        idempotencyKey: 'enrollment-wallet-contention-b',
        participantIds: [participantIdB],
        correlation: correlationIdB,
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
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.enrollmentGuards).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(0);

      const winnerEnrollmentId = state.enrollmentIds[0]!;
      const winnerCommandKey = resolveCommandIdempotencyIdentity(
        resultA?.status === 'success' ? envelopeA : envelopeB
      ).commandKey;
      const expectedEnrollmentId = courseEnrollmentIdFromCommandParticipant({
        commandId: winnerCommandKey,
        participantId: resultA?.status === 'success' ? participantId : participantIdB,
      });
      expect(winnerEnrollmentId).toBe(expectedEnrollmentId);
      expect(state.paymentIds).toEqual([
        paymentIdFromCourseEnrollmentId(expectedEnrollmentId),
      ]);
    },
    30_000
  );

  it(
    'replays the same idempotency key without duplicate enrollment or payment writes',
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
});
