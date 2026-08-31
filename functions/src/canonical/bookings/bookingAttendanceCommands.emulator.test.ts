import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  bookingOccurrenceIdFromScheduleRevision,
  initialBookingOccurrenceIdFromBookingId,
  paymentIdFromBookingId,
  BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS,
  resolveCommandIdempotencyIdentity,
  activityLogIdFromCommandId,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-attendance-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_attendance_emulator_01');
const accountId = AccountIdSchema.parse('account_attendance_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_attendance_emulator_admin');
const participantId = ParticipantIdSchema.parse('participant_attendance_emulator_01');
const participantTwoId = ParticipantIdSchema.parse('participant_attendance_emulator_02');
const participantThreeId = ParticipantIdSchema.parse('participant_attendance_emulator_03');
const managementId = ParticipantManagementIdSchema.parse('management_attendance_emulator_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_attendance_emulator_02');
const managementThreeId = ParticipantManagementIdSchema.parse('management_attendance_emulator_03');
const instructorId = InstructorIdSchema.parse('instructor_attendance_emulator_01');
const bookingId = BookingIdSchema.parse('booking_attendance_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
const initialOccurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const BOOKING_PRICE_KZT = 12_000;
const WALLET_START_KZT = 50_000;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructors',
  'bookings',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'admin_issues',
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-15T10:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-15T10:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function instructorContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor('account_instructor_attendance_emulator'),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
  };
}

function accountContext(
  capability: 'account_owner' | 'administrator',
  actorAccountId: typeof accountId | typeof adminAccountId,
  idempotencyKey: string,
  expectedRevision?: number
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function recordEnvelope(
  idempotencyKey: string,
  attendanceStatus: 'present' | 'absent',
  input: {
    targetParticipantId?: typeof participantId;
    expectedAttendanceRevision?: number;
  } = {}
): CommandEnvelope<'record_booking_attendance'> {
  return {
    kind: 'record_booking_attendance',
    context: {
      ...instructorContext(idempotencyKey),
      ...(input.expectedAttendanceRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(input.expectedAttendanceRevision) }),
    },
    intent: {
      bookingId,
      participantId: input.targetParticipantId ?? participantId,
      attendanceStatus,
    },
  };
}

function adminRecordEnvelope(
  idempotencyKey: string,
  attendanceStatus: 'present' | 'absent',
  input: {
    expectedBookingRevision: number;
    expectedAttendanceRevision?: number;
    reasonExplanation: string;
    targetParticipantId?: typeof participantId;
  }
): CommandEnvelope<'record_booking_attendance'> {
  return {
    kind: 'record_booking_attendance',
    context: accountContext(
      'administrator',
      adminAccountId,
      idempotencyKey,
      input.expectedBookingRevision
    ),
    intent: {
      bookingId,
      participantId: input.targetParticipantId ?? participantId,
      attendanceStatus,
      reasonExplanation: input.reasonExplanation,
      ...(input.expectedAttendanceRevision === undefined
        ? {}
        : {
            expectedAttendanceRevision: AggregateRevisionSchema.parse(
              input.expectedAttendanceRevision
            ),
          }),
    },
  };
}

function resolveEnvelope(idempotencyKey: string): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor('system_actor_resolve_attendance_outcome_01'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent: { subjectKind: 'booking', subjectId: bookingId },
  };
}

function rescheduleEnvelope(
  idempotencyKey: string,
  expectedRevision: number
): CommandEnvelope<'reschedule_booking'> {
  return {
    kind: 'reschedule_booking',
    context: {
      ...accountContext('account_owner', accountId, idempotencyKey, expectedRevision),
      calendarInput: {
        localDate: '2026-01-16',
        localTime: '11:00',
        durationMinutes: 60,
      },
    },
    intent: { bookingId },
  };
}

