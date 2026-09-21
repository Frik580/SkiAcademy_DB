import { randomBytes } from 'node:crypto';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  CanonicalOpaqueIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  TestActorAssignmentSchema,
  TestSessionIdSchema,
  TestSessionMembershipSchema,
  TestSessionSchema,
  TEST_SESSION_DELETE_PRESERVE,
  TEST_SESSION_RESET_PRESERVE,
  TestSessionLifecycleResultSchema,
  TestSessionMaintenanceError,
  assertMaintenanceConfirmation,
  assertManifestFresh,
  assertResetCompletionStatus,
  assertTestSessionStatusTransition,
  buildMaintenanceManifestHash,
  canonicalDeterministicHash,
  evaluateMaintenanceLease,
  fingerprintMaintenanceCandidates,
  maintenanceLeaseExpiresAt,
  maintenanceLeaseIsExpired,
  manifestExpiresAt,
  monetaryEventIdFromTestWalletSeed,
  parsePersistedCanonicalScope,
  preflightDestructiveCandidates,
  testCourseIdFromLiveSource,
  testSessionStatusConsumesActiveSlot,
  testSessionStoragePrefix,
  timestampFromDate,
  type AccountId,
  type ExecuteTestSessionLifecycleInput,
  type TestSession,
  type TestSessionLifecycleResult,
  type TestSessionMaintenanceCandidate,
  type TestSessionStatus,
} from '@ski-academy/shared-domain';
import type { CanonicalTransactionExecutor } from '../transactions';
import { cloneLiveCourseIntoTestSession } from './cloneLiveCourseIntoTestSession';
import {
  deleteTestSessionStorageWithStore,
  type TestSessionStorageObjectStore,
} from './deleteTestSessionStorage';
import { seedTestActorWalletForSession } from './seedTestActorWallet';
import { parseTestActor, parseTestSession } from './testSessionStore';
import {
  collectFixedIdentityCandidates,
  collectMembershipCandidates,
  collectQueryableSessionCandidates,
  maintenanceCounts,
} from './testSessionMaintenanceInventory';

const ACTIVE_SLOT_PATH = 'test_session_active_slots/v1';
const DELETE_CHUNK = 400;

export interface TestSessionLifecyclePorts {
  readonly firestore: Firestore;
  readonly now: () => Date;
  readonly storage: TestSessionStorageObjectStore;
  readonly executor: CanonicalTransactionExecutor;
  /** Test-only poisoned inventory. Production callables leave this unset. */
  readonly extraCandidates?: (
    testSessionId: string,
    operation: 'reset' | 'delete'
  ) => Promise<readonly TestSessionMaintenanceCandidate[]>;
}

type CreateInput = Extract<ExecuteTestSessionLifecycleInput, { command: 'create_test_session' }>;

function opaque(prefix: string): string {
  return CanonicalOpaqueIdSchema.parse(`${prefix}${randomBytes(16).toString('hex')}`);
}

function newTestSessionId(): TestSession['testSessionId'] {
  return TestSessionIdSchema.parse(`test_${randomBytes(16).toString('hex')}`);
}

function commandId(parts: readonly string[]) {
  return CommandIdSchema.parse(canonicalDeterministicHash(['test-lifecycle:v1', ...parts]));
}

function correlation(parts: readonly string[]) {
  return CorrelationIdSchema.parse(canonicalDeterministicHash(['test-lifecycle-correlation:v1', ...parts]));
}

function idempotencyPath(command: string, key: string): string {
  return `test_session_lifecycle_idempotency/${canonicalDeterministicHash([
    'test-lifecycle-idempotency:v1',
    command,
    key,
  ])}`;
}

function asData(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function advance(
  session: TestSession,
  patch: Partial<TestSession> & { maintenance?: TestSession['maintenance'] },
  now: Date,
  bumpInventory: boolean
): TestSession {
  const next: Record<string, unknown> = {
    ...session,
    ...patch,
    revision: session.revision + 1,
    inventoryRevision: bumpInventory ? session.inventoryRevision + 1 : session.inventoryRevision,
    updatedAt: timestampFromDate(now),
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'maintenance') && patch.maintenance === undefined) {
    delete next.maintenance;
  }
  return TestSessionSchema.parse(next);
}

async function readSession(firestore: Firestore, testSessionId: string): Promise<TestSession | undefined> {
  const snap = await firestore.doc(`test_sessions/${testSessionId}`).get();
  return snap.exists ? parseTestSession(snap.data() as Record<string, unknown>) : undefined;
}

async function persistSession(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  slot: TestSessionStatus | 'release' | 'keep'
): Promise<void> {
  const ref = ports.firestore.doc(`test_sessions/${session.testSessionId}`);
  const slotRef = ports.firestore.doc(ACTIVE_SLOT_PATH);
  await ports.firestore.runTransaction(async (transaction) => {
    const currentSlot = slot === 'keep' ? undefined : await transaction.get(slotRef);
    transaction.set(ref, asData(session));
    if (!currentSlot) return;
    if (slot === 'release') {
      if (currentSlot.get('testSessionId') === session.testSessionId) transaction.delete(slotRef);
      return;
    }
    transaction.set(slotRef, {
      schemaVersion: 1,
      testSessionId: session.testSessionId,
      status: slot,
      updatedAt: session.updatedAt,
    });
  });
}

