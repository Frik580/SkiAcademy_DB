import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestActorSchema,
  TestSessionMaintenanceError,
  TestSessionPolicyError,
  TEST_SESSION_DELETE_CONFIRMATION,
  TEST_SESSION_RESET_CONFIRMATION,
  testCourseIdFromLiveSource,
  timestampFromDate,
  type TestSessionId,
  type TestSessionLifecycleResult,
} from '@ski-academy/shared-domain';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  createFirestoreCanonicalExecutionScopeStore,
  resolveCanonicalExecutionScope,
} from './canonicalExecutionScopeResolver';
import {
  executeTestSessionLifecycle,
  type TestSessionLifecyclePorts,
} from './testSessionLifecycleEngine';
import type { TestSessionStorageObjectStore } from './deleteTestSessionStorage';

const PROJECT_ID = 'ski-academy-t42b7-lifecycle-emulator';
const runsOnFirestoreEmulator = Boolean(process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST);
const at = timestampFromDate(new Date('2026-09-22T00:00:00.000Z'));
const audit = {
  createdByCommandId: 'command_t42b7_seed',
  lastChangedByCommandId: 'command_t42b7_seed',
  correlationId: 'correlation_t42b7_seed',
};
const adminId = AccountIdSchema.parse('account_t42b7_admin');
const parentId = AccountIdSchema.parse('account_t42b7_parent');
const instructorAccountId = AccountIdSchema.parse('account_t42b7_instructor');
const liveWalletId = AccountIdSchema.parse('account_t42b7_live_wallet');
const participantId = ParticipantIdSchema.parse('participant_t42b7_child');
const instructorId = InstructorIdSchema.parse('instructor_t42b7');
const liveInstructorId = InstructorIdSchema.parse('instructor_t42b7_live');
const courseId = CourseIdSchema.parse('course_t42b7_live');
const courseDayId = 'courseday_t42b7_1';
const STARTING_BALANCE = 25_000;

let app: App;
let firestore: Firestore;
let now = new Date('2026-09-22T00:00:00.000Z');
let files: Map<string, 'ok' | 'fail'>;

function storage(): TestSessionStorageObjectStore {
  return {
    async list(prefix) {
      return [...files.keys()].filter((path) => path.startsWith(prefix));
    },
    async delete(objectPath) {
      const state = files.get(objectPath);
      if (!state) return 'absent';
      if (state === 'fail') throw new Error('DELETE_FAILED');
      files.delete(objectPath);
      return 'deleted';
    },
  };
}

function ports(extra?: TestSessionLifecyclePorts['extraCandidates']): TestSessionLifecyclePorts {
  return {
    firestore,
    now: () => now,
    storage: storage(),
    executor: createFirestoreCanonicalTransactionExecutor(firestore),
    ...(extra ? { extraCandidates: extra } : {}),
  };
}

async function clearAll(): Promise<void> {
  const collections = await firestore.listCollections();
  for (const collection of collections) {
    await firestore.recursiveDelete(collection);
  }
}

