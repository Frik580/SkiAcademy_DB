import { z } from 'zod';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  ResourceClaimGuardIdSchema,
  type CorrelationId,
  type CourseEnrollmentId,
  type CourseId,
  type ParticipantId,
  type ResourceClaimGuardId,
  type ResourceClaimId,
  activeCourseEnrollmentGuardKey,
  type ActiveCourseEnrollmentGuardKey,
} from './identifiers';
import { canonicalDeterministicHash } from './deterministicIdentity';
import { CanonicalCommandError } from './errors';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  TimeIntervalSchema,
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
  type TimeInterval,
} from './primitives';
import {
  RESOURCE_GUARD_BUCKET_HOURS,
  RESOURCE_GUARD_STRATEGY_VERSION,
  ResourceClaimGuardBucketIdentityInputSchema,
  intervalsConflict,
  resourceClaimGuardBucketKeyFromIdentity,
  type ResourceClaimGuardEntry,
  type ResourceClaimGuardBucketIdentityInput,
  type ResourceKind,
} from './resourceClaims';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const RESOURCE_GUARD_BUCKET_SECONDS = RESOURCE_GUARD_BUCKET_HOURS * 60 * 60;

export const RESOURCE_CLAIM_PLANNING_ESTIMATES = {
  claimDocumentBytes: 512,
  guardDocumentBaseBytes: 256,
  guardEntryBytes: 192,
  activeEnrollmentGuardBytes: 384,
  activeOwnerGuardBytes: 320,
} as const;

export const RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET = 256 as const;

export interface ResourceClaimReplacementIgnore {
  readonly claimId?: ResourceClaimId;
  readonly ownerKind?: ResourceClaimGuardEntry['ownerKind'];
  readonly ownerId?: string;
  readonly occurrenceId?: ResourceClaimGuardEntry['occurrenceId'];
}

export interface UtcGuardBucket {
  readonly bucketStartSeconds: number;
  readonly bucketStartAt: CanonicalTimestamp;
  readonly bucketKey: string;
  readonly bucketIdentity: z.output<typeof ResourceClaimGuardBucketIdentityInputSchema>;
}

export function utcBucketStartSecondsForInstant(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    throw new RangeError('seconds must be finite');
  }
  const floored = Math.floor(seconds);
  return Math.floor(floored / RESOURCE_GUARD_BUCKET_SECONDS) * RESOURCE_GUARD_BUCKET_SECONDS;
}

export function canonicalTimestampForUtcBucketStart(
  bucketStartSeconds: number
): CanonicalTimestamp {
  return CanonicalTimestampSchema.parse({
    seconds: bucketStartSeconds,
    nanoseconds: 0,
  });
}

export function expandUtcGuardBuckets(
  resourceKind: ResourceKind,
  resourceId: string,
  interval: TimeInterval
): readonly UtcGuardBucket[] {
  TimeIntervalSchema.parse(interval);

  const buckets: UtcGuardBucket[] = [];

  let bucketStartSeconds = utcBucketStartSecondsForInstant(interval.startsAt.seconds);
  while (compareCanonicalTimestamps(canonicalTimestampForUtcBucketStart(bucketStartSeconds), interval.endsAt) < 0) {
    const bucketIdentity = ResourceClaimGuardBucketIdentityInputSchema.parse({
      strategyVersion: RESOURCE_GUARD_STRATEGY_VERSION,
      resourceKind,
      resourceId,
      bucketStartSeconds,
    });
    buckets.push({
      bucketStartSeconds,
      bucketStartAt: canonicalTimestampForUtcBucketStart(bucketStartSeconds),
      bucketKey: resourceClaimGuardBucketKeyFromIdentity(bucketIdentity),
      bucketIdentity,
    });
    bucketStartSeconds += RESOURCE_GUARD_BUCKET_SECONDS;
  }

  return buckets;
}

export function resourceClaimGuardIdFromBucketKey(bucketKey: string): ResourceClaimGuardId {
  return ResourceClaimGuardIdSchema.parse(
    canonicalDeterministicHash(['resource_claim_guard:v1', bucketKey])
  );
}

export function resourceClaimGuardIdFromBucketIdentity(
  input: ResourceClaimGuardBucketIdentityInput
): ResourceClaimGuardId {
  const bucketKey = resourceClaimGuardBucketKeyFromIdentity(input);
  return resourceClaimGuardIdFromBucketKey(bucketKey);
}

export function guardEntryParticipatesInConflict(entry: ResourceClaimGuardEntry): boolean {
  return entry.lifecycleStatus === 'active' || entry.lifecycleStatus === 'frozen';
}

export function shouldIgnoreGuardEntry(
  entry: ResourceClaimGuardEntry,
  ignore: ResourceClaimReplacementIgnore | undefined
): boolean {
  if (!ignore) {
    return false;
  }

  if (ignore.claimId !== undefined && entry.claimId === ignore.claimId) {
    return true;
  }

  if (
    ignore.ownerKind !== undefined &&
    ignore.ownerId !== undefined &&
    ignore.occurrenceId !== undefined &&
    entry.ownerKind === ignore.ownerKind &&
    entry.ownerId === ignore.ownerId &&
    entry.occurrenceId === ignore.occurrenceId
  ) {
    return true;
  }

  return false;
}