function errorCode(error: unknown): TestSessionMaintenanceError['code'] {
  return error instanceof TestSessionMaintenanceError ? error.code : 'TEST_MAINTENANCE_FAILED';
}

function isFirestoreAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = error.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

async function markFailed(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  operationKind: 'provision' | 'reset' | 'delete',
  code: string
): Promise<void> {
  if (session.status === 'failed') return;
  assertTestSessionStatusTransition(session.status, 'failed');
  const operationId = session.maintenance?.operationId ?? opaque('op');
  const failed = advance(
    session,
    {
      status: 'failed',
      maintenance: {
        operationId,
        operationKind,
        phase: session.maintenance?.phase ?? 'PRECHECK',
        resumeStatus: session.maintenance?.resumeStatus,
        manifestId: session.maintenance?.manifestId,
        manifestHash: session.maintenance?.manifestHash,
        startedAt: session.maintenance?.startedAt ?? timestampFromDate(ports.now()),
        startedByAccountId: session.maintenance?.startedByAccountId,
        leaseExpiresAt: timestampFromDate(maintenanceLeaseExpiresAt(ports.now())),
        lastError: code,
      },
    },
    ports.now(),
    false
  );
  await persistSession(ports, failed, 'failed');
  await ports.firestore.doc(`admin_maintenance_events/${operationId}`).set(
    {
      operationId,
      operationKind,
      testSessionId: session.testSessionId,
      status: 'failed',
      phase: failed.maintenance?.phase ?? 'PRECHECK',
      errorCode: code,
      updatedAt: timestampFromDate(ports.now()),
    },
    { merge: true }
  );
}

function assertPersistentTestIdentity(
  data: Record<string, unknown> | undefined,
  code: 'TEST_ACTOR_INVALID' | 'TEST_INSTRUCTOR_INVALID'
): void {
  if (!data || data.dataScope !== 'test') throw new TestSessionMaintenanceError(code);
  if (data.testSessionId !== undefined && !TestSessionIdSchema.safeParse(data.testSessionId).success) {
    throw new TestSessionMaintenanceError(code);
  }
}

function membershipAccountIds(session: TestSession): AccountId[] {
  if (!session.provisioning) return [];
  return [...new Set([...session.provisioning.actorAccountIds, session.provisioning.testInstructorAccountId])].map(
    (accountId) => AccountIdSchema.parse(accountId)
  );
}

async function writeMembershipAndAssignment(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  accountIds: readonly AccountId[]
): Promise<void> {
  const now = timestampFromDate(ports.now());
  const boundByCommandId = commandId(['membership', session.testSessionId]);
  const audit = {
    createdByCommandId: boundByCommandId,
    lastChangedByCommandId: boundByCommandId,
    correlationId: session.audit.correlationId,
  };
  await ports.firestore.runTransaction(async (transaction) => {
    const membershipRefs = accountIds.map((accountId) =>
      ports.firestore.doc(`test_sessions/${session.testSessionId}/membership/${accountId}`)
    );
    const assignmentRefs = accountIds.map((accountId) =>
      ports.firestore.doc(`test_actor_assignments/${accountId}`)
    );
    const membershipSnaps: DocumentSnapshot[] = [];
    const assignmentSnaps: DocumentSnapshot[] = [];
    for (const ref of membershipRefs) membershipSnaps.push(await transaction.get(ref));
    for (const ref of assignmentRefs) assignmentSnaps.push(await transaction.get(ref));
    accountIds.forEach((accountId, index) => {
      const membershipSnap = membershipSnaps[index]!;
      const assignmentSnap = assignmentSnaps[index]!;
      if (!membershipSnap.exists) {
        transaction.set(
          membershipSnap.ref,
          asData(
            TestSessionMembershipSchema.parse({
              testSessionId: session.testSessionId,
              accountId,
              boundAt: now,
              boundByCommandId,
              revision: 1,
              audit,
            })
          )
        );
      }
      const existing = assignmentSnap.exists
        ? TestActorAssignmentSchema.safeParse(assignmentSnap.data())
        : undefined;
      const active = existing?.success ? existing.data.activeTestSessionId : null;
      if (active && active !== session.testSessionId) {
        throw new TestSessionMaintenanceError('TEST_ACTOR_ASSIGNMENT_CONFLICT');
      }
      transaction.set(
        assignmentSnap.ref,
        asData(
          TestActorAssignmentSchema.parse({
            accountId,
            activeTestSessionId: session.testSessionId,
            revision: existing?.success ? existing.data.revision + 1 : 1,
            updatedAt: now,
            audit,
          })
        )
      );
    });
  });
}

async function clearAssignments(ports: TestSessionLifecyclePorts, session: TestSession): Promise<void> {
  const accountIds = membershipAccountIds(session);
  if (accountIds.length === 0) return;
  const now = timestampFromDate(ports.now());
  await ports.firestore.runTransaction(async (transaction) => {
    const refs = accountIds.map((accountId) => ports.firestore.doc(`test_actor_assignments/${accountId}`));
    const snaps: DocumentSnapshot[] = [];
    for (const ref of refs) snaps.push(await transaction.get(ref));
    snaps.forEach((snap, index) => {
      if (!snap?.exists || snap.get('activeTestSessionId') !== session.testSessionId) return;
      transaction.set(
        refs[index]!,
        asData(
          TestActorAssignmentSchema.parse({
            ...snap.data(),
            activeTestSessionId: null,
            revision: Number(snap.get('revision') ?? 1) + 1,
            updatedAt: now,
          })
        )
      );
    });
  });
}

