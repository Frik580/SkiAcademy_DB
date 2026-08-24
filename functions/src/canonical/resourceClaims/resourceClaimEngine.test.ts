import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ResourceClaimIdentityInputSchema,
  ResourceClaimSchema,
  TRANSACTION_SAFETY_BUDGET,
  canonicalPaths,
  expandUtcGuardBuckets,
  resourceClaimGuardIdFromBucketIdentity,
  timestampFromDate,
  AccountIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantManagementIdSchema,
} from '@ski-academy/shared-domain';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanMoveResourceClaim,
  readAndPlanReleaseResourceClaim,
  replacementIgnoreFromClaim,
} from './resourceClaimEngine';
import {
  commitAcquireActiveCourseEnrollmentGuard,
  readAndPlanAcquireActiveCourseEnrollmentGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
  commitAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanReleaseActiveCourseEnrollmentGuard,
  commitReleaseActiveCourseEnrollmentGuard,
} from './uniquenessGuards';

const correlationId = CorrelationIdSchema.parse('correlation_claim_engine_01');
const commandId = CommandIdSchema.parse('command_claim_engine_01');
const instructorId = InstructorIdSchema.parse('instructor_claim_engine_01');
const participantId = ParticipantIdSchema.parse('participant_claim_engine_01');
const decidedAt = new Date('2026-01-15T08:00:00.000Z');
const metadata = { correlationId, commandId, decidedAt };

let sharedExecutor = createInMemoryCanonicalTransactionExecutor();

function resetSharedExecutor(): void {
  sharedExecutor = createInMemoryCanonicalTransactionExecutor();
}

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

async function acquireClaim(
  input: Omit<
    Parameters<typeof readAndPlanAcquireResourceClaim>[1],
    'correlationId' | 'commandId' | 'decidedAt'
  >
) {
  return sharedExecutor.runAtomic({
    correlationId,
    run: async (session) => {
      const plan = await readAndPlanAcquireResourceClaim(session, { ...metadata, ...input });
      await session.transitionToWrites();
      commitResourceClaimPlan(session, plan, metadata);
      return plan.claim;
    },
  });
}

async function moveClaim(
  input: Omit<
    Parameters<typeof readAndPlanMoveResourceClaim>[1],
    'correlationId' | 'commandId' | 'decidedAt'
  >
) {
  return sharedExecutor.runAtomic({
    correlationId,
    run: async (session) => {
      const plan = await readAndPlanMoveResourceClaim(session, { ...metadata, ...input });
      await session.transitionToWrites();
      commitResourceClaimPlan(session, plan, metadata);
      return plan.claim;
    },
  });
}

async function releaseClaim(
  claimId: Parameters<typeof readAndPlanReleaseResourceClaim>[1]['claimId']
) {
  return sharedExecutor.runAtomic({
    correlationId,
    run: async (session) => {
      const plan = await readAndPlanReleaseResourceClaim(session, { ...metadata, claimId });
      await session.transitionToWrites();
      commitResourceClaimPlan(session, plan, metadata);
      return plan.claim;
    },
  });
}

