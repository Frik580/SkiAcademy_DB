import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  BookingSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantSchema,
  PaymentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  TestSessionSchema,
  WalletSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromAdminWalletPayment,
  paymentIdFromBookingId,
  testCanonicalExecutionScope,
  testCourseIdFromLiveSource,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { cloneLiveCourseIntoTestSession } from './cloneLiveCourseIntoTestSession';
import { seedTestActorWalletForSession } from './seedTestActorWallet';
import {
  resetTestInstructorRatingSummary,
  resetTestParticipantAchievements,
  resetTestParticipantProgress,
} from './resetTestSessionBoundRecords';

const correlationId = CorrelationIdSchema.parse('correlation_t42b3_isolation_01');
const commandId = CommandIdSchema.parse('command_t42b3_isolation_01');
const testSessionId = TestSessionIdSchema.parse('test_session_t42b3_01');
const otherSessionId = TestSessionIdSchema.parse('test_session_t42b3_02');
const testScope = testCanonicalExecutionScope(testSessionId);
const testParentId = AccountIdSchema.parse('account_t42b3_parent');
const liveAdminId = AccountIdSchema.parse('account_t42b3_admin');
const participantId = ParticipantIdSchema.parse('participant_t42b3_child');
const testInstructorId = InstructorIdSchema.parse('instructor_t42b3_test');
const liveInstructorId = InstructorIdSchema.parse('instructor_t42b3_live');
const bookingId = BookingIdSchema.parse('booking_t42b3_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId,
};