async function clearCollections(collections: readonly string[]): Promise<void> {
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

function assertNoUndefinedDeep(value: unknown, path = 'root'): void {
  if (value === undefined) {
    throw new Error(`undefined value at ${path}`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedDeep(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefinedDeep(entry, `${path}.${key}`);
  }
}

function paymentFinancialSnapshot(data: Record<string, unknown> | undefined) {
  return {
    price: data?.price,
    paidAmount: data?.paidAmount,
    retainedAmount: data?.retainedAmount,
    settledAmount: data?.settledAmount,
    outstandingAmount: data?.outstandingAmount,
    refundedAmount: data?.refundedAmount,
    paymentStatus: data?.paymentStatus,
    incrementalRequirements: data?.incrementalRequirements,
  };
}

async function seedSharedFixture(walletBalance = WALLET_START_KZT): Promise<void> {
  for (const id of [accountId, adminAccountId]) {
    await firestore.doc(`users/${id}`).set(
      AccountSchema.parse({
        accountId: id,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId,
        },
      })
    );
  }
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: walletBalance,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  const participants = [
    { participantId, managementId, label: 'Emulator Participant 1' },
    { participantId: participantTwoId, managementId: managementTwoId, label: 'Emulator Participant 2' },
    { participantId: participantThreeId, managementId: managementThreeId, label: 'Emulator Participant 3' },
  ] as const;
  for (const entry of participants) {
    await firestore.doc(`participants/${entry.participantId}`).set({
      participantId: entry.participantId,
      displayName: entry.label,
      age: { kind: 'age_years', years: 20 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: entry.managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    });
    await firestore.doc(`participant_management/${entry.managementId}`).set({
      participantManagementId: entry.managementId,
      participantId: entry.participantId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    });
  }
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Emulator Coach',
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await firestore.doc(`users/account_instructor_attendance_emulator`).set(
    AccountSchema.parse({
      accountId: 'account_instructor_attendance_emulator',
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    })
  );
}

async function lessonInterval(): Promise<{
  startsAt: { seconds: number; nanoseconds: number };
  endsAt: { seconds: number; nanoseconds: number };
}> {
  const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
  return booking!.occurrence.interval;
}

function isoFromTimestamp(timestamp: { seconds: number; nanoseconds: number }): string {
  return new Date(canonicalTimestampToEpochMs(timestamp)).toISOString();
}

function isoDuringLesson(interval: {
  startsAt: { seconds: number; nanoseconds: number };
  endsAt: { seconds: number; nanoseconds: number };
}): string {
  const during = addMillisecondsToCanonicalTimestamp(interval.startsAt, 30 * 60 * 1000);
  return isoFromTimestamp(during);
}

function isoAfterEndsAt(interval: {
  endsAt: { seconds: number; nanoseconds: number };
}): string {
  return isoFromTimestamp(addMillisecondsToCanonicalTimestamp(interval.endsAt, 1));
}

function isoAfterAutomationFallback(interval: {
  endsAt: { seconds: number; nanoseconds: number };
}): string {
  const fallbackEnd = addMillisecondsToCanonicalTimestamp(
    interval.endsAt,
    BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS
  );
  return isoFromTimestamp(addMillisecondsToCanonicalTimestamp(fallbackEnd, 1));
}

async function createConfirmedBooking(
  commands: ReturnType<typeof createCommands>,
  participantIds: readonly [
    typeof participantId,
    ...(typeof participantId)[]
  ] = [participantId],
  idempotencySuffix = 'single'
): Promise<void> {
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: `create-attendance-emulator-${idempotencySuffix}`,
      correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: { bookingId, instructorId, participantIds: [...participantIds] },
  });
  expect(result.status).toBe('success');
}

async function freezeServiceParty(commands: ReturnType<typeof createCommands>): Promise<void> {
  await commands.execute({
    kind: 'rollback_unpaid_booking_party_additions',
    context: {
      actor: systemCommandActor('system_actor_rollback_unpaid_party_01'),
      exercisedCapability: 'system',
      idempotencyKey: 'freeze-party',
      correlationId,
      source: 'scheduler',
    },
    intent: { bookingId },
  });
}

async function createFrozenGroupBooking(
  setupCommands: ReturnType<typeof createCommands>
): Promise<void> {
  await createConfirmedBooking(setupCommands, [participantId], 'group-base');
  let revision = 1;
  for (const [index, addedParticipantId] of [participantTwoId, participantThreeId].entries()) {
    const addResult = await setupCommands.execute({
      kind: 'change_booking_party',
      context: accountContext('account_owner', accountId, `group-add-${index + 1}`, revision),
      intent: {
        bookingId,
        participantIdsToAdd: [addedParticipantId],
      },
    });
    expect(addResult.status).toBe('success');
    revision += 1;
  }
  await freezeServiceParty(setupCommands);
  const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
  expect(booking?.occurrence.serviceParty.participantIds).toEqual([
    participantId,
    participantTwoId,
    participantThreeId,
  ]);
}

async function requestPendingCancellation(
  commands: ReturnType<typeof createCommands>
): Promise<void> {
  const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
  const revision = AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1);
  const result = await commands.execute({
    kind: 'request_booking_cancellation',
    context: accountContext('account_owner', accountId, 'pending-attendance-emulator', revision),
    intent: { bookingId },
  });
  expect(result.status).toBe('success');
}

