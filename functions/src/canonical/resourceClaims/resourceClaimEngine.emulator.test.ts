import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ResourceClaimIdentityInputSchema,
  canonicalPaths,
  expandUtcGuardBuckets,
  resourceClaimGuardIdFromBucketIdentity,
  timestampFromDate,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
} from '@ski-academy/shared-domain';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanMoveResourceClaim,
  replacementIgnoreFromClaim,
} from './resourceClaimEngine';
import {
  commitAcquireActiveCourseEnrollmentGuard,
  readAndPlanAcquireActiveCourseEnrollmentGuard,
} from './uniquenessGuards';

const PROJECT_ID = 'ski-academy-claim-engine-test';
const correlationId = CorrelationIdSchema.parse('correlation_claim_emulator_01');
const commandId = CommandIdSchema.parse('command_claim_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_claim_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_claim_emulator_01');
const decidedAt = new Date('2026-01-15T08:00:00.000Z');
const metadata = { correlationId, commandId, decidedAt };

let app: App;
let firestore: Firestore;

function interval(startIso: string, endIso: string) {
  return {
    startsAt: timestampFromDate(new Date(startIso)),
    endsAt: timestampFromDate(new Date(endIso)),
  };
}

function instructorIdentity(ownerId: string, occurrenceId: string) {
  return ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'instructor_booking_occurrence',
    resourceKind: 'instructor',
    resourceId: instructorId,
    ownerKind: 'booking',
    ownerId,
    occurrenceId: OccurrenceIdSchema.parse(occurrenceId),
  });
}

function participantIdentity(ownerId: string, occurrenceId: string) {
  return ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'participant_booking_occurrence',
    resourceKind: 'participant',
    resourceId: participantId,
    ownerKind: 'booking',
    ownerId,
    occurrenceId: OccurrenceIdSchema.parse(occurrenceId),
  });
}

async function clearCollections(
  database: Firestore,
  collections: readonly string[]
): Promise<void> {
  for (const collection of collections) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) {
      continue;
    }
    const batch = database.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function acquireInEmulator(
  identity: ReturnType<typeof instructorIdentity>,
  intervalValue: ReturnType<typeof interval>
) {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return executor.runAtomic({
    correlationId,
    run: async (session) => {
      const plan = await readAndPlanAcquireResourceClaim(session, {
        ...metadata,
        identity,
        interval: intervalValue,
      });
      await session.transitionToWrites();
      commitResourceClaimPlan(session, plan, metadata);
      return plan.claim;
    },
  });
}

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