async function loadCreateGraph(ports: TestSessionLifecyclePorts, input: CreateInput) {
  if (new Set(input.actorAccountIds).size !== input.actorAccountIds.length) {
    throw new TestSessionMaintenanceError('TEST_ACTOR_INVALID');
  }
  if (new Set(input.sourceCourseIds).size !== input.sourceCourseIds.length) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  }
  for (const accountId of input.actorAccountIds) {
    const actor = parseTestActor(
      (await ports.firestore.doc(`test_actors/${accountId}`).get()).data() as Record<string, unknown> | undefined
    );
    if (!actor || !actor.allowed || actor.kind !== 'test_parent') {
      throw new TestSessionMaintenanceError('TEST_ACTOR_INVALID');
    }
    assertPersistentTestIdentity(
      (await ports.firestore.doc(`users/${accountId}`).get()).data() as Record<string, unknown> | undefined,
      'TEST_ACTOR_INVALID'
    );
    for (const participantId of actor.participantIds) {
      assertPersistentTestIdentity(
        (await ports.firestore.doc(`participants/${participantId}`).get()).data() as
          | Record<string, unknown>
          | undefined,
        'TEST_ACTOR_INVALID'
      );
    }
  }
  const instructorActor = parseTestActor(
    (await ports.firestore.doc(`test_actors/${input.testInstructorAccountId}`).get()).data() as
      | Record<string, unknown>
      | undefined
  );
  if (!instructorActor?.allowed || instructorActor.kind !== 'test_instructor' || !instructorActor.instructorId) {
    throw new TestSessionMaintenanceError('TEST_INSTRUCTOR_INVALID');
  }
  assertPersistentTestIdentity(
    (await ports.firestore.doc(`instructors/${instructorActor.instructorId}`).get()).data() as
      | Record<string, unknown>
      | undefined,
    'TEST_INSTRUCTOR_INVALID'
  );
  const pins = [];
  for (const courseId of input.sourceCourseIds) {
    const course = (await ports.firestore.doc(`courses/${courseId}`).get()).data() as
      | Record<string, unknown>
      | undefined;
    if (!course || typeof course.revision !== 'number') {
      throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
    }
    if (parsePersistedCanonicalScope(course, { allowLegacyLive: true }).dataScope !== 'live') {
      throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
    }
    pins.push({ courseId, revision: AggregateRevisionSchema.parse(course.revision) });
  }
  return { instructorActor, pins };
}

async function reserveCreate(
  ports: TestSessionLifecyclePorts,
  actorAccountId: AccountId,
  input: CreateInput,
  graph: Awaited<ReturnType<typeof loadCreateGraph>>
): Promise<{ session: TestSession; resumed: boolean }> {
  const idemRef = ports.firestore.doc(idempotencyPath('create_test_session', input.idempotencyKey));
  const slotRef = ports.firestore.doc(ACTIVE_SLOT_PATH);
  const testSessionId = newTestSessionId();
  const now = timestampFromDate(ports.now());
  const createdCommand = commandId(['create', input.idempotencyKey]);
  const draft = TestSessionSchema.parse({
    testSessionId,
    schemaVersion: 1,
    status: 'provisioning',
    label: input.label,
    createdByAccountId: actorAccountId,
    config: { startingBalanceKzt: input.startingBalanceKzt, clonedCourseIds: [] },
    inventoryRevision: 0,
    provisioning: {
      actorAccountIds: [...input.actorAccountIds],
      testInstructorAccountId: input.testInstructorAccountId,
      testInstructorId: graph.instructorActor.instructorId,
      sourceCourseIds: [...input.sourceCourseIds],
      sourceCourseRevisions: graph.pins,
      walletSeededAccountIds: [],
    },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    audit: {
      createdByCommandId: createdCommand,
      lastChangedByCommandId: createdCommand,
      correlationId: correlation(['create', input.idempotencyKey]),
    },
    maintenance: {
      operationId: opaque('op'),
      operationKind: 'provision',
      phase: 'PRECHECK',
      startedAt: now,
      startedByAccountId: actorAccountId,
      leaseExpiresAt: timestampFromDate(maintenanceLeaseExpiresAt(ports.now())),
    },
  });
  const reservation = {
    schemaVersion: 1,
    testSessionId,
    status: 'provisioning',
    updatedAt: now,
  };
  let existingId: string | undefined;
  try {
    existingId = await ports.firestore.runTransaction(async (transaction) => {
      const idem = await transaction.get(idemRef);
      if (idem.exists) return String(idem.get('testSessionId'));
      const slot = await transaction.get(slotRef);
      const reservedStatus = slot.get('status');
      if (
        slot.exists &&
        typeof reservedStatus === 'string' &&
        testSessionStatusConsumesActiveSlot(reservedStatus as TestSessionStatus)
      ) {
        throw new TestSessionMaintenanceError('TEST_SESSION_ACTIVE_LIMIT');
      }
      if (slot.exists) transaction.set(slotRef, reservation);
      else transaction.create(slotRef, reservation);
      transaction.set(idemRef, { command: 'create_test_session', testSessionId, createdAt: now });
      transaction.set(ports.firestore.doc(`test_sessions/${testSessionId}`), asData(draft));
      return undefined;
    });
  } catch (error) {
    if (error instanceof TestSessionMaintenanceError) throw error;
    if (isFirestoreAlreadyExists(error)) throw new TestSessionMaintenanceError('TEST_SESSION_ACTIVE_LIMIT');
    throw error;
  }
  if (!existingId) return { session: draft, resumed: false };
  const existing = await readSession(ports.firestore, existingId);
  if (!existing) throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  return { session: existing, resumed: true };
}