async function seedWorld(): Promise<void> {
  const actorBase = {
    allowed: true,
    dataScope: 'test' as const,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit,
  };
  await firestore.doc(`users/${adminId}`).set({
    accountId: adminId,
    role: 'admin',
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit,
    dataScope: 'live',
  });
  await firestore.doc(`users/${parentId}`).set({ dataScope: 'test', accountId: parentId });
  await firestore.doc(`users/${instructorAccountId}`).set({ dataScope: 'test', accountId: instructorAccountId });
  await firestore.doc(`users/${liveWalletId}/wallet/state`).set({
    accountId: liveWalletId,
    balance: 888_000,
    dataScope: 'live',
  });
  await firestore.doc(`participants/${participantId}`).set({
    participantId,
    dataScope: 'test',
    displayName: 'Synthetic child',
  });
  await firestore.doc(`test_actors/${parentId}`).set(
    TestActorSchema.parse({
      ...actorBase,
      accountId: parentId,
      participantIds: [participantId],
      kind: 'test_parent',
    })
  );
  await firestore.doc(`test_actors/${instructorAccountId}`).set(
    TestActorSchema.parse({
      ...actorBase,
      accountId: instructorAccountId,
      participantIds: [ParticipantIdSchema.parse('participant_t42b7_instructor')],
      instructorId,
      kind: 'test_instructor',
    })
  );
  await firestore.doc('participants/participant_t42b7_instructor').set({
    participantId: 'participant_t42b7_instructor',
    dataScope: 'test',
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Synthetic Test Instructor',
    pricePerHourKZT: 12_000,
    dataScope: 'test',
  });
  await firestore.doc(`instructors/${liveInstructorId}`).set({
    id: liveInstructorId,
    name: 'Live Instructor',
    pricePerHourKZT: 12_000,
    dataScope: 'live',
  });
  const course = CourseSchema.parse({
    courseId,
    title: 'Live Source',
    lifecycle: 'active',
    price: 10_000,
    capacity: { totalSeats: 4, availableSeats: 4 },
    instructorRosterIds: [instructorId],
    startAt: at,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-10-01T05:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    revision: 2,
    createdAt: at,
    updatedAt: at,
    audit,
    dataScope: 'live',
  });
  await firestore.doc(`courses/${courseId}`).set(course);
  await firestore.doc(`courses/${courseId}/days/${courseDayId}`).set(
    CourseDaySchema.parse({
      courseId,
      courseDayId,
      dayOrder: 1,
      interval: {
        startsAt: at,
        endsAt: timestampFromDate(new Date('2026-10-01T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      actualInstructorIds: [instructorId],
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    })
  );
  await firestore.doc(`instructor_rating_summaries/${liveInstructorId}`).set({
    instructorId: liveInstructorId,
    dataScope: 'live',
    revision: 4,
    average: 5,
  });
  await firestore.doc('participant_progress/participant_live').set({
    participantId: 'participant_live',
    dataScope: 'live',
    revision: 3,
  });
}

function createInput(idempotencyKey: string) {
  return {
    command: 'create_test_session' as const,
    idempotencyKey,
    label: 'Synthetic session',
    startingBalanceKzt: STARTING_BALANCE,
    actorAccountIds: [parentId],
    testInstructorAccountId: instructorAccountId,
    sourceCourseIds: [courseId],
  };
}

async function createSession(idempotencyKey: string): Promise<TestSessionLifecycleResult> {
  return executeTestSessionLifecycle(ports(), adminId, createInput(idempotencyKey));
}

describe.skipIf(!runsOnFirestoreEmulator)('T42B-7 TestSession lifecycle emulator', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().find((item) => item.name === 't42b7') ?? initializeApp({ projectId: PROJECT_ID }, 't42b7');
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    now = new Date('2026-09-22T00:00:00.000Z');
    files = new Map();
    await clearAll();
    await seedWorld();
  });

  it('gives the v1 slot to exactly one of two concurrent creates', async () => {
    const results = await Promise.allSettled([
      createSession('idem_t42b7_race_a'),
      createSession('idem_t42b7_race_b'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'TEST_SESSION_ACTIVE_LIMIT' });
    const sessions = await firestore.collection('test_sessions').get();
    expect(sessions.size).toBe(1);
    expect(sessions.docs[0]?.get('status')).toBe('active');
  });

  it('resumes provisioning for the same idempotency key', async () => {
    const first = await createSession('idem_t42b7_same');
    const second = await createSession('idem_t42b7_same');
    expect(second.testSessionId).toBe(first.testSessionId);
    expect(second.outcome).toBe('already_completed');
    expect((await firestore.collection('test_sessions').get()).size).toBe(1);
  });

  it('resets wallet, courses, learning state, and reviews without touching LIVE', async () => {
    const created = await createSession('idem_t42b7_reset');
    const sessionId = created.testSessionId as TestSessionId;
    const cloneId = testCourseIdFromLiveSource({ testSessionId: sessionId, sourceCourseId: courseId });
    await firestore.doc(`users/${parentId}/wallet/state`).update({ balance: 1_000 });
    await firestore.doc('payments/payment_t42b7').set({
      paymentId: 'payment_t42b7',
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await firestore.doc('bookings/booking_t42b7').set({
      bookingId: 'booking_t42b7',
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await firestore.doc(`courses/${cloneId}`).update({ 'capacity.availableSeats': 1 });
    await firestore.doc('course_enrollments/enrollment_t42b7').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await firestore.doc(`participant_progress/${participantId}`).set({
      participantId,
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 2,
    });
    await firestore.doc(`participant_achievements/${participantId}`).set({
      participantId,
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 2,
    });
    await firestore.doc('instructor_reviews/review_t42b7').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await firestore.doc(`instructor_rating_summaries/${instructorId}`).set({
      instructorId,
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 2,
    });
    await firestore.doc('attendance/attendance_t42b7').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    files.set(`test-sessions/${sessionId}/chat/note.txt`, 'ok');
    files.set(`test-actors/${parentId}/avatar.png`, 'ok');
    files.set('chat/live-note.txt', 'ok');

    const preview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_preview_reset',
      testSessionId: sessionId,
    });
    expect(preview.manifest?.counts.bookings).toBe(1);
    expect(preview.manifest?.counts.payments).toBe(1);
    expect(preview.manifest?.preserve).toContain('test_actors');
    const executed = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'execute_test_session_reset',
      idempotencyKey: 'idem_t42b7_execute_reset',
      testSessionId: sessionId,
      manifestId: preview.manifest!.manifestId,
      confirmation: TEST_SESSION_RESET_CONFIRMATION,
    });
    expect(executed.status).toBe('active');
    expect(executed.verifier?.ok).toBe(true);
    expect((await firestore.doc(`users/${parentId}/wallet/state`).get()).get('balance')).toBe(STARTING_BALANCE);
    expect((await firestore.doc(`users/${liveWalletId}/wallet/state`).get()).get('balance')).toBe(888_000);
    expect((await firestore.doc('payments/payment_t42b7').get()).exists).toBe(false);
    expect((await firestore.doc('bookings/booking_t42b7').get()).exists).toBe(false);
    expect((await firestore.doc(`participant_progress/${participantId}`).get()).exists).toBe(false);
    expect((await firestore.doc(`participant_achievements/${participantId}`).get()).exists).toBe(false);
    expect((await firestore.doc('instructor_reviews/review_t42b7').get()).exists).toBe(false);
    expect((await firestore.doc(`instructor_rating_summaries/${instructorId}`).get()).exists).toBe(false);
    expect((await firestore.doc(`instructor_rating_summaries/${liveInstructorId}`).get()).get('average')).toBe(5);
    expect((await firestore.doc('participant_progress/participant_live').get()).exists).toBe(true);
    expect((await firestore.doc(`participants/${participantId}`).get()).exists).toBe(true);
    expect((await firestore.doc(`instructors/${instructorId}`).get()).get('dataScope')).toBe('test');
    expect((await firestore.doc(`courses/${courseId}`).get()).get('revision')).toBe(2);
    const clone = await firestore.doc(`courses/${cloneId}`).get();
    expect(clone.get('capacity.availableSeats')).toBe(clone.get('capacity.totalSeats'));
    expect((await firestore.doc(`test_actor_assignments/${parentId}`).get()).get('activeTestSessionId')).toBe(sessionId);
    expect(files.has(`test-sessions/${sessionId}/chat/note.txt`)).toBe(false);
    expect(files.has(`test-actors/${parentId}/avatar.png`)).toBe(true);
    expect(files.has('chat/live-note.txt')).toBe(true);
    expect((await firestore.collection('admin_maintenance_events').get()).size).toBe(1);
  });

  it('rejects a stale or expired manifest before deleting anything', async () => {
    const created = await createSession('idem_t42b7_stale');
    const sessionId = created.testSessionId as TestSessionId;
    const preview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_stale_preview',
      testSessionId: sessionId,
    });
    await firestore.doc('bookings/booking_after_preview').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await expect(
      executeTestSessionLifecycle(ports(), adminId, {
        command: 'execute_test_session_reset',
        idempotencyKey: 'idem_t42b7_stale_execute',
        testSessionId: sessionId,
        manifestId: preview.manifest!.manifestId,
        confirmation: TEST_SESSION_RESET_CONFIRMATION,
      })
    ).rejects.toMatchObject({ code: 'TEST_MAINTENANCE_MANIFEST_STALE' });
    expect((await firestore.doc('bookings/booking_after_preview').get()).exists).toBe(true);
    expect((await firestore.doc(`test_sessions/${sessionId}`).get()).get('status')).toBe('active');

    const fresh = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_expire_preview',
      testSessionId: sessionId,
    });
    now = new Date(now.getTime() + 11 * 60 * 1000);
    await expect(
      executeTestSessionLifecycle(ports(), adminId, {
        command: 'execute_test_session_reset',
        idempotencyKey: 'idem_t42b7_expire_execute',
        testSessionId: sessionId,
        manifestId: fresh.manifest!.manifestId,
        confirmation: TEST_SESSION_RESET_CONFIRMATION,
      })
    ).rejects.toMatchObject({ code: 'TEST_MAINTENANCE_MANIFEST_EXPIRED' });
    expect((await firestore.doc('bookings/booking_after_preview').get()).exists).toBe(true);
  });

  it('aborts before any delete when inventory contains LIVE, missing-scope, or another session', async () => {
    const created = await createSession('idem_t42b7_safety');
    const sessionId = created.testSessionId as TestSessionId;
    await firestore.doc('bookings/booking_safe').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    await firestore.doc('bookings/booking_legacy').set({ testSessionId: sessionId, revision: 1 });
    await firestore.doc('bookings/booking_live').set({ dataScope: 'live', revision: 9 });
    await firestore.doc('bookings/booking_other').set({
      dataScope: 'test',
      testSessionId: 'test_session_other_b7',
      revision: 1,
    });
    const preview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_legacy_preview',
      testSessionId: sessionId,
    }).catch((error: unknown) => error);
    expect(preview).toMatchObject({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' });
    expect((await firestore.doc('bookings/booking_safe').get()).exists).toBe(true);
    expect((await firestore.doc('bookings/booking_legacy').get()).exists).toBe(true);

    await firestore.doc('bookings/booking_legacy').delete();
    const poisoned = ports(async () => [
      {
        path: 'bookings/booking_live',
        revision: 9,
        dataScope: 'live',
        testSessionId: null,
      },
    ]);
    const livePreview = await executeTestSessionLifecycle(poisoned, adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_live_preview',
      testSessionId: sessionId,
    }).catch((error: unknown) => error);
    expect(livePreview).toMatchObject({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' });
    expect((await firestore.doc('bookings/booking_live').get()).get('revision')).toBe(9);
    expect((await firestore.doc('bookings/booking_safe').get()).exists).toBe(true);

    const cross = ports(async () => [
      {
        path: 'bookings/booking_other',
        revision: 1,
        dataScope: 'test',
        testSessionId: 'test_session_other_b7',
      },
    ]);
    const crossPreview = await executeTestSessionLifecycle(cross, adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_cross_preview',
      testSessionId: sessionId,
    }).catch((error: unknown) => error);
    expect(crossPreview).toMatchObject({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' });
    expect((await firestore.doc('bookings/booking_other').get()).exists).toBe(true);
    expect((await firestore.doc('bookings/booking_safe').get()).exists).toBe(true);
  });

  it('serializes reset against reset and delete, and blocks TEST product scope while resetting', async () => {
    const created = await createSession('idem_t42b7_race_reset');
    const sessionId = created.testSessionId as TestSessionId;
    const preview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_race_preview',
      testSessionId: sessionId,
    });
    const execute = {
      command: 'execute_test_session_reset' as const,
      idempotencyKey: 'idem_t42b7_race_execute',
      testSessionId: sessionId,
      manifestId: preview.manifest!.manifestId,
      confirmation: TEST_SESSION_RESET_CONFIRMATION,
    };
    const raced = await Promise.allSettled([
      executeTestSessionLifecycle(ports(), adminId, execute),
      executeTestSessionLifecycle(ports(), adminId, { ...execute, idempotencyKey: 'idem_t42b7_race_execute_b' }),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(raced.filter((result) => result.status === 'rejected').length).toBeGreaterThan(0);
    expect((await firestore.doc(`users/${parentId}/wallet/state`).get()).get('balance')).toBe(STARTING_BALANCE);

    await firestore.doc(`test_sessions/${sessionId}`).update({ status: 'resetting' });
    await expect(
      resolveCanonicalExecutionScope(createFirestoreCanonicalExecutionScopeStore(firestore), {
        accountId: parentId,
        accountLifecycleStatus: 'active',
        isAdministrator: false,
      })
    ).rejects.toBeInstanceOf(TestSessionPolicyError);
    await expect(
      resolveCanonicalExecutionScope(createFirestoreCanonicalExecutionScopeStore(firestore), {
        accountId: adminId,
        accountLifecycleStatus: 'active',
        isAdministrator: true,
      })
    ).resolves.toEqual({ dataScope: 'live' });
    await firestore.doc(`test_sessions/${sessionId}`).update({ status: 'active' });

    const deletePreview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_delete',
      idempotencyKey: 'idem_t42b7_delete_race_preview',
      testSessionId: sessionId,
    });
    const resetPreview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_reset_race_preview_2',
      testSessionId: sessionId,
    });
    const mixed = await Promise.allSettled([
      executeTestSessionLifecycle(ports(), adminId, {
        command: 'execute_test_session_reset',
        idempotencyKey: 'idem_t42b7_mixed_reset',
        testSessionId: sessionId,
        manifestId: resetPreview.manifest!.manifestId,
        confirmation: TEST_SESSION_RESET_CONFIRMATION,
      }),
      executeTestSessionLifecycle(ports(), adminId, {
        command: 'execute_test_session_delete',
        idempotencyKey: 'idem_t42b7_mixed_delete',
        testSessionId: sessionId,
        manifestId: deletePreview.manifest!.manifestId,
        confirmation: TEST_SESSION_DELETE_CONFIRMATION,
      }),
    ]);
    expect(mixed.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('keeps a storage failure recoverable and then deletes the session without residue', async () => {
    const created = await createSession('idem_t42b7_storage');
    const sessionId = created.testSessionId as TestSessionId;
    files.set(`test-sessions/${sessionId}/a.txt`, 'ok');
    files.set(`test-sessions/${sessionId}/b.txt`, 'fail');
    files.set(`test-actors/${parentId}/avatar.png`, 'ok');
    const preview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_reset',
      idempotencyKey: 'idem_t42b7_storage_preview',
      testSessionId: sessionId,
    });
    await expect(
      executeTestSessionLifecycle(ports(), adminId, {
        command: 'execute_test_session_reset',
        idempotencyKey: 'idem_t42b7_storage_execute',
        testSessionId: sessionId,
        manifestId: preview.manifest!.manifestId,
        confirmation: TEST_SESSION_RESET_CONFIRMATION,
      })
    ).rejects.toBeInstanceOf(TestSessionMaintenanceError);
    expect((await firestore.doc(`test_sessions/${sessionId}`).get()).get('status')).toBe('failed');
    expect(files.has(`test-actors/${parentId}/avatar.png`)).toBe(true);
    files.set(`test-sessions/${sessionId}/b.txt`, 'ok');
    const retried = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'retry_test_session_maintenance',
      idempotencyKey: 'idem_t42b7_storage_retry',
      testSessionId: sessionId,
    });
    expect(retried.status).toBe('active');
    expect(files.has(`test-sessions/${sessionId}/a.txt`)).toBe(false);
    expect(files.has(`test-actors/${parentId}/avatar.png`)).toBe(true);

    await firestore.doc('bookings/booking_delete').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    files.set(`test-sessions/${sessionId}/left.txt`, 'ok');
    const deletePreview = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'preview_test_session_delete',
      idempotencyKey: 'idem_t42b7_delete_preview',
      testSessionId: sessionId,
    });
    const deleted = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'execute_test_session_delete',
      idempotencyKey: 'idem_t42b7_delete_execute',
      testSessionId: sessionId,
      manifestId: deletePreview.manifest!.manifestId,
      confirmation: TEST_SESSION_DELETE_CONFIRMATION,
    });
    expect(deleted.outcome).toBe('executed');
    expect((await firestore.doc(`test_sessions/${sessionId}`).get()).exists).toBe(false);
    expect((await firestore.doc('bookings/booking_delete').get()).exists).toBe(false);
    expect((await firestore.doc(`courses/${testCourseIdFromLiveSource({ testSessionId: sessionId, sourceCourseId: courseId })}`).get()).exists).toBe(false);
    expect((await firestore.doc(`test_sessions/${sessionId}/membership/${parentId}`).get()).exists).toBe(false);
    expect((await firestore.doc(`test_actor_assignments/${parentId}`).get()).get('activeTestSessionId')).toBeNull();
    expect((await firestore.doc(`test_actors/${parentId}`).get()).exists).toBe(true);
    expect((await firestore.doc(`instructors/${instructorId}`).get()).exists).toBe(true);
    expect((await firestore.doc(`participants/${participantId}`).get()).exists).toBe(true);
    expect(files.has(`test-sessions/${sessionId}/left.txt`)).toBe(false);
    expect(files.has(`test-actors/${parentId}/avatar.png`)).toBe(true);
    expect((await firestore.collection('admin_maintenance_events').get()).size).toBeGreaterThan(0);
    const again = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'execute_test_session_delete',
      idempotencyKey: 'idem_t42b7_delete_again',
      testSessionId: sessionId,
      manifestId: deletePreview.manifest!.manifestId,
      confirmation: TEST_SESSION_DELETE_CONFIRMATION,
    });
    expect(again.outcome).toBe('already_completed');
  });

  it('closes a session without deleting history and keeps the assignment clear', async () => {
    const created = await createSession('idem_t42b7_close');
    const sessionId = created.testSessionId as TestSessionId;
    await firestore.doc('bookings/booking_history').set({
      dataScope: 'test',
      testSessionId: sessionId,
      revision: 1,
    });
    const closed = await executeTestSessionLifecycle(ports(), adminId, {
      command: 'close_test_session',
      idempotencyKey: 'idem_t42b7_close_cmd',
      testSessionId: sessionId,
    });
    expect(closed.status).toBe('closed');
    expect((await firestore.doc('bookings/booking_history').get()).exists).toBe(true);
    expect((await firestore.doc(`test_actor_assignments/${parentId}`).get()).get('activeTestSessionId')).toBeNull();
    const reopened = await createSession('idem_t42b7_after_close');
    expect(reopened.testSessionId).not.toBe(sessionId);
    expect(reopened.status).toBe('active');
  });
});