describe.skipIf(!runsOnFirestoreEmulator)('resource claim engine (firestore emulator)', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    await clearCollections(firestore, [
      'resource_claims',
      'resource_claim_guards',
      'active_course_enrollment_guards',
    ]);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  it('serializes overlapping instructor claims so exactly one wins', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const attempts = Array.from({ length: 8 }, (_, index) =>
      executor
        .runAtomic({
          correlationId,
          run: async (session) => {
            const plan = await readAndPlanAcquireResourceClaim(session, {
              ...metadata,
              identity: instructorIdentity(
                `booking_claim_emulator_${index}`,
                `occurrence_claim_emulator_${index}`
              ),
              interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
            });
            await session.transitionToWrites();
            commitResourceClaimPlan(session, plan, metadata);
          },
        })
        .then(() => 'success' as const)
        .catch((error) => error.code as string)
    );

    const results = await Promise.all(attempts);
    expect(results.filter((result) => result === 'success')).toHaveLength(1);
    expect(results.filter((result) => result === 'instructor_conflict')).toHaveLength(7);
  });

  it('allows concurrent non-overlapping claims in the same bucket', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const sameBucketIntervals = [
      interval('2026-01-15T04:00:00.000Z', '2026-01-15T05:00:00.000Z'),
      interval('2026-01-15T06:00:00.000Z', '2026-01-15T07:00:00.000Z'),
      interval('2026-01-15T08:00:00.000Z', '2026-01-15T09:00:00.000Z'),
      interval('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z'),
    ];
    const [bucket] = expandUtcGuardBuckets('instructor', instructorId, sameBucketIntervals[0]!);
    expect(bucket).toBeDefined();
    const guardId = resourceClaimGuardIdFromBucketIdentity(bucket!.bucketIdentity);

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        executor.runAtomic({
          correlationId,
          run: async (session) => {
            const plan = await readAndPlanAcquireResourceClaim(session, {
              ...metadata,
              identity: instructorIdentity(
                `booking_claim_emulator_adj_${index}`,
                `occurrence_claim_emulator_adj_${index}`
              ),
              interval: sameBucketIntervals[index]!,
            });
            await session.transitionToWrites();
            commitResourceClaimPlan(session, plan, metadata);
            return plan.claim.claimId;
          },
        })
      )
    );
    expect(results).toHaveLength(4);
    expect(new Set(results).size).toBe(4);

    const guardDoc = await firestore
      .doc(canonicalPaths.resourceClaimGuard(guardId).slice(1))
      .get();
    expect(guardDoc.exists).toBe(true);
    const entries = guardDoc.data()?.entries ?? [];
    expect(entries).toHaveLength(4);
    expect(entries.map((entry: { claimId: string }) => entry.claimId).sort()).toEqual(
      [...results].sort()
    );
  }, 30_000);

  it('serializes overlapping participant claims so exactly one wins', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const attempts = Array.from({ length: 6 }, (_, index) =>
      executor
        .runAtomic({
          correlationId,
          run: async (session) => {
            const plan = await readAndPlanAcquireResourceClaim(session, {
              ...metadata,
              identity: participantIdentity(
                `booking_claim_emulator_part_${index}`,
                `occurrence_claim_emulator_part_${index}`
              ),
              interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
            });
            await session.transitionToWrites();
            commitResourceClaimPlan(session, plan, metadata);
          },
        })
        .then(() => 'success' as const)
        .catch((error) => error.code as string)
    );

    const results = await Promise.all(attempts);
    expect(results.filter((result) => result === 'success')).toHaveLength(1);
    expect(results.filter((result) => result === 'participant_conflict')).toHaveLength(5);
  });

  it('moves a claim without leaving duplicate guard occupancy', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const original = await acquireInEmulator(
      instructorIdentity('booking_claim_emulator_move', 'occurrence_claim_emulator_move'),
      interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z')
    );

    await executor.runAtomic({
      correlationId,
      run: async (session) => {
        const plan = await readAndPlanMoveResourceClaim(session, {
          ...metadata,
          claimId: original.claimId,
          newInterval: interval('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z'),
          replacementIgnore: replacementIgnoreFromClaim(original),
        });
        await session.transitionToWrites();
        commitResourceClaimPlan(session, plan, metadata);
      },
    });

    const claimDoc = await firestore
      .doc(canonicalPaths.resourceClaim(original.claimId).slice(1))
      .get();
    expect(claimDoc.data()?.interval?.endsAt?.seconds).toBe(
      timestampFromDate(new Date('2026-01-15T11:00:00.000Z')).seconds
    );
  });

  it('serializes duplicate active enrollment guard acquisition', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const courseId = CourseIdSchema.parse('course_claim_emulator_01');
    const firstEnrollment = CourseEnrollmentIdSchema.parse('course_enrollment_claim_emulator_01');
    const secondEnrollment = CourseEnrollmentIdSchema.parse('course_enrollment_claim_emulator_02');

    const attempts = await Promise.all(
      [firstEnrollment, secondEnrollment].map((courseEnrollmentId) =>
        executor
          .runAtomic({
            correlationId,
            run: async (session) => {
              const { guard } = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
                ...metadata,
                participantId,
                courseId,
                courseEnrollmentId,
              });
              await session.transitionToWrites();
              commitAcquireActiveCourseEnrollmentGuard(
                session,
                { ...metadata, participantId, courseId, courseEnrollmentId },
                guard,
                false
              );
            },
          })
          .then(() => 'success' as const)
          .catch((error) => error.code as string)
      )
    );

    expect(attempts.filter((result) => result === 'success')).toHaveLength(1);
    expect(attempts.filter((result) => result === 'duplicate_active_enrollment')).toHaveLength(1);
  });
});