async function bindPersistentIdentities(
  ports: TestSessionLifecyclePorts,
  session: TestSession
): Promise<void> {
  const provisioning = session.provisioning;
  if (!provisioning) throw new TestSessionMaintenanceError('TEST_INSTRUCTOR_INVALID');
  const participantIdList = await participantIdsFor(ports, membershipAccountIds(session));
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const instructor = await ports.firestore.doc(`instructors/${provisioning.testInstructorId}`).get();
  assertPersistentTestIdentity(instructor.data() as Record<string, unknown> | undefined, 'TEST_INSTRUCTOR_INVALID');
  writes.push({
    path: `instructors/${provisioning.testInstructorId}`,
    data: { ...(instructor.data() as Record<string, unknown>), dataScope: 'test', testSessionId: session.testSessionId },
  });
  for (const participantId of participantIdList) {
    const snap = await ports.firestore.doc(`participants/${participantId}`).get();
    assertPersistentTestIdentity(snap.data() as Record<string, unknown> | undefined, 'TEST_ACTOR_INVALID');
    writes.push({
      path: `participants/${participantId}`,
      data: { ...(snap.data() as Record<string, unknown>), dataScope: 'test', testSessionId: session.testSessionId },
    });
  }
  for (const accountId of provisioning.actorAccountIds) {
    const wallet = await ports.firestore.doc(`users/${accountId}/wallet/state`).get();
    if (!wallet.exists) continue;
    const data = wallet.data() as Record<string, unknown>;
    if (data.dataScope !== 'test') throw new TestSessionMaintenanceError('TEST_MAINTENANCE_SCOPE_VIOLATION');
    if (data.testSessionId !== session.testSessionId) {
      writes.push({ path: `users/${accountId}/wallet/state`, data: { delete: true } });
    }
  }
  const batch = ports.firestore.batch();
  for (const write of writes) {
    if (write.data.delete === true) batch.delete(ports.firestore.doc(write.path));
    else batch.set(ports.firestore.doc(write.path), write.data);
  }
  await batch.commit();
}

async function provisionFixtures(ports: TestSessionLifecyclePorts, session: TestSession): Promise<TestSession> {
  const provisioning = session.provisioning;
  if (!provisioning?.testInstructorId) throw new TestSessionMaintenanceError('TEST_INSTRUCTOR_INVALID');
  await bindPersistentIdentities(ports, session);
  await writeMembershipAndAssignment(ports, session, membershipAccountIds(session));
  const clonedCourseIds = [];
  for (const sourceCourseId of provisioning.sourceCourseIds) {
    const cloned = await cloneLiveCourseIntoTestSession({
      executor: ports.executor,
      correlationId: session.audit.correlationId,
      testSession: session,
      sourceCourseId,
      testInstructorId: provisioning.testInstructorId,
      decidedAt: ports.now(),
    });
    clonedCourseIds.push(cloned.courseId);
  }
  for (const accountId of provisioning.actorAccountIds) {
    await seedTestActorWalletForSession({
      executor: ports.executor,
      correlationId: session.audit.correlationId,
      testSession: session,
      accountId,
      decidedAt: ports.now(),
    });
  }
  const seeded = advance(
    session,
    {
      config: { ...session.config, clonedCourseIds },
      provisioning: { ...provisioning, walletSeededAccountIds: [...provisioning.actorAccountIds] },
    },
    ports.now(),
    false
  );
  await persistSession(ports, seeded, 'keep');
  return seeded;
}

async function participantIdsFor(ports: TestSessionLifecyclePorts, accountIds: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const accountId of accountIds) {
    const actor = parseTestActor(
      (await ports.firestore.doc(`test_actors/${accountId}`).get()).data() as Record<string, unknown> | undefined
    );
    if (actor) ids.push(...actor.participantIds);
  }
  return ids;
}