async function attendanceIdFor(
  occurrenceId: string,
  targetParticipantId: typeof participantId
): Promise<string> {
  return attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: targetParticipantId,
  });
}

describe.skipIf(!runsOnFirestoreEmulator)('bookingAttendanceCommands.emulator', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture();
  }, 30_000);

  it('A. instructor attendance write is durable and idempotent', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    const envelope = recordEnvelope('attendance-durable', 'present');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const attendanceId = await attendanceIdFor(booking?.occurrence.occurrenceId, participantId);
    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.id).toBe(attendanceId);
    const activityLogs = await firestore.collection('activity_logs').get();
    expect(activityLogs.size).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('B. serializes concurrent present vs absent to one canonical attendance write', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));

    const [presentResult, absentResult] = await Promise.allSettled([
      commands.execute(recordEnvelope('concurrent-present', 'present')),
      commands.execute(recordEnvelope('concurrent-absent', 'absent')),
    ]);

    const outcomes = [presentResult, absentResult].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);
    expect(outcomes.filter((status) => status === 'error').length).toBe(1);

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    const attendance = attendanceDocs.docs[0]?.data();
    expect(attendance?.revision).toBe(1);
    expect(['present', 'absent']).toContain(attendance?.attendanceStatus);

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    if (attendance?.attendanceStatus === 'present') {
      expect(booking?.lifecycle.status).toBe('completed');
    } else {
      expect(booking?.lifecycle.status).toBe('no_show');
    }

    const loserEnvelope =
      presentResult.status === 'fulfilled' && presentResult.value.status === 'error'
        ? recordEnvelope('concurrent-present', 'present')
        : recordEnvelope('concurrent-absent', 'absent');
    const loserIdentity = resolveCommandIdempotencyIdentity(loserEnvelope);
    const loserIdempotency = await firestore
      .doc(`command_idempotency/${loserIdentity.identityKey}`)
      .get();
    expect(loserIdempotency.exists).toBe(false);
  }, 30_000);

  it('C. no outcome before endsAt', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const interval = await lessonInterval();
    const commands = createCommands(isoDuringLesson(interval));
    await commands.execute(recordEnvelope('early-present', 'present'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('D. individual present -> completed after endsAt', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await commands.execute(recordEnvelope('present-complete', 'present'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('completed');
  }, 30_000);

  it('E. individual absent -> no_show', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await commands.execute(recordEnvelope('absent-noshow', 'absent'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('no_show');
  }, 30_000);

  it('F. missing attendance opens one deterministic issue on resolver replay', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterAutomationFallback(await lessonInterval()));
    const envelope = resolveEnvelope('resolve-missing');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.docs.filter((doc) => doc.data().kind === 'missing_attendance')).toHaveLength(1);
  }, 30_000);

  it('G. family/group any-present completes even when another participant is missing', async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(100_000);
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createFrozenGroupBooking(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await commands.execute(
      recordEnvelope('group-p1-absent', 'absent', { targetParticipantId: participantId })
    );
    await commands.execute(
      recordEnvelope('group-p2-present', 'present', { targetParticipantId: participantTwoId })
    );
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('completed');
    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues).toHaveLength(0);
  }, 30_000);

  it('H. family/group all-absent resolves to no_show without missing_attendance issue', async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(100_000);
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createFrozenGroupBooking(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await commands.execute(
      recordEnvelope('group-all-absent-1', 'absent', { targetParticipantId: participantId })
    );
    await commands.execute(
      recordEnvelope('group-all-absent-2', 'absent', { targetParticipantId: participantTwoId })
    );
    await commands.execute(
      recordEnvelope('group-all-absent-3', 'absent', { targetParticipantId: participantThreeId })
    );
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('no_show');
    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues).toHaveLength(0);
  }, 30_000);

  it('I. family/group absent plus missing evidence stays unresolved with per-participant missing issues', async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(100_000);
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createFrozenGroupBooking(setupCommands);
    const duringCommands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await duringCommands.execute(
      recordEnvelope('group-missing-p1', 'absent', { targetParticipantId: participantId })
    );
    await duringCommands.execute(
      recordEnvelope('group-missing-p2', 'absent', { targetParticipantId: participantTwoId })
    );

    const resolveCommands = createCommands(isoAfterAutomationFallback(await lessonInterval()));
    const partialResolve = resolveEnvelope('resolve-group-partial-missing');
    expect((await resolveCommands.execute(partialResolve)).status).toBe('success');
    expect((await resolveCommands.execute(partialResolve)).status).toBe('success');

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues).toHaveLength(1);
    expect(missingIssues[0]?.data().participantId).toBe(participantThreeId);

    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(100_000);
    const allMissingSetup = createCommands('2026-01-01T00:00:00.000Z');
    await createFrozenGroupBooking(allMissingSetup);
    const allMissingCommands = createCommands(isoAfterAutomationFallback(await lessonInterval()));
    const allMissingResolve = resolveEnvelope('resolve-group-all-missing');
    expect((await allMissingCommands.execute(allMissingResolve)).status).toBe('success');
    const allMissingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(allMissingIssues).toHaveLength(3);
  }, 30_000);

  it('J. rolled-back unpaid participant is ignored for frozen service party outcome', async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(16_000);
    const commands = createCommands('2026-01-14T09:00:01.000Z');
    await createConfirmedBooking(commands, [participantId]);
    await commands.execute({
      kind: 'change_booking_party',
      context: accountContext('administrator', adminAccountId, 'admin-add-unpaid', 1),
      intent: {
        bookingId,
        participantIdsToAdd: [participantTwoId],
        reasonExplanation: 'Late family addition approved',
      },
    });
    const rollbackCommands = createCommands('2026-01-15T09:00:00.000Z');
    await freezeServiceParty(rollbackCommands);

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.occurrence.serviceParty.participantIds).toEqual([participantId]);
    expect(booking?.party.participantIds).toEqual([participantId]);

    const attendanceCommands = createCommands('2026-01-15T10:00:00.000Z');
    await attendanceCommands.execute(recordEnvelope('rollback-party-present', 'present'));
    const after = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(after?.lifecycle.status).toBe('completed');

    const rolledBackAttendanceAttempt = await attendanceCommands.execute(
      recordEnvelope('rollback-party-p2', 'absent', { targetParticipantId: participantTwoId })
    );
    expect(rolledBackAttendanceAttempt.status).toBe('error');
    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.data().subject.participantId).toBe(participantId);
  }, 30_000);

  it('K. present attendance with payment gate violation preserves attendance and opens one conflict issue', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
      ?.balance;
    await firestore.doc(`payments/${paymentId}`).update({
      paidAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      outstandingAmount: BOOKING_PRICE_KZT,
      paymentStatus: 'unpaid',
    });
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    await commands.execute({
      kind: 'enforce_payment_start_gate',
      context: {
        actor: systemCommandActor('system_actor_payment_start_gate_01'),
        exercisedCapability: 'system',
        idempotencyKey: 'gate-open',
        correlationId,
        source: 'scheduler',
      },
      intent: { subjectKind: 'booking', subjectId: bookingId },
    });
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const presentEnvelope = recordEnvelope('present-conflict', 'present');
    expect((await commands.execute(presentEnvelope)).status).toBe('success');
    expect((await commands.execute(presentEnvelope)).status).toBe('success');

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.docs[0]?.data().attendanceStatus).toBe('present');
    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
    const paymentAfter = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    expect(paymentAfter).toEqual(paymentBefore);
    const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
      ?.balance;
    expect(walletAfter).toBe(walletBefore);
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('L. pending_cancellation is not bypassed by attendance or generic resolver', async () => {
    const setupCommands = createCommands('2026-01-14T09:00:01.000Z');
    await createConfirmedBooking(setupCommands);
    await requestPendingCancellation(setupCommands);
    const interval = await lessonInterval();
    await freezeServiceParty(createCommands(isoFromTimestamp(interval.startsAt)));

    const afterLessonCommands = createCommands(isoAfterEndsAt(interval));
    await afterLessonCommands.execute(recordEnvelope('pending-present', 'present'));
    await afterLessonCommands.execute(resolveEnvelope('pending-resolve'));

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('pending_cancellation');
    const terminalOutcomeLogs = (await firestore.collection('activity_logs').get()).docs.filter(
      (doc) =>
        doc.data().effects?.some(
          (effect: { kind?: string; summary?: string }) =>
            effect.kind === 'booking_lifecycle_changed' &&
            /completed|no_show/i.test(effect.summary ?? '')
        )
    );
    expect(terminalOutcomeLogs).toHaveLength(0);
    const pendingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'unresolved_pending_cancellation'
    );
    expect(pendingIssues.some((doc) => doc.data().lifecycle?.status === 'open')).toBe(true);
  }, 30_000);

  it('M. rescheduled occurrence ignores old occurrence attendance evidence', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const interval = await lessonInterval();

    const duringLessonCommands = createCommands(isoDuringLesson(interval));
    await duringLessonCommands.execute(recordEnvelope('old-occurrence-present', 'present'));
    const oldAttendanceId = await attendanceIdFor(initialOccurrenceId, participantId);
    const oldAttendanceBefore = (await firestore.doc(`attendance/${oldAttendanceId}`).get()).data();
    expect(oldAttendanceBefore?.attendanceStatus).toBe('present');

    const requestAt = addMillisecondsToCanonicalTimestamp(
      interval.startsAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const requestIso = isoFromTimestamp(requestAt);
    const rescheduleCommands = createCommands(requestIso);
    const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const revision = AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1);
    expect((await rescheduleCommands.execute(rescheduleEnvelope('rotate-occurrence', revision))).status).toBe(
      'success'
    );

    const bookingAfterReschedule = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const newOccurrenceId = bookingAfterReschedule?.occurrence.occurrenceId;
    expect(newOccurrenceId).not.toBe(initialOccurrenceId);
    expect(newOccurrenceId).toBe(bookingOccurrenceIdFromScheduleRevision(bookingId, 2));

    const newAttendanceId = await attendanceIdFor(newOccurrenceId!, participantId);
    expect(newAttendanceId).not.toBe(oldAttendanceId);

    const newInterval = bookingAfterReschedule!.occurrence.interval;
    const resolveCommands = createCommands(isoAfterAutomationFallback(newInterval));
    expect((await resolveCommands.execute(resolveEnvelope('resolve-new-occurrence'))).status).toBe(
      'success'
    );

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
    const oldAttendanceAfter = (await firestore.doc(`attendance/${oldAttendanceId}`).get()).data();
    expect(oldAttendanceAfter?.attendanceStatus).toBe('present');
    expect((await firestore.doc(`attendance/${newAttendanceId}`).get()).exists).toBe(false);
    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues).toHaveLength(1);
    expect(missingIssues[0]?.data().occurrenceId).toBe(newOccurrenceId);
  }, 30_000);

  it('N. attendance vs outcome resolver race never leaves contradictory durable state', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));

    const [recordResult, resolveResult] = await Promise.allSettled([
      commands.execute(recordEnvelope('race-record-present', 'present')),
      commands.execute(resolveEnvelope('race-resolve-outcome')),
    ]);
    expect([recordResult.status, resolveResult.status].every((status) => status === 'fulfilled')).toBe(
      true
    );

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBeLessThanOrEqual(1);
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const attendanceStatus = attendanceDocs.docs[0]?.data().attendanceStatus;
    if (booking?.lifecycle.status === 'completed') {
      expect(attendanceStatus).toBe('present');
    }
    if (booking?.lifecycle.status === 'no_show') {
      expect(attendanceStatus).not.toBe('present');
    }
    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues.length).toBeLessThanOrEqual(1);
    if (attendanceStatus === 'present') {
      expect(booking?.lifecycle.status).not.toBe('no_show');
    }
  }, 30_000);

  it('O. concurrent resolver attempts do not duplicate attendance, issues, or audit under contention', async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture(100_000);
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createFrozenGroupBooking(setupCommands);
    const interval = await lessonInterval();
    const commands = createCommands(isoAfterEndsAt(interval));
    await commands.execute(
      recordEnvelope('retry-p1-absent', 'absent', { targetParticipantId: participantId })
    );
    await commands.execute(
      recordEnvelope('retry-p2-absent', 'absent', { targetParticipantId: participantTwoId })
    );

    const resolveCommands = createCommands(isoAfterAutomationFallback(interval));
    const [resolveA, resolveB] = await Promise.allSettled([
      resolveCommands.execute(resolveEnvelope('retry-resolve-a')),
      resolveCommands.execute(resolveEnvelope('retry-resolve-b')),
    ]);
    expect([resolveA, resolveB].filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const resolveStatuses = [resolveA, resolveB].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected'
    );
    expect(resolveStatuses.every((status) => status === 'success')).toBe(true);

    const missingIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssues).toHaveLength(1);
    expect(missingIssues[0]?.data().participantId).toBe(participantThreeId);

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(2);
    expect((await resolveCommands.execute(resolveEnvelope('retry-resolve-a'))).status).toBe(
      'success'
    );
    const missingIssuesAfterReplay = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingIssuesAfterReplay).toHaveLength(1);
  }, 30_000);

  it('P. successful attendance path persists without undefined Firestore fields', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    const envelope = recordEnvelope('undefined-boundary', 'present');
    expect((await commands.execute(envelope)).status).toBe('success');

    const attendanceDoc = (await firestore.collection('attendance').get()).docs[0];
    const bookingDoc = await firestore.doc(`bookings/${bookingId}`).get();
    const activityLogDoc = (
      await firestore.collection('activity_logs').get()
    ).docs[0];
    const idempotencyDoc = (
      await firestore.collection('command_idempotency').get()
    ).docs[0];

    expect(() => assertNoUndefinedDeep(attendanceDoc?.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(bookingDoc.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(activityLogDoc?.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(idempotencyDoc?.data())).not.toThrow();
  }, 30_000);

  it('Q. Admin records missing attendance, closes the issue, and audits attendance_correction', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const interval = await lessonInterval();
    const resolveCommands = createCommands(isoAfterAutomationFallback(interval));
    expect((await resolveCommands.execute(resolveEnvelope('admin-missing-open'))).status).toBe(
      'success'
    );
    const missingBefore = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance' && doc.data().lifecycle?.status === 'open'
    );
    expect(missingBefore).toHaveLength(1);

    const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const adminEnvelope = adminRecordEnvelope('admin-missing-record', 'present', {
      expectedBookingRevision: bookingBefore!.revision,
      reasonExplanation: 'Confirmed from signed instructor register',
    });
    const adminCommands = createCommands(isoAfterAutomationFallback(interval));
    expect((await adminCommands.execute(adminEnvelope)).status).toBe('success');
    expect((await adminCommands.execute(adminEnvelope)).status).toBe('success');

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.data().attendanceStatus).toBe('present');
    expect(attendanceDocs.docs[0]?.data().lastChangedBy).toEqual({
      kind: 'administrator',
      accountId: adminAccountId,
    });
    const missingAfter = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'missing_attendance'
    );
    expect(missingAfter).toHaveLength(1);
    expect(missingAfter[0]?.data().lifecycle?.status).toBe('resolved');
    const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(bookingAfter?.lifecycle.status).toBe('completed');
    const identity = resolveCommandIdempotencyIdentity(adminEnvelope);
    const activityLog = (
      await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get()
    ).data();
    expect(activityLog?.reason).toMatchObject({
      reasonCode: 'attendance_correction',
      explanation: 'Confirmed from signed instructor register',
    });
  }, 30_000);

  it('R. Admin completed ↔ no_show is atomic and requires exact revisions', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const instructorCommands = createCommands(isoAfterEndsAt(await lessonInterval()));
    expect(
      (await instructorCommands.execute(recordEnvelope('instructor-present-terminal', 'present')))
        .status
    ).toBe('success');
    const completed = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(completed?.lifecycle.status).toBe('completed');
    const attendanceId = await attendanceIdFor(completed?.occurrence.occurrenceId, participantId);
    const attendanceBefore = (await firestore.doc(`attendance/${attendanceId}`).get()).data();

    const staleBooking = await instructorCommands.execute(
      adminRecordEnvelope('admin-stale-booking-terminal', 'absent', {
        expectedBookingRevision: completed!.revision + 1,
        expectedAttendanceRevision: attendanceBefore!.revision,
        reasonExplanation: 'Verified no-show',
      })
    );
    expect(staleBooking.status).toBe('error');
    if (staleBooking.status === 'error') expect(staleBooking.error.code).toBe('stale_version');

    const instructorBlocked = await instructorCommands.execute(
      recordEnvelope('instructor-terminal-blocked', 'absent', {
        expectedAttendanceRevision: attendanceBefore!.revision,
      })
    );
    expect(instructorBlocked.status).toBe('error');
    if (instructorBlocked.status === 'error') {
      expect(instructorBlocked.error.code).toBe('invalid_transition');
    }

    const correction = adminRecordEnvelope('admin-terminal-noshow', 'absent', {
      expectedBookingRevision: completed!.revision,
      expectedAttendanceRevision: attendanceBefore!.revision,
      reasonExplanation: 'Verified no-show',
    });
    expect((await instructorCommands.execute(correction)).status).toBe('success');
    expect((await instructorCommands.execute(correction)).status).toBe('success');

    const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(bookingAfter?.lifecycle.status).toBe('no_show');
    const attendanceAfter = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
    expect(attendanceAfter?.attendanceStatus).toBe('absent');
    expect(attendanceAfter?.recordedBy).toEqual(attendanceBefore?.recordedBy);
    expect(attendanceAfter?.lastChangedBy).toEqual({
      kind: 'administrator',
      accountId: adminAccountId,
    });
    const identity = resolveCommandIdempotencyIdentity(correction);
    const activityLog = (
      await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get()
    ).data();
    expect(activityLog?.reason).toMatchObject({
      reasonCode: 'attendance_correction',
      explanation: 'Verified no-show',
    });

    const restore = adminRecordEnvelope('admin-terminal-restore', 'present', {
      expectedBookingRevision: bookingAfter!.revision,
      expectedAttendanceRevision: attendanceAfter!.revision,
      reasonExplanation: 'Participant was present after all',
    });
    expect((await instructorCommands.execute(restore)).status).toBe('success');
    expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.lifecycle.status).toBe(
      'completed'
    );
  }, 30_000);

  it('S. Admin vs Admin concurrent correction serializes to one winner', async () => {
    const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
    await createConfirmedBooking(setupCommands);
    await freezeServiceParty(setupCommands);
    const commands = createCommands(isoAfterEndsAt(await lessonInterval()));
    expect((await commands.execute(recordEnvelope('seed-present-race', 'present'))).status).toBe(
      'success'
    );
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const attendanceId = await attendanceIdFor(booking?.occurrence.occurrenceId, participantId);
    const attendance = (await firestore.doc(`attendance/${attendanceId}`).get()).data();

    const [first, second] = await Promise.allSettled([
      commands.execute(
        adminRecordEnvelope('admin-race-a', 'absent', {
          expectedBookingRevision: booking!.revision,
          expectedAttendanceRevision: attendance!.revision,
          reasonExplanation: 'Correction A',
        })
      ),
      commands.execute(
        adminRecordEnvelope('admin-race-b', 'absent', {
          expectedBookingRevision: booking!.revision,
          expectedAttendanceRevision: attendance!.revision,
          reasonExplanation: 'Correction B',
        })
      ),
    ]);
    const outcomes = [first, second].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success')).toHaveLength(1);
    expect(outcomes.filter((status) => status === 'error')).toHaveLength(1);
    const attendanceAfter = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
    expect(attendanceAfter?.attendanceStatus).toBe('absent');
    expect(attendanceAfter?.revision).toBe(attendance!.revision + 1);
    expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.lifecycle.status).toBe(
      'no_show'
    );
  }, 30_000);
});