describe('resource claim engine', () => {
  beforeEach(() => {
    resetSharedExecutor();
  });

  it('acquires non-overlapping claims in the same bucket', async () => {
    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const firstPlan = await readAndPlanAcquireResourceClaim(session, {
          ...metadata,
          identity: instructorIdentity('booking_claim_engine_01', 'occurrence_claim_engine_01'),
          interval: interval('2026-01-15T04:00:00.000Z', '2026-01-15T05:00:00.000Z'),
        });
        await session.transitionToWrites();
        commitResourceClaimPlan(session, firstPlan, metadata);
      },
    });

    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const secondPlan = await readAndPlanAcquireResourceClaim(session, {
          ...metadata,
          identity: instructorIdentity('booking_claim_engine_02', 'occurrence_claim_engine_02'),
          interval: interval('2026-01-15T14:00:00.000Z', '2026-01-15T15:00:00.000Z'),
        });
        await session.transitionToWrites();
        commitResourceClaimPlan(session, secondPlan, metadata);
        expect(secondPlan.claim.lifecycle.status).toBe('active');
      },
    });
  });

  it('rejects overlapping instructor claims', async () => {
    await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_03', 'occurrence_claim_engine_03'),
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    });

    await expect(
      acquireClaim({
        identity: instructorIdentity('booking_claim_engine_04', 'occurrence_claim_engine_04'),
        interval: interval('2026-01-15T09:30:00.000Z', '2026-01-15T10:30:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'instructor_conflict' });
  });

  it('rejects overlapping participant claims', async () => {
    await acquireClaim({
      identity: participantIdentity('booking_claim_engine_05', 'occurrence_claim_engine_05'),
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    });

    await expect(
      acquireClaim({
        identity: participantIdentity('booking_claim_engine_06', 'occurrence_claim_engine_06'),
        interval: interval('2026-01-15T09:15:00.000Z', '2026-01-15T10:15:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'participant_conflict' });
  });

  it('preserves the old claim when a move conflicts', async () => {
    const original = await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_07', 'occurrence_claim_engine_07'),
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    });

    await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_08', 'occurrence_claim_engine_08'),
      interval: interval('2026-01-15T11:00:00.000Z', '2026-01-15T12:00:00.000Z'),
    });

    await expect(
      moveClaim({
        claimId: original.claimId,
        newInterval: interval('2026-01-15T11:30:00.000Z', '2026-01-15T12:30:00.000Z'),
        replacementIgnore: replacementIgnoreFromClaim(original),
      })
    ).rejects.toMatchObject({ code: 'instructor_conflict' });

    const snapshot = sharedExecutor.snapshot();
    const claim = ResourceClaimSchema.parse(
      snapshot.docs.get(canonicalPaths.resourceClaim(original.claimId).slice(1))?.data
    );
    expect(claim.interval).toEqual(original.interval);
  });

  it('moves a claim to a new non-conflicting interval', async () => {
    const original = await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_09', 'occurrence_claim_engine_09'),
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    });

    const moved = await moveClaim({
      claimId: original.claimId,
      newInterval: interval('2026-01-15T10:00:00.000Z', '2026-01-15T11:00:00.000Z'),
      replacementIgnore: replacementIgnoreFromClaim(original),
    });

    expect(moved.interval.endsAt.seconds).toBe(
      timestampFromDate(new Date('2026-01-15T11:00:00.000Z')).seconds
    );
  });

  it('releases a claim and removes guard occupancy', async () => {
    const acquired = await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_10', 'occurrence_claim_engine_10'),
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    });

    const released = await releaseClaim(acquired.claimId);
    expect(released.lifecycle.status).toBe('released');

    await acquireClaim({
      identity: instructorIdentity('booking_claim_engine_11', 'occurrence_claim_engine_11'),
      interval: interval('2026-01-15T09:30:00.000Z', '2026-01-15T10:30:00.000Z'),
    });
  });

  it('is replay-safe for identical acquire requests', async () => {
    const identity = instructorIdentity('booking_claim_engine_12', 'occurrence_claim_engine_12');
    const request = {
      identity,
      interval: interval('2026-01-15T09:00:00.000Z', '2026-01-15T10:00:00.000Z'),
    };

    const first = await acquireClaim(request);
    const second = await acquireClaim(request);
    expect(second.claimId).toBe(first.claimId);
    expect(second.revision).toBe(first.revision);
  });

  it('fails oversized claim plans before writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const identity = instructorIdentity('booking_claim_engine_13', 'occurrence_claim_engine_13');

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          await readAndPlanAcquireResourceClaim(session, {
            ...metadata,
            identity,
            interval: interval('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'),
          });
          for (let index = 0; index < TRANSACTION_SAFETY_BUDGET.maxMutations; index += 1) {
            session.plan.planMutation({
              path: `synthetic/mutation_${index}`,
              kind: 'create',
              category: 'other',
              estimatedPayloadBytes: 4096,
            });
          }
          await session.transitionToWrites();
        },
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });

    expect(executor.snapshot().writesAttempted).toBe(0);
  });

  it('rejects saturated guard buckets before writes', async () => {
    const candidateInterval = interval('2026-01-15T09:00:00.000Z', '2026-01-15T09:01:00.000Z');
    const [bucket] = expandUtcGuardBuckets('instructor', instructorId, candidateInterval);
    const guardId = resourceClaimGuardIdFromBucketIdentity(bucket!.bucketIdentity);
    const guardPath = canonicalPaths.resourceClaimGuard(guardId).slice(1);
    const entries = Array.from({ length: 256 }, (_, index) => {
      const startMinute = 4 * 60 + index;
      const startHour = Math.floor(startMinute / 60);
      const startMin = startMinute % 60;
      const endMinute = startMinute + 1;
      const endHour = Math.floor(endMinute / 60);
      const endMin = endMinute % 60;
      const pad = (value: number) => String(value).padStart(2, '0');
      return {
        claimId: `resource_claim_saturated_${String(index).padStart(3, '0')}`,
        ownerKind: 'booking',
        ownerId: `booking_saturated_${index}`,
        occurrenceId: `occurrence_saturated_${String(index).padStart(3, '0')}`,
        interval: interval(
          `2026-01-15T${pad(startHour)}:${pad(startMin)}:00.000Z`,
          `2026-01-15T${pad(endHour)}:${pad(endMin)}:00.000Z`
        ),
        lifecycleStatus: 'active',
      };
    });

    const executor = createInMemoryCanonicalTransactionExecutor({
      [guardPath]: {
        guardId,
        strategyVersion: 'guard:v1',
        bucketKey: bucket!.bucketKey,
        resourceKind: 'instructor',
        resourceId: instructorId,
        bucketStartAt: bucket!.bucketStartAt,
        entries,
        revision: 1,
        updatedAt: timestampFromDate(decidedAt),
        lastChangedByCommandId: commandId,
        correlationId,
      },
    });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          await readAndPlanAcquireResourceClaim(session, {
            ...metadata,
            identity: instructorIdentity(
              'booking_claim_engine_saturated',
              'occurrence_claim_engine_saturated'
            ),
            interval: candidateInterval,
          });
          await session.transitionToWrites();
        },
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });

    expect(executor.snapshot().writesAttempted).toBe(0);
  });
});