async function verifySessionFixtures(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  expectCleanResidue: boolean
): Promise<{ ok: boolean; failedChecks: string[] }> {
  const failedChecks: string[] = [];
  const provisioning = session.provisioning;
  if (!provisioning) return { ok: false, failedChecks: ['provisioning'] };
  for (const accountId of membershipAccountIds(session)) {
    const membership = await ports.firestore
      .doc(`test_sessions/${session.testSessionId}/membership/${accountId}`)
      .get();
    if (!membership.exists) failedChecks.push(`membership:${accountId}`);
    const assignment = await ports.firestore.doc(`test_actor_assignments/${accountId}`).get();
    if (assignment.get('activeTestSessionId') !== session.testSessionId) {
      failedChecks.push(`assignment:${accountId}`);
    }
  }
  for (const pin of provisioning.sourceCourseRevisions) {
    const live = await ports.firestore.doc(`courses/${pin.courseId}`).get();
    if (live.get('revision') !== pin.revision || live.get('dataScope') === 'test') {
      failedChecks.push(`live_course:${pin.courseId}`);
    }
  }
  for (const sourceCourseId of provisioning.sourceCourseIds) {
    const cloneId = testCourseIdFromLiveSource({ testSessionId: session.testSessionId, sourceCourseId });
    const clone = await ports.firestore.doc(`courses/${cloneId}`).get();
    const capacity = clone.get('capacity') as { totalSeats?: number; availableSeats?: number } | undefined;
    if (
      !clone.exists ||
      clone.get('dataScope') !== 'test' ||
      clone.get('testSessionId') !== session.testSessionId ||
      capacity?.availableSeats !== capacity?.totalSeats
    ) {
      failedChecks.push(`course:${sourceCourseId}`);
    }
    const days = await ports.firestore.collection(`courses/${cloneId}/days`).limit(1).get();
    if (days.empty) failedChecks.push(`course_days:${sourceCourseId}`);
  }
  for (const accountId of provisioning.walletSeededAccountIds) {
    const wallet = await ports.firestore.doc(`users/${accountId}/wallet/state`).get();
    const event = await ports.firestore
      .doc(
        `monetary_events/${monetaryEventIdFromTestWalletSeed({
          accountId,
          testSessionId: session.testSessionId,
        })}`
      )
      .get();
    if (wallet.get('balance') !== session.config.startingBalanceKzt || !event.exists) {
      failedChecks.push(`wallet:${accountId}`);
    }
  }
  if (expectCleanResidue) {
    for (const collection of ['bookings', 'course_enrollments', 'attendance', 'payments', 'instructor_reviews', 'admin_issues']) {
      const count = (
        await ports.firestore.collection(collection).where('testSessionId', '==', session.testSessionId).count().get()
      ).data().count;
      if (count !== 0) failedChecks.push(`residue:${collection}`);
    }
    for (const participantId of await participantIdsFor(ports, provisioning.actorAccountIds)) {
      if ((await ports.firestore.doc(`participant_progress/${participantId}`).get()).exists) {
        failedChecks.push(`progress:${participantId}`);
      }
      if ((await ports.firestore.doc(`participant_achievements/${participantId}`).get()).exists) {
        failedChecks.push(`achievements:${participantId}`);
      }
    }
    const summary = await ports.firestore.doc(`instructor_rating_summaries/${provisioning.testInstructorId}`).get();
    if (summary.exists && summary.get('testSessionId') === session.testSessionId) {
      failedChecks.push('rating_summary');
    }
    if ((await ports.storage.list(testSessionStoragePrefix(session.testSessionId))).length > 0) {
      failedChecks.push('storage');
    }
  }
  return { ok: failedChecks.length === 0, failedChecks };
}

async function finishActive(ports: TestSessionLifecyclePorts, session: TestSession): Promise<TestSession> {
  assertTestSessionStatusTransition(session.status, 'active');
  const active = advance(session, { status: 'active', maintenance: undefined }, ports.now(), true);
  await persistSession(ports, active, 'active');
  return active;
}

async function resumeProvisioning(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  resumed: boolean
): Promise<TestSessionLifecycleResult> {
  if (session.status === 'active') {
    return TestSessionLifecycleResultSchema.parse({
      command: 'create_test_session',
      outcome: 'already_completed',
      testSessionId: session.testSessionId,
      status: 'active',
    });
  }
  let current = session;
  if (current.status === 'failed') {
    assertTestSessionStatusTransition('failed', 'provisioning');
    current = advance(current, { status: 'provisioning' }, ports.now(), false);
    await persistSession(ports, current, 'provisioning');
  }
  if (current.status !== 'provisioning') {
    throw new TestSessionMaintenanceError('TEST_SESSION_TRANSITION_FORBIDDEN');
  }
  const provisioned = await provisionFixtures(ports, current);
  const verifier = await verifySessionFixtures(ports, provisioned, false);
  if (!verifier.ok) throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  const active = await finishActive(ports, provisioned);
  return TestSessionLifecycleResultSchema.parse({
    command: 'create_test_session',
    outcome: resumed ? 'resumed' : 'created',
    testSessionId: active.testSessionId,
    status: active.status,
    verifier,
  });
}

async function fixedPaths(ports: TestSessionLifecyclePorts, session: TestSession): Promise<string[]> {
  const provisioning = session.provisioning;
  if (!provisioning) return [];
  const participants = await participantIdsFor(ports, provisioning.actorAccountIds);
  return [
    ...participants.flatMap((participantId) => [
      `participant_progress/${participantId}`,
      `participant_achievements/${participantId}`,
    ]),
    `instructor_rating_summaries/${provisioning.testInstructorId}`,
    ...provisioning.walletSeededAccountIds.map((accountId) => `users/${accountId}/wallet/state`),
  ];
}

async function collectPlan(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  operation: 'reset' | 'delete'
): Promise<TestSessionMaintenanceCandidate[]> {
  const queried = await collectQueryableSessionCandidates(
    ports.firestore,
    session.testSessionId,
    membershipAccountIds(session)
  );
  const fixed = await collectFixedIdentityCandidates(ports.firestore, await fixedPaths(ports, session));
  const memberships =
    operation === 'delete' ? await collectMembershipCandidates(ports.firestore, session.testSessionId) : [];
  const extra = ports.extraCandidates ? await ports.extraCandidates(session.testSessionId, operation) : [];
  return [...queried, ...fixed, ...memberships, ...extra];
}