export function findGuardIntervalConflict(
  candidate: TimeInterval,
  entries: readonly ResourceClaimGuardEntry[],
  ignore: ResourceClaimReplacementIgnore | undefined
): ResourceClaimGuardEntry | undefined {
  TimeIntervalSchema.parse(candidate);

  for (const entry of entries) {
    if (!guardEntryParticipatesInConflict(entry)) {
      continue;
    }
    if (shouldIgnoreGuardEntry(entry, ignore)) {
      continue;
    }
    if (intervalsConflict(candidate, entry.interval)) {
      return entry;
    }
  }

  return undefined;
}

export function conflictErrorCodeForResourceKind(
  resourceKind: ResourceKind
): 'instructor_conflict' | 'participant_conflict' | 'resource_conflict' {
  if (resourceKind === 'instructor') {
    return 'instructor_conflict';
  }
  if (resourceKind === 'participant') {
    return 'participant_conflict';
  }
  return 'resource_conflict';
}

export function estimateGuardMutationBytes(entryCount: number): number {
  return (
    RESOURCE_CLAIM_PLANNING_ESTIMATES.guardDocumentBaseBytes +
    entryCount * RESOURCE_CLAIM_PLANNING_ESTIMATES.guardEntryBytes
  );
}

export function assertGuardBucketEntryCapacity(
  correlationId: CorrelationId,
  entryCount: number
): void {
  if (entryCount > RESOURCE_GUARD_MAX_ENTRIES_PER_BUCKET) {
    throw new CanonicalCommandError('operation_too_large', {
      correlationId,
      details: { reason: 'out_of_range' },
    });
  }
}

export function mergeGuardEntries(
  existing: readonly ResourceClaimGuardEntry[],
  incoming: ResourceClaimGuardEntry,
  correlationId: CorrelationId
): ResourceClaimGuardEntry[] {
  const withoutIncoming = existing.filter((entry) => entry.claimId !== incoming.claimId);
  const merged = [...withoutIncoming, incoming];
  assertGuardBucketEntryCapacity(correlationId, merged.length);
  return merged;
}

export function removeGuardEntryByClaimId(
  existing: readonly ResourceClaimGuardEntry[],
  claimId: ResourceClaimId
): ResourceClaimGuardEntry[] {
  return existing.filter((entry) => entry.claimId !== claimId);
}

export const ActiveCourseEnrollmentGuardSchema = z
  .object({
    guardKey: z.string(),
    participantId: ParticipantIdSchema,
    courseId: CourseIdSchema,
    courseEnrollmentId: CourseEnrollmentIdSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict()
  .superRefine((guard, context) => {
    const expectedKey = activeCourseEnrollmentGuardKey(guard.participantId, guard.courseId);
    if (guard.guardKey !== expectedKey) {
      context.addIssue({
        code: 'custom',
        path: ['guardKey'],
        message: 'guardKey must match deterministic participant and course inputs',
      });
    }

    if (compareCanonicalTimestamps(guard.updatedAt, guard.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }
  });

export type ActiveCourseEnrollmentGuard = Readonly<
  z.output<typeof ActiveCourseEnrollmentGuardSchema>
>;

export function buildActiveCourseEnrollmentGuard(input: {
  readonly participantId: ParticipantId;
  readonly courseId: CourseId;
  readonly courseEnrollmentId: CourseEnrollmentId;
  readonly revision: number;
  readonly createdAt: CanonicalTimestamp;
  readonly updatedAt: CanonicalTimestamp;
  readonly lastChangedByCommandId: z.output<typeof CommandIdSchema>;
  readonly correlationId: z.output<typeof CorrelationIdSchema>;
}): ActiveCourseEnrollmentGuard {
  const guardKey = activeCourseEnrollmentGuardKey(input.participantId, input.courseId);
  return ActiveCourseEnrollmentGuardSchema.parse({
    guardKey,
    participantId: input.participantId,
    courseId: input.courseId,
    courseEnrollmentId: input.courseEnrollmentId,
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastChangedByCommandId: input.lastChangedByCommandId,
    correlationId: input.correlationId,
  });
}

export function assertDistinctActiveCourseEnrollmentGuard(
  correlationId: z.output<typeof CorrelationIdSchema>,
  existing: ActiveCourseEnrollmentGuard | undefined,
  expectedEnrollmentId: CourseEnrollmentId
): void {
  if (existing === undefined) {
    return;
  }

  if (existing.courseEnrollmentId === expectedEnrollmentId) {
    return;
  }

  throw new CanonicalCommandError('duplicate_active_enrollment', { correlationId });
}

export function activeCourseEnrollmentGuardKeyMatches(
  guardKey: ActiveCourseEnrollmentGuardKey,
  participantId: ParticipantId,
  courseId: CourseId
): boolean {
  return guardKey === activeCourseEnrollmentGuardKey(participantId, courseId);
}