describe('uniqueness guards', () => {
  beforeEach(() => {
    resetSharedExecutor();
  });

  const courseId = CourseIdSchema.parse('course_claim_engine_01');
  const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_claim_engine_01');
  const otherEnrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_claim_engine_02');

  it('rejects duplicate active participant+course enrollment guards', async () => {
    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const { guard } = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
          ...metadata,
          participantId,
          courseId,
          courseEnrollmentId: enrollmentId,
        });
        await session.transitionToWrites();
        commitAcquireActiveCourseEnrollmentGuard(
          session,
          { ...metadata, participantId, courseId, courseEnrollmentId: enrollmentId },
          guard,
          false
        );
      },
    });

    await expect(
      sharedExecutor.runAtomic({
        correlationId,
        run: async (session) => {
          await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
            ...metadata,
            participantId,
            courseId,
            courseEnrollmentId: otherEnrollmentId,
          });
        },
      })
    ).rejects.toMatchObject({ code: 'duplicate_active_enrollment' });
  });

  it('releases active enrollment guards', async () => {
    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const { guard } = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
          ...metadata,
          participantId,
          courseId,
          courseEnrollmentId: enrollmentId,
        });
        await session.transitionToWrites();
        commitAcquireActiveCourseEnrollmentGuard(
          session,
          { ...metadata, participantId, courseId, courseEnrollmentId: enrollmentId },
          guard,
          false
        );
      },
    });

    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const shouldDelete = await readAndPlanReleaseActiveCourseEnrollmentGuard(session, {
          ...metadata,
          participantId,
          courseId,
          courseEnrollmentId: enrollmentId,
        });
        await session.transitionToWrites();
        if (shouldDelete) {
          commitReleaseActiveCourseEnrollmentGuard(session, {
            ...metadata,
            participantId,
            courseId,
            courseEnrollmentId: enrollmentId,
          });
        }
      },
    });

    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const { guard } = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
          ...metadata,
          participantId,
          courseId,
          courseEnrollmentId: otherEnrollmentId,
        });
        await session.transitionToWrites();
        commitAcquireActiveCourseEnrollmentGuard(
          session,
          { ...metadata, participantId, courseId, courseEnrollmentId: otherEnrollmentId },
          guard,
          false
        );
      },
    });
  });

  it('rejects concurrent active managing owners for the same participant', async () => {
    const accountA = AccountIdSchema.parse('account_claim_engine_01');
    const accountB = AccountIdSchema.parse('account_claim_engine_02');
    const managementA = ParticipantManagementIdSchema.parse('participant_management_claim_01');
    const managementB = ParticipantManagementIdSchema.parse('participant_management_claim_02');

    await sharedExecutor.runAtomic({
      correlationId,
      run: async (session) => {
        const { guard } = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
          ...metadata,
          participantId,
          accountId: accountA,
          participantManagementId: managementA,
          managementRevision: 1,
        });
        await session.transitionToWrites();
        commitAcquireParticipantManagementActiveOwnerGuard(
          session,
          {
            ...metadata,
            participantId,
            accountId: accountA,
            participantManagementId: managementA,
            managementRevision: 1,
          },
          guard,
          false
        );
      },
    });

    await expect(
      sharedExecutor.runAtomic({
        correlationId,
        run: async (session) => {
          await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
            ...metadata,
            participantId,
            accountId: accountB,
            participantManagementId: managementB,
            managementRevision: 1,
          });
        },
      })
    ).rejects.toMatchObject({ code: 'blocked_relationship' });
  });
});