async function writeManifest(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  operation: 'reset' | 'delete',
  candidates: readonly TestSessionMaintenanceCandidate[]
): Promise<NonNullable<TestSessionLifecycleResult['manifest']>> {
  const storageObjects = (await ports.storage.list(testSessionStoragePrefix(session.testSessionId))).length;
  const fingerprint = fingerprintMaintenanceCandidates(candidates);
  const manifestHash = buildMaintenanceManifestHash({
    operation,
    testSessionId: session.testSessionId,
    inventoryRevision: session.inventoryRevision,
    fingerprint,
  });
  const createdAt = ports.now();
  const manifestId = opaque('m');
  const manifest = {
    manifestId,
    manifestHash,
    inventoryRevision: session.inventoryRevision,
    createdAt: createdAt.toISOString(),
    expiresAt: manifestExpiresAt(createdAt).toISOString(),
    counts: maintenanceCounts(candidates, storageObjects),
    preserve: [...(operation === 'reset' ? TEST_SESSION_RESET_PRESERVE : TEST_SESSION_DELETE_PRESERVE)],
    warnings: [] as string[],
  };
  await ports.firestore.doc(`test_sessions/${session.testSessionId}/maintenance_manifests/${manifestId}`).set({
    ...manifest,
    operation,
    fingerprint,
    testSessionId: session.testSessionId,
  });
  return manifest;
}

async function deleteCandidates(
  firestore: Firestore,
  candidates: readonly TestSessionMaintenanceCandidate[]
): Promise<void> {
  if (candidates.length === 0) return;
  for (let index = 0; index < candidates.length; index += DELETE_CHUNK) {
    const batch = firestore.batch();
    for (const candidate of candidates.slice(index, index + DELETE_CHUNK)) {
      batch.delete(firestore.doc(candidate.path));
    }
    await batch.commit();
  }
}

async function claimMaintenance(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  operation: 'reset' | 'delete',
  operationId: string,
  manifestId: string,
  manifestHash: string,
  actorAccountId: AccountId
): Promise<TestSession> {
  const ref = ports.firestore.doc(`test_sessions/${session.testSessionId}`);
  const slotRef = ports.firestore.doc(ACTIVE_SLOT_PATH);
  return ports.firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const current = parseTestSession(snap.data() as Record<string, unknown> | undefined);
    if (!current || current.testSessionId !== session.testSessionId) {
      throw new TestSessionMaintenanceError('TEST_SESSION_NOT_FOUND');
    }
    const busy = current.status === 'locked' || current.status === 'resetting' || current.status === 'deleting';
    if (busy) {
      if (current.maintenance?.operationId !== operationId || current.maintenance.operationKind !== operation) {
        throw new TestSessionMaintenanceError('TEST_MAINTENANCE_LEASE_CONFLICT');
      }
      return current;
    }
    assertTestSessionStatusTransition(current.status, 'locked');
    const next = advance(
      current,
      {
        status: 'locked',
        maintenance: {
          operationId,
          operationKind: operation,
          phase: 'LOCKED',
          resumeStatus:
            operation === 'reset'
              ? (current.maintenance?.resumeStatus ?? (current.status === 'closed' ? 'closed' : 'active'))
              : current.maintenance?.resumeStatus,
          manifestId,
          manifestHash,
          startedAt: timestampFromDate(ports.now()),
          startedByAccountId: actorAccountId,
          leaseExpiresAt: timestampFromDate(maintenanceLeaseExpiresAt(ports.now())),
        },
      },
      ports.now(),
      false
    );
    transaction.set(ref, asData(next));
    transaction.set(slotRef, {
      schemaVersion: 1,
      testSessionId: session.testSessionId,
      status: 'locked',
      updatedAt: next.updatedAt,
    });
    return next;
  });
}