function environment(scope = testScope) {
  return { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')), scope };
}

function seedTestSession(status: 'active' | 'provisioning' | 'locked' = 'active', sessionId = testSessionId) {
  return TestSessionSchema.parse({
    testSessionId: sessionId,
    schemaVersion: 1,
    status,
    label: 'T42B-3 fixture',
    createdByAccountId: liveAdminId,
    config: { startingBalanceKzt: 50_000, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function seedTestActor() {
  return TestActorSchema.parse({
    accountId: testParentId,
    participantIds: [participantId],
    kind: 'test_parent',
    allowed: true,
    dataScope: 'test',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function seedAccount(accountId: string, scope?: { dataScope: 'test'; testSessionId: typeof testSessionId }) {
  return AccountSchema.parse({
    accountId,
    ...(scope ?? {}),
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function seedWallet(accountId: string, balance: number, scope?: Record<string, unknown>) {
  return WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    ...scope,
  });
}

function seedBooking(scope: Record<string, unknown> = {}) {
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: liveAdminId },
    },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId: initialBookingOccurrenceIdFromBookingId(bookingId),
      instructorId: testInstructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-01-15T04:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId: testParentId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
    ...scope,
  });
}

function seedPayment(scope: Record<string, unknown> = {}) {
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'booking',
    subjectId: bookingId,
    currency: 'KZT',
    originalPrice: 10_000,
    price: 10_000,
    paidAmount: 0,
    refundedAmount: 0,
    retainedAmount: 0,
    settledAmount: 0,
    writtenOffAmount: 0,
    outstandingAmount: 10_000,
    paymentStatus: 'unpaid',
    incrementalRequirements: [],
    payerAccountId: testParentId,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    ...scope,
  });
}

function adminPayEnvelope(
  idempotencyKey: string
): CommandEnvelope<'pay_service_from_wallet_as_administrator'> {
  return {
    kind: 'pay_service_from_wallet_as_administrator',
    context: {
      actor: accountCommandActor(liveAdminId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
    },
    intent: { subjectKind: 'booking', bookingId },
  };
}

describe('T42B-3 TEST domain isolation', () => {
  it('forbids TEST-context settings, starter credit, and guest commands', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const commands = createProductionCanonicalCommands(environment(), executor);
    const starter = await commands.execute({
      kind: 'grant_starter_credit',
      context: {
        actor: accountCommandActor(testParentId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'idem-t42b3-starter',
        correlationId,
        source: 'client_callable',
      },
      intent: {},
    });
    const settings = await commands.execute({
      kind: 'update_lesson_pricing_settings',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-settings',
        correlationId,
        source: 'admin_callable',
      },
      intent: {
        additionalParticipantSurchargePerHourKzt: 1_000,
        maxParticipantsPerLesson: 3,
        reasonExplanation: 'TEST must not mutate live pricing',
      },
    });
    const provisioning = await commands.execute({
      kind: 'create_participant',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-identity',
        correlationId,
        source: 'admin_callable',
      },
      intent: {
        participantId,
        displayName: 'Test Child',
        age: { kind: 'age_years', years: 10 },
        skillLevel: 'beginner',
        discipline: 'ski',
      },
    });

    expect(starter).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'unsupported' } },
    });
    expect(settings).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'unsupported' } },
    });
    expect(provisioning).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'unsupported' } },
    });
  });

  it('forbids live starter credit for a registered TestActor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId),
      [`test_actors/${testParentId}`]: seedTestActor(),
    });
    const result = await createProductionCanonicalCommands(
      environment({ dataScope: 'live' }),
      executor
    ).execute({
      kind: 'grant_starter_credit',
      context: {
        actor: accountCommandActor(testParentId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'idem-t42b3-live-starter',
        correlationId,
        source: 'client_callable',
      },
      intent: {},
    });

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'unsupported' } },
    });
  });

  it('seeds a TEST wallet from TestSession.startingBalanceKzt and rejects silent session reuse', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`test_sessions/${testSessionId}`]: seedTestSession(),
      [`test_sessions/${otherSessionId}`]: seedTestSession('active', otherSessionId),
      [`test_actors/${testParentId}`]: seedTestActor(),
    });

    const seeded = await seedTestActorWalletForSession({
      executor,
      correlationId,
      testSession: seedTestSession(),
      accountId: testParentId,
      decidedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(seeded.outcome).toBe('created');
    expect(seeded.wallet).toMatchObject({
      balance: 50_000,
      dataScope: 'test',
      testSessionId,
    });

    const again = await seedTestActorWalletForSession({
      executor,
      correlationId,
      testSession: seedTestSession(),
      accountId: testParentId,
      decidedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(again.outcome).toBe('already_seeded');

    const otherScope = testCanonicalExecutionScope(otherSessionId);
    const otherExecutor = createInMemoryCanonicalTransactionExecutor({
      [`test_sessions/${otherSessionId}`]: seedTestSession('active', otherSessionId),
      [`test_actors/${testParentId}`]: seedTestActor(),
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId: otherSessionId,
      }),
      [`users/${testParentId}/wallet/state`]: seedWallet(testParentId, 50_000, {
        dataScope: 'test',
        testSessionId,
      }),
    });
    const payOther = await createProductionCanonicalCommands(
      environment(otherScope),
      otherExecutor
    ).execute({
      kind: 'record_manual_wallet_funding',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-stale-wallet',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 1,
      },
      intent: {
        accountId: testParentId,
        amount: 1_000,
        reasonExplanation: 'Must not reuse session A wallet',
      },
    });
    expect(payOther).toMatchObject({ status: 'error', error: { code: 'cross_scope_forbidden' } });
    expect(
      otherExecutor.snapshot().docs.get(`users/${testParentId}/wallet/state`)?.data
    ).toMatchObject({
      testSessionId,
      balance: 50_000,
    });

    const rebound = await seedTestActorWalletForSession({
      executor: otherExecutor,
      correlationId,
      testSession: seedTestSession('active', otherSessionId),
      accountId: testParentId,
      decidedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(rebound.outcome).toBe('rebound');
    expect(rebound.wallet).toMatchObject({
      balance: 50_000,
      testSessionId: otherSessionId,
    });
  });

  it('lets a live admin debit the TEST payer wallet, never the admin LIVE wallet', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId,
      }),
      [`users/${liveAdminId}`]: seedAccount(liveAdminId),
      [`users/${liveAdminId}/wallet/state`]: seedWallet(liveAdminId, 999_000),
      [`users/${testParentId}/wallet/state`]: seedWallet(testParentId, 50_000, {
        dataScope: 'test',
        testSessionId,
      }),
      [`bookings/${bookingId}`]: seedBooking({ dataScope: 'test', testSessionId }),
      [`payments/${paymentId}`]: seedPayment({ dataScope: 'test', testSessionId }),
    });

    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      adminPayEnvelope('idem-t42b3-admin-pay')
    );

    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${testParentId}/wallet/state`)?.data).toMatchObject({
      balance: 40_000,
      dataScope: 'test',
      testSessionId,
    });
    expect(executor.snapshot().docs.get(`users/${liveAdminId}/wallet/state`)?.data.balance).toBe(
      999_000
    );
    const eventId = monetaryEventIdFromAdminWalletPayment(paymentId);
    expect(executor.snapshot().docs.get(`monetary_events/${eventId}`)?.data).toMatchObject({
      dataScope: 'test',
      testSessionId,
      walletAccountId: testParentId,
    });
  });

  it('forbids LIVE wallet, other-session wallet, and provider capture in TEST', async () => {
    const liveWalletExecutor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId,
      }),
      [`users/${testParentId}/wallet/state`]: seedWallet(testParentId, 50_000),
      [`bookings/${bookingId}`]: seedBooking({ dataScope: 'test', testSessionId }),
      [`payments/${paymentId}`]: seedPayment({ dataScope: 'test', testSessionId }),
    });
    const liveWallet = await createProductionCanonicalCommands(environment(), liveWalletExecutor).execute(
      adminPayEnvelope('idem-t42b3-live-wallet')
    );
    expect(liveWallet).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });

    const provider = await createProductionCanonicalCommands(environment(), liveWalletExecutor).execute({
      kind: 'record_provider_payment_event',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-provider',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 1,
      },
      intent: {
        paymentId,
        amount: 10_000,
        sourceKind: 'provider',
        providerKind: 'stripe',
        providerEventId: 'evt_t42b3_01',
        providerTransactionRef: 'pi_t42b3_01',
      },
    });
    expect(provider).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden', details: { reason: 'unsupported' } },
    });
  });

  it('clones a LIVE course into TEST without mutating the live source', async () => {
    const liveCourse = CourseSchema.parse({
      ...canonicalCourseDeliveryFixtures.course,
      capacity: { totalSeats: 4, availableSeats: 1 },
      instructorRosterIds: [liveInstructorId],
    });
    const liveDay = {
      ...canonicalCourseDeliveryFixtures.courseDays[0]!,
      actualInstructorIds: [liveInstructorId],
    };
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`test_sessions/${testSessionId}`]: seedTestSession(),
      [`courses/${liveCourse.courseId}`]: liveCourse,
      [`courses/${liveCourse.courseId}/days/${liveDay.courseDayId}`]: liveDay,
      [`instructors/${testInstructorId}`]: {
        id: testInstructorId,
        name: 'TEST Instructor',
        isAvailable: true,
        pricePerHourKZT: 12_000,
        dataScope: 'test',
        testSessionId,
      },
    });

    const cloned = await cloneLiveCourseIntoTestSession({
      executor,
      correlationId,
      testSession: seedTestSession(),
      sourceCourseId: liveCourse.courseId,
      testInstructorId,
      decidedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const expectedCourseId = testCourseIdFromLiveSource({
      testSessionId,
      sourceCourseId: liveCourse.courseId,
    });
    expect(cloned.outcome).toBe('created');
    expect(cloned.courseId).toBe(expectedCourseId);
    expect(cloned.courseId).not.toBe(liveCourse.courseId);

    const cloneDoc = executor.snapshot().docs.get(`courses/${cloned.courseId}`)?.data;
    expect(cloneDoc).toMatchObject({
      dataScope: 'test',
      testSessionId,
      sourceCourseId: liveCourse.courseId,
      instructorRosterIds: [testInstructorId],
      capacity: { totalSeats: 4, availableSeats: 4 },
    });
    expect(executor.snapshot().docs.get(`courses/${liveCourse.courseId}`)?.data).toMatchObject({
      capacity: { totalSeats: 4, availableSeats: 1 },
      instructorRosterIds: [liveInstructorId],
    });

    const again = await cloneLiveCourseIntoTestSession({
      executor,
      correlationId,
      testSession: seedTestSession(),
      sourceCourseId: liveCourse.courseId,
      testInstructorId,
      decidedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(again.outcome).toBe('already_cloned');
  });

  it('rejects TEST enrollment against a LIVE course and resets TEST progress/achievements/ratings', async () => {
    const liveCourseId = CourseIdSchema.parse('course_t42b3_live');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`courses/${liveCourseId}`]: { revision: 1, capacity: { totalSeats: 4, availableSeats: 4 } },
      [`participant_progress/${participantId}`]: {
        participantId,
        dataScope: 'test',
        testSessionId,
        level: 2,
        revision: 1,
      },
      [`participant_achievements/${participantId}`]: {
        participantId,
        dataScope: 'test',
        testSessionId,
        earned: { course_graduate: { earnedAt: decidedAt, source: 'course_completion' } },
        revision: 1,
      },
      [`instructor_rating_summaries/${testInstructorId}`]: {
        instructorId: testInstructorId,
        dataScope: 'test',
        testSessionId,
        reviewsCount: 1,
        revision: 1,
      },
    });

    const enrollment = await createProductionCanonicalCommands(environment(), executor).execute({
      kind: 'create_course_enrollments',
      context: {
        actor: accountCommandActor(testParentId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'idem-t42b3-live-course',
        correlationId,
        source: 'client_callable',
      },
      intent: { courseId: liveCourseId, participantIds: [participantId] },
    });
    expect(enrollment).toMatchObject({ status: 'error', error: { code: 'cross_scope_forbidden' } });
    expect(executor.snapshot().docs.get(`courses/${liveCourseId}`)?.data.capacity.availableSeats).toBe(
      4
    );

    await expect(
      resetTestParticipantProgress({
        executor,
        correlationId,
        scope: testScope,
        participantId,
      })
    ).resolves.toBe('deleted');
    await expect(
      resetTestParticipantAchievements({
        executor,
        correlationId,
        scope: testScope,
        participantId,
      })
    ).resolves.toBe('deleted');
    await expect(
      resetTestInstructorRatingSummary({
        executor,
        correlationId,
        scope: testScope,
        instructorId: testInstructorId,
      })
    ).resolves.toBe('deleted');
    expect(executor.snapshot().docs.has(`participant_progress/${participantId}`)).toBe(false);
    expect(executor.snapshot().docs.has(`participant_achievements/${participantId}`)).toBe(false);
    expect(executor.snapshot().docs.has(`instructor_rating_summaries/${testInstructorId}`)).toBe(
      false
    );
  });

  it('forbids TEST payment of a LIVE booking and refunds only the TEST wallet', async () => {
    const liveBookingExecutor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId,
      }),
      [`users/${testParentId}/wallet/state`]: seedWallet(testParentId, 50_000, {
        dataScope: 'test',
        testSessionId,
      }),
      [`bookings/${bookingId}`]: seedBooking(),
      [`payments/${paymentId}`]: seedPayment(),
    });
    const liveSubject = await createProductionCanonicalCommands(
      environment(),
      liveBookingExecutor
    ).execute(adminPayEnvelope('idem-t42b3-live-booking'));
    expect(liveSubject).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });

    const refundExecutor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId,
      }),
      [`users/${testParentId}/wallet/state`]: seedWallet(testParentId, 0, {
        dataScope: 'test',
        testSessionId,
      }),
      [`bookings/${bookingId}`]: seedBooking({ dataScope: 'test', testSessionId }),
      [`payments/${paymentId}`]: seedPayment({
        dataScope: 'test',
        testSessionId,
        paidAmount: 10_000,
        retainedAmount: 10_000,
        settledAmount: 10_000,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      }),
    });
    const refund = await createProductionCanonicalCommands(environment(), refundExecutor).execute({
      kind: 'adjust_service_price',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-refund',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 1,
      },
      intent: {
        paymentId,
        newPrice: 6_000,
        walletAccountId: testParentId,
        reasonExplanation: 'TEST refund must stay on the TEST wallet',
      },
    });
    expect(refund.status).toBe('success');
    expect(refundExecutor.snapshot().docs.get(`users/${testParentId}/wallet/state`)?.data).toMatchObject({
      balance: 4_000,
      dataScope: 'test',
      testSessionId,
    });
    expect(refundExecutor.snapshot().docs.get(`payments/${paymentId}`)?.data).toMatchObject({
      dataScope: 'test',
      testSessionId,
      price: 6_000,
    });
  });

  it('forbids TEST attendance and reviews against LIVE identities', async () => {
    const liveParticipant = ParticipantSchema.parse({
      participantId,
      displayName: 'Live Child',
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit,
    });
    const attendanceExecutor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seedBooking({ dataScope: 'test', testSessionId }),
      [`participants/${participantId}`]: liveParticipant,
    });
    const attendance = await createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-15T06:00:00.000Z')),
        scope: testScope,
      },
      attendanceExecutor
    ).execute({
      kind: 'record_booking_attendance',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-live-participant-attendance',
        correlationId,
        source: 'admin_callable',
      },
      intent: {
        bookingId,
        participantId,
        attendanceStatus: 'present',
        reasonExplanation: 'Admin recorded attendance',
      },
    });
    expect(attendance).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });

    const occurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });
    const reviewExecutor = createInMemoryCanonicalTransactionExecutor({
      [`users/${testParentId}`]: seedAccount(testParentId, {
        dataScope: 'test',
        testSessionId,
      }),
      [`bookings/${bookingId}`]: BookingSchema.parse({
        ...seedBooking({ dataScope: 'test', testSessionId }),
        lifecycle: { status: 'completed', completedAt: decidedAt },
        occurrence: {
          ...seedBooking().occurrence,
          instructorId: liveInstructorId,
        },
      }),
      [`attendance/${attendanceId}`]: {
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId: liveInstructorId },
        recordedAt: decidedAt,
        lastChangedBy: { kind: 'instructor', instructorId: liveInstructorId },
        updatedAt: decidedAt,
        revision: 1,
        correlationId,
        dataScope: 'test',
        testSessionId,
      },
      [`instructors/${liveInstructorId}`]: {
        id: liveInstructorId,
        name: 'LIVE Instructor',
        isAvailable: true,
        pricePerHourKZT: 12_000,
      },
    });
    const review = await createProductionCanonicalCommands(environment(), reviewExecutor).execute({
      kind: 'create_instructor_review',
      context: {
        actor: accountCommandActor(testParentId),
        exercisedCapability: 'parent_guardian',
        idempotencyKey: 'idem-t42b3-live-instructor-review',
        correlationId,
        source: 'client_callable',
      },
      intent: { bookingId, rating: 5 },
    });
    expect(review).toMatchObject({
      status: 'error',
      error: { code: 'cross_scope_forbidden' },
    });
    expect(reviewExecutor.snapshot().docs.has(`instructor_rating_summaries/${liveInstructorId}`)).toBe(
      false
    );
  });
});