async function runDestructive(
  ports: TestSessionLifecyclePorts,
  session: TestSession,
  operation: 'reset' | 'delete',
  manifestId: string,
  actorAccountId: AccountId
): Promise<TestSessionLifecycleResult> {
  const manifestSnap = await ports.firestore
    .doc(`test_sessions/${session.testSessionId}/maintenance_manifests/${manifestId}`)
    .get();
  if (!manifestSnap.exists || manifestSnap.get('operation') !== operation) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_MANIFEST_STALE');
  }
  const previewCandidates = await collectPlan(ports, session, operation);
  preflightDestructiveCandidates(previewCandidates, session.testSessionId, operation);
  const currentHash = buildMaintenanceManifestHash({
    operation,
    testSessionId: session.testSessionId,
    inventoryRevision: session.inventoryRevision,
    fingerprint: fingerprintMaintenanceCandidates(previewCandidates),
  });
  const resuming =
    session.maintenance?.operationKind === operation &&
    session.maintenance.manifestId === manifestId &&
    (session.status === 'failed' ||
      session.status === 'locked' ||
      session.status === 'resetting' ||
      session.status === 'deleting');
  if (!resuming) {
    assertManifestFresh({
      previewHash: String(manifestSnap.get('manifestHash')),
      currentHash,
      previewInventoryRevision: Number(manifestSnap.get('inventoryRevision')),
      inventoryRevision: session.inventoryRevision,
      expiresAt: new Date(String(manifestSnap.get('expiresAt'))),
      now: ports.now(),
    });
  }
  const operationId = session.maintenance?.operationId && session.maintenance.operationKind === operation
    ? session.maintenance.operationId
    : opaque('op');
  if (
    evaluateMaintenanceLease({
      currentOperationId:
        session.maintenance?.operationKind === operation ? session.maintenance.operationId : undefined,
      requestedOperationId: operationId,
    }) === 'conflict'
  ) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_LEASE_CONFLICT');
  }

  let working = await claimMaintenance(
    ports,
    session,
    operation,
    operationId,
    manifestId,
    currentHash,
    actorAccountId
  );

  const lockedCandidates = await collectPlan(ports, working, operation);
  try {
    preflightDestructiveCandidates(lockedCandidates, working.testSessionId, operation);
    if (!resuming) {
      assertManifestFresh({
        previewHash: currentHash,
        currentHash: buildMaintenanceManifestHash({
          operation,
          testSessionId: working.testSessionId,
          inventoryRevision: working.inventoryRevision,
          fingerprint: fingerprintMaintenanceCandidates(lockedCandidates),
        }),
        previewInventoryRevision: working.inventoryRevision,
        inventoryRevision: working.inventoryRevision,
        expiresAt: new Date(String(manifestSnap.get('expiresAt'))),
        now: ports.now(),
      });
    }
  } catch (error) {
    if (session.status === 'active' || session.status === 'closed') {
      await persistSession(
        ports,
        advance(session, { status: session.status, maintenance: undefined }, ports.now(), false),
        session.status
      );
    }
    throw error;
  }

  const destructiveStatus = operation === 'reset' ? 'resetting' : 'deleting';
  if (working.status !== destructiveStatus) {
    const fromLocked = working.status === 'locked' ? working : advance(working, { status: 'locked' }, ports.now(), false);
    assertTestSessionStatusTransition('locked', destructiveStatus);
    working = advance(
      fromLocked,
      {
        status: destructiveStatus,
        maintenance: {
          ...fromLocked.maintenance,
          operationId,
          operationKind: operation,
          phase: 'FIRESTORE_TRANSACTIONAL_DELETE',
          manifestId,
          manifestHash: currentHash,
          resumeStatus: operation === 'reset' ? (session.status === 'closed' ? 'closed' : session.maintenance?.resumeStatus ?? 'active') : undefined,
          leaseExpiresAt: timestampFromDate(maintenanceLeaseExpiresAt(ports.now())),
        },
      },
      ports.now(),
      false
    );
    await persistSession(ports, working, destructiveStatus);
  }

  try {
    await deleteCandidates(ports.firestore, lockedCandidates);
    working = advance(
      working,
      {
        maintenance: {
          ...working.maintenance,
          operationId,
          operationKind: operation,
          phase: 'STORAGE_CLEANUP',
        },
      },
      ports.now(),
      false
    );
    await persistSession(ports, working, 'keep');
    const storage = await deleteTestSessionStorageWithStore(working.testSessionId, ports.storage);
    if (!storage.complete) throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');

    if (operation === 'delete') {
      await clearAssignments(ports, working);
      await ports.firestore.doc(`admin_maintenance_events/${operationId}`).set({
        operationId,
        operationKind: 'delete',
        testSessionId: working.testSessionId,
        administratorAccountId: actorAccountId,
        manifestId,
        manifestHash: currentHash,
        status: 'completed',
        phase: 'COMPLETE',
        completedAt: timestampFromDate(ports.now()),
        createdAt: timestampFromDate(ports.now()),
      });
      await ports.firestore.doc(`test_session_deletions/${working.testSessionId}`).set({
        testSessionId: working.testSessionId,
        operationId,
        status: 'completed',
      });
      await ports.firestore.doc(`test_sessions/${working.testSessionId}`).delete();
      const slotRef = ports.firestore.doc(ACTIVE_SLOT_PATH);
      await ports.firestore.runTransaction(async (transaction) => {
        const slot = await transaction.get(slotRef);
        if (slot.get('testSessionId') === working.testSessionId) transaction.delete(slotRef);
      });
      return TestSessionLifecycleResultSchema.parse({
        command: 'execute_test_session_delete',
        outcome: 'executed',
        testSessionId: working.testSessionId,
        phase: 'COMPLETE',
        verifier: { ok: true, failedChecks: [] },
      });
    }

    working = advance(
      working,
      { maintenance: { ...working.maintenance, operationId, operationKind: operation, phase: 'COURSE_REPROVISION' } },
      ports.now(),
      false
    );
    await persistSession(ports, working, 'keep');
    working = await provisionFixtures(ports, working);
    const verifier = await verifySessionFixtures(ports, working, true);
    if (!verifier.ok) throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
    const finalStatus = working.maintenance?.resumeStatus === 'closed' ? 'closed' : 'active';
    assertResetCompletionStatus(finalStatus, finalStatus);
    assertTestSessionStatusTransition('resetting', finalStatus);
    let completed = advance(working, { status: finalStatus, maintenance: undefined }, ports.now(), true);
    if (finalStatus === 'closed') await clearAssignments(ports, completed);
    await persistSession(ports, completed, finalStatus === 'closed' ? 'release' : 'active');
    await ports.firestore.doc(`admin_maintenance_events/${operationId}`).set({
      operationId,
      operationKind: 'reset',
      testSessionId: completed.testSessionId,
      administratorAccountId: actorAccountId,
      manifestId,
      manifestHash: currentHash,
      status: 'completed',
      phase: 'COMPLETE',
      completedAt: timestampFromDate(ports.now()),
      createdAt: timestampFromDate(ports.now()),
    });
    return TestSessionLifecycleResultSchema.parse({
      command: 'execute_test_session_reset',
      outcome: 'executed',
      testSessionId: completed.testSessionId,
      status: completed.status,
      phase: 'COMPLETE',
      verifier,
    });
  } catch (error) {
    const current = (await readSession(ports.firestore, session.testSessionId)) ?? working;
    if (current.status === 'locked' || current.status === 'resetting' || current.status === 'deleting') {
      await markFailed(ports, current, operation, errorCode(error));
    }
    throw error instanceof TestSessionMaintenanceError ? error : new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  }
}

async function createTestSession(
  ports: TestSessionLifecyclePorts,
  actorAccountId: AccountId,
  input: CreateInput
): Promise<TestSessionLifecycleResult> {
  const graph = await loadCreateGraph(ports, input);
  const reserved = await reserveCreate(ports, actorAccountId, input, graph);
  try {
    return await resumeProvisioning(ports, reserved.session, reserved.resumed);
  } catch (error) {
    const latest = (await readSession(ports.firestore, reserved.session.testSessionId)) ?? reserved.session;
    if (latest.status === 'provisioning') await markFailed(ports, latest, 'provision', errorCode(error));
    throw error instanceof TestSessionMaintenanceError ? error : new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  }
}

export async function executeTestSessionLifecycle(
  ports: TestSessionLifecyclePorts,
  actorAccountId: AccountId,
  input: ExecuteTestSessionLifecycleInput
): Promise<TestSessionLifecycleResult> {
  if (input.command === 'create_test_session') return createTestSession(ports, actorAccountId, input);

  const session = await readSession(ports.firestore, input.testSessionId);
  if (!session) {
    const tombstone = await ports.firestore.doc(`test_session_deletions/${input.testSessionId}`).get();
    if (tombstone.exists && tombstone.get('status') === 'completed') {
      return TestSessionLifecycleResultSchema.parse({
        command: input.command === 'retry_test_session_maintenance' ? 'retry_test_session_maintenance' : input.command,
        outcome: 'already_completed',
        testSessionId: input.testSessionId,
        phase: 'COMPLETE',
      });
    }
    throw new TestSessionMaintenanceError('TEST_SESSION_NOT_FOUND');
  }

  if (input.command === 'close_test_session') {
    if (session.status === 'closed') {
      return TestSessionLifecycleResultSchema.parse({
        command: 'close_test_session',
        outcome: 'already_completed',
        testSessionId: session.testSessionId,
        status: 'closed',
      });
    }
    assertTestSessionStatusTransition(session.status, 'closed');
    await clearAssignments(ports, session);
    const closed = advance(session, { status: 'closed', maintenance: undefined }, ports.now(), true);
    await persistSession(ports, closed, 'release');
    return TestSessionLifecycleResultSchema.parse({
      command: 'close_test_session',
      outcome: 'closed',
      testSessionId: closed.testSessionId,
      status: 'closed',
    });
  }

  if (input.command === 'preview_test_session_reset' || input.command === 'preview_test_session_delete') {
    const operation = input.command === 'preview_test_session_reset' ? 'reset' : 'delete';
    if (operation === 'reset' && session.status !== 'active' && session.status !== 'closed') {
      throw new TestSessionMaintenanceError('TEST_SESSION_NOT_ACTIVE');
    }
    if (operation === 'delete' && session.status !== 'active' && session.status !== 'closed' && session.status !== 'failed') {
      throw new TestSessionMaintenanceError('TEST_MAINTENANCE_IN_PROGRESS');
    }
    const candidates = await collectPlan(ports, session, operation);
    preflightDestructiveCandidates(candidates, session.testSessionId, operation);
    return TestSessionLifecycleResultSchema.parse({
      command: input.command,
      outcome: 'preview',
      testSessionId: session.testSessionId,
      status: session.status,
      manifest: await writeManifest(ports, session, operation, candidates),
    });
  }

  if (input.command === 'execute_test_session_reset') {
    assertMaintenanceConfirmation('reset', input.confirmation);
    return runDestructive(ports, session, 'reset', input.manifestId, actorAccountId);
  }
  if (input.command === 'execute_test_session_delete') {
    assertMaintenanceConfirmation('delete', input.confirmation);
    return runDestructive(ports, session, 'delete', input.manifestId, actorAccountId);
  }

  const inProgress =
    session.status === 'provisioning' ||
    session.status === 'locked' ||
    session.status === 'resetting' ||
    session.status === 'deleting';
  const recoverable =
    session.status === 'failed' ||
    (inProgress && maintenanceLeaseIsExpired(session.maintenance?.leaseExpiresAt, ports.now()));
  if (!recoverable) {
    throw new TestSessionMaintenanceError(
      inProgress ? 'TEST_MAINTENANCE_LEASE_CONFLICT' : 'TEST_MAINTENANCE_IN_PROGRESS'
    );
  }
  if (session.status === 'provisioning' || session.maintenance?.operationKind === 'provision') {
    return resumeProvisioning(ports, session, true).catch(async (error) => {
      const latest = (await readSession(ports.firestore, session.testSessionId)) ?? session;
      if (latest.status === 'provisioning') await markFailed(ports, latest, 'provision', errorCode(error));
      throw error;
    });
  }
  if (!session.maintenance?.manifestId) throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  const operation = session.maintenance.operationKind === 'delete' ? 'delete' : 'reset';
  return runDestructive(ports, session, operation, session.maintenance.manifestId, actorAccountId);
}
