import {
  CanonicalCommandError,
  ResourceClaimGuardSchema,
  ResourceClaimGuardEntrySchema,
  ResourceClaimSchema,
  RESOURCE_CLAIM_STRATEGY_VERSION,
  buildResourceClaimIdentityInput,
  canonicalPaths,
  conflictErrorCodeForResourceKind,
  estimateGuardMutationBytes,
  expandUtcGuardBuckets,
  findGuardIntervalConflict,
  mergeGuardEntries,
  nextAggregateRevision,
  removeGuardEntryByClaimId,
  resourceClaimGuardIdFromBucketIdentity,
  resourceClaimIdFromIdentity,
  timestampFromDate,
  RESOURCE_CLAIM_PLANNING_ESTIMATES,
  normalizeFirestoreDocument,
  type CommandId,
  type CorrelationId,
  type ResourceClaim,
  type ResourceClaimGuard,
  type ResourceClaimGuardEntry,
  type ResourceClaimId,
  type ResourceClaimIdentityInput,
  type ResourceClaimReplacementIgnore,
  type TimeInterval,
  type UtcGuardBucket,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';

export interface ResourceClaimCommandMetadata {
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly decidedAt: Date;
}

export interface AcquireResourceClaimInput extends ResourceClaimCommandMetadata {
  readonly identity: ResourceClaimIdentityInput;
  readonly interval: TimeInterval;
  readonly replacementIgnore?: ResourceClaimReplacementIgnore;
}

export interface MoveResourceClaimInput extends ResourceClaimCommandMetadata {
  readonly claimId: ResourceClaimId;
  readonly newInterval: TimeInterval;
  readonly replacementIgnore?: ResourceClaimReplacementIgnore;
}

export interface ReleaseResourceClaimInput extends ResourceClaimCommandMetadata {
  readonly claimId: ResourceClaimId;
}

interface LoadedGuardBucket {
  readonly bucket: UtcGuardBucket;
  readonly guardId: ReturnType<typeof resourceClaimGuardIdFromBucketIdentity>;
  readonly path: string;
  readonly existing: ResourceClaimGuard | undefined;
  readonly documentExists: boolean;
  readonly conflictEntries: readonly ResourceClaimGuardEntry[];
}

export interface ResourceClaimOperationPlan {
  readonly claim: ResourceClaim;
  readonly claimPath: string;
  readonly claimMutationKind: 'create' | 'update';
  readonly guardBuckets: readonly LoadedGuardBucket[];
  readonly guardWrites: readonly {
    readonly bucket: UtcGuardBucket;
    readonly guardId: ReturnType<typeof resourceClaimGuardIdFromBucketIdentity>;
    readonly path: string;
    readonly mutationKind: 'create' | 'update' | 'delete';
    readonly entries: readonly ResourceClaimGuardEntry[];
    readonly revision: number;
  }[];
  readonly releaseOldBuckets?: readonly LoadedGuardBucket[];
}

function claimPathFor(claimId: ResourceClaimId): string {
  return canonicalPaths.resourceClaim(claimId).slice(1);
}

function guardPathFor(guardId: ReturnType<typeof resourceClaimGuardIdFromBucketIdentity>): string {
  return canonicalPaths.resourceClaimGuard(guardId).slice(1);
}

function parseClaim(data: Record<string, unknown> | undefined): ResourceClaim | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) {
    return undefined;
  }
  const parsed = ResourceClaimSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function parseGuard(data: Record<string, unknown> | undefined): ResourceClaimGuard | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) {
    return undefined;
  }
  const parsed = ResourceClaimGuardSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function parseGuardEntries(data: Record<string, unknown> | undefined): ResourceClaimGuardEntry[] {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized || !Array.isArray(normalized.entries)) {
    return [];
  }

  const entries: ResourceClaimGuardEntry[] = [];
  for (const rawEntry of normalized.entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      continue;
    }
    const parsed = ResourceClaimGuardEntrySchema.safeParse(rawEntry);
    if (parsed.success) {
      entries.push(parsed.data);
    }
  }
  return entries;
}

function conflictEntriesForBucket(
  existing: ResourceClaimGuard | undefined,
  rawData: Record<string, unknown> | undefined
): readonly ResourceClaimGuardEntry[] {
  if (existing) {
    return existing.entries;
  }
  return parseGuardEntries(rawData);
}

function buildGuardEntry(claim: ResourceClaim): ResourceClaimGuardEntry {
  return {
    claimId: claim.claimId,
    ownerKind: claim.ownerKind,
    ownerId: claim.ownerId,
    occurrenceId: claim.occurrenceId,
    interval: claim.interval,
    lifecycleStatus: claim.lifecycle.status === 'released' ? 'released' : claim.lifecycle.status,
  };
}

function guardOccupancyMatchesClaim(
  buckets: readonly LoadedGuardBucket[],
  claim: ResourceClaim
): boolean {
  const expectedBuckets = expandUtcGuardBuckets(
    claim.resourceKind,
    claim.resourceId,
    claim.interval
  );
  const expectedKeys = new Set(expectedBuckets.map((bucket) => bucket.bucketKey));

  for (const bucket of buckets) {
    if (!expectedKeys.has(bucket.bucket.bucketKey)) {
      continue;
    }
    const hasEntry = bucket.conflictEntries.some(
      (entry) =>
        entry.claimId === claim.claimId &&
        entry.lifecycleStatus !== 'released' &&
        intervalsEqual(entry.interval, claim.interval)
    );
    if (!hasEntry) {
      return false;
    }
  }

  return true;
}

function intervalsEqual(left: TimeInterval, right: TimeInterval): boolean {
  return (
    left.startsAt.seconds === right.startsAt.seconds &&
    left.startsAt.nanoseconds === right.startsAt.nanoseconds &&
    left.endsAt.seconds === right.endsAt.seconds &&
    left.endsAt.nanoseconds === right.endsAt.nanoseconds
  );
}
function activeClaimMatches(
  existing: ResourceClaim,
  identity: ResourceClaimIdentityInput,
  interval: TimeInterval
): boolean {
  return (
    existing.strategyVersion === identity.strategyVersion &&
    existing.claimKind === identity.claimKind &&
    existing.resourceKind === identity.resourceKind &&
    existing.resourceId === identity.resourceId &&
    existing.ownerKind === identity.ownerKind &&
    existing.ownerId === identity.ownerId &&
    existing.occurrenceId === identity.occurrenceId &&
    intervalsEqual(existing.interval, interval) &&
    (existing.lifecycle.status === 'active' || existing.lifecycle.status === 'frozen')
  );
}

function planGuardRead(
  session: CanonicalAtomicTransactionSession,
  bucket: UtcGuardBucket
): LoadedGuardBucket {
  const guardId = resourceClaimGuardIdFromBucketIdentity(bucket.bucketIdentity);
  const path = guardPathFor(guardId);
  session.plan.planRead({ path, category: 'resource_guard' });
  return {
    bucket,
    guardId,
    path,
    existing: undefined,
    documentExists: false,
    conflictEntries: [],
  };
}

async function loadGuardBuckets(
  session: CanonicalAtomicTransactionSession,
  buckets: readonly UtcGuardBucket[]
): Promise<LoadedGuardBucket[]> {
  const planned = buckets.map((bucket) => planGuardRead(session, bucket));
  const loaded: LoadedGuardBucket[] = [];

  for (const item of planned) {
    const snapshot = await session.tx.get({ path: item.path });
    const rawData = snapshot.exists ? snapshot.data : undefined;
    const existing = rawData ? parseGuard(rawData) : undefined;
    loaded.push({
      ...item,
      existing,
      documentExists: snapshot.exists,
      conflictEntries: conflictEntriesForBucket(existing, rawData),
    });
  }

  return loaded;
}

function conflictDetailsResourceKind(
  resourceKind: ResourceClaim['resourceKind']
): 'participant' | 'instructor' | 'course' | undefined {
  if (
    resourceKind === 'instructor' ||
    resourceKind === 'participant' ||
    resourceKind === 'course'
  ) {
    return resourceKind;
  }
  return undefined;
}

function assertNoIntervalConflict(
  correlationId: CorrelationId,
  resourceKind: ResourceClaim['resourceKind'],
  candidate: TimeInterval,
  buckets: readonly LoadedGuardBucket[],
  ignore: ResourceClaimReplacementIgnore | undefined
): void {
  for (const bucket of buckets) {
    const entries = bucket.conflictEntries;
    const conflict = findGuardIntervalConflict(candidate, entries, ignore);
    if (conflict) {
      throw new CanonicalCommandError(conflictErrorCodeForResourceKind(resourceKind), {
        correlationId,
        details: {
          reason: 'conflict',
          ...(conflictDetailsResourceKind(resourceKind) === undefined
            ? {}
            : { resourceKind: conflictDetailsResourceKind(resourceKind) }),
        },
      });
    }
  }
}

function buildClaimDocument(
  input: AcquireResourceClaimInput,
  existing: ResourceClaim | undefined
): ResourceClaim {
  const decidedAt = timestampFromDate(input.decidedAt);
  const claimId = resourceClaimIdFromIdentity(input.identity);
  const revision = existing ? nextAggregateRevision(existing.revision) : 1;

  return ResourceClaimSchema.parse({
    claimId,
    strategyVersion: RESOURCE_CLAIM_STRATEGY_VERSION,
    claimKind: input.identity.claimKind,
    resourceKind: input.identity.resourceKind,
    resourceId: input.identity.resourceId,
    ownerKind: input.identity.ownerKind,
    ownerId: input.identity.ownerId,
    occurrenceId: input.identity.occurrenceId,
    interval: input.interval,
    lifecycle: { status: 'active' },
    revision,
    correlationId: input.correlationId,
    lastChangedByCommandId: input.commandId,
    createdAt: existing?.createdAt ?? decidedAt,
    updatedAt: decidedAt,
  });
}

function planGuardWritesForAcquire(
  claim: ResourceClaim,
  buckets: readonly LoadedGuardBucket[]
): ResourceClaimOperationPlan['guardWrites'] {
  const entry = buildGuardEntry(claim);

  return buckets.map((bucket) => {
    const mergedEntries = mergeGuardEntries(bucket.conflictEntries, entry);
    const mutationKind = bucket.documentExists ? 'update' : 'create';

    return {
      bucket: bucket.bucket,
      guardId: bucket.guardId,
      path: bucket.path,
      mutationKind,
      entries: mergedEntries,
      revision: bucket.existing ? nextAggregateRevision(bucket.existing.revision) : 1,
    };
  });
}

function planGuardDocumentWrite(
  write: ResourceClaimOperationPlan['guardWrites'][number],
  metadata: ResourceClaimCommandMetadata
): Record<string, unknown> {
  const decidedAt = timestampFromDate(metadata.decidedAt);
  return {
    guardId: write.guardId,
    strategyVersion: 'guard:v1',
    bucketKey: write.bucket.bucketKey,
    resourceKind: write.bucket.bucketIdentity.resourceKind,
    resourceId: write.bucket.bucketIdentity.resourceId,
    bucketStartAt: write.bucket.bucketStartAt,
    entries: write.entries,
    revision: write.revision,
    updatedAt: decidedAt,
    lastChangedByCommandId: metadata.commandId,
    correlationId: metadata.correlationId,
  };
}

function planBudgetForOperation(
  session: CanonicalAtomicTransactionSession,
  plan: Pick<ResourceClaimOperationPlan, 'claimPath' | 'claimMutationKind' | 'guardWrites'>
): void {
  session.plan.planMutation({
    path: plan.claimPath,
    kind: plan.claimMutationKind,
    category: 'resource_claim',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.claimDocumentBytes,
  });

  for (const guardWrite of plan.guardWrites) {
    session.plan.planMutation({
      path: guardWrite.path,
      kind: guardWrite.mutationKind === 'delete' ? 'delete' : guardWrite.mutationKind,
      category: 'resource_guard',
      estimatedPayloadBytes: estimateGuardMutationBytes(guardWrite.entries.length),
    });
  }
}

export async function readAndPlanAcquireResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: AcquireResourceClaimInput
): Promise<ResourceClaimOperationPlan> {
  const claimId = resourceClaimIdFromIdentity(input.identity);
  const claimPath = claimPathFor(claimId);

  session.plan.planRead({ path: claimPath, category: 'resource_claim' });
  const claimSnapshot = await session.tx.get({ path: claimPath });
  const existingClaim = claimSnapshot.exists ? parseClaim(claimSnapshot.data) : undefined;

  if (existingClaim && activeClaimMatches(existingClaim, input.identity, input.interval)) {
    const buckets = await loadGuardBuckets(
      session,
      expandUtcGuardBuckets(input.identity.resourceKind, input.identity.resourceId, input.interval)
    );
    if (guardOccupancyMatchesClaim(buckets, existingClaim)) {
      return {
        claim: existingClaim,
        claimPath,
        claimMutationKind: 'update',
        guardBuckets: buckets,
        guardWrites: [],
      };
    }

    const repairWrites = planGuardWritesForAcquire(existingClaim, buckets);
    return {
      claim: existingClaim,
      claimPath,
      claimMutationKind: 'update',
      guardBuckets: buckets,
      guardWrites: repairWrites,
    };
  }

  if (
    existingClaim &&
    existingClaim.claimId === claimId &&
    !intervalsEqual(existingClaim.interval, input.interval)
  ) {
    return readAndPlanMoveResourceClaim(session, {
      correlationId: input.correlationId,
      commandId: input.commandId,
      decidedAt: input.decidedAt,
      claimId,
      newInterval: input.interval,
      replacementIgnore:
        input.replacementIgnore ?? replacementIgnoreFromClaim(existingClaim),
    });
  }

  const replacementIgnore =
    input.replacementIgnore ??
    (existingClaim ? replacementIgnoreFromClaim(existingClaim) : undefined);

  const newBuckets = expandUtcGuardBuckets(
    input.identity.resourceKind,
    input.identity.resourceId,
    input.interval
  );
  const oldBuckets =
    existingClaim === undefined
      ? []
      : expandUtcGuardBuckets(
          existingClaim.resourceKind,
          existingClaim.resourceId,
          existingClaim.interval
        );
  const bucketMap = new Map<string, UtcGuardBucket>();
  for (const bucket of [...oldBuckets, ...newBuckets]) {
    bucketMap.set(bucket.bucketKey, bucket);
  }
  const buckets = await loadGuardBuckets(session, [...bucketMap.values()]);

  assertNoIntervalConflict(
    input.correlationId,
    input.identity.resourceKind,
    input.interval,
    buckets,
    replacementIgnore
  );

  const claim = buildClaimDocument(input, existingClaim);
  const newBucketKeys = new Set(newBuckets.map((bucket) => bucket.bucketKey));
  const oldBucketKeys = new Set(oldBuckets.map((bucket) => bucket.bucketKey));
  const entry = buildGuardEntry(claim);

  const guardWrites = buckets
    .map((bucket) => {
      const inOld = oldBucketKeys.has(bucket.bucket.bucketKey);
      const inNew = newBucketKeys.has(bucket.bucket.bucketKey);
      let entries = [...bucket.conflictEntries];

      if (inOld && existingClaim) {
        entries = removeGuardEntryByClaimId(entries, existingClaim.claimId);
      }
      if (inNew) {
        entries = mergeGuardEntries(entries, entry);
      }

      if (entries.length === 0) {
        return bucket.documentExists
          ? {
              bucket: bucket.bucket,
              guardId: bucket.guardId,
              path: bucket.path,
              mutationKind: 'delete' as const,
              entries,
              revision: bucket.existing
                ? nextAggregateRevision(bucket.existing.revision)
                : 1,
            }
          : undefined;
      }

      const mutationKind = bucket.documentExists ? ('update' as const) : ('create' as const);
      return {
        bucket: bucket.bucket,
        guardId: bucket.guardId,
        path: bucket.path,
        mutationKind,
        entries,
        revision: bucket.existing ? nextAggregateRevision(bucket.existing.revision) : 1,
      };
    })
    .filter((write): write is NonNullable<typeof write> => write !== undefined);

  const plan: ResourceClaimOperationPlan = {
    claim,
    claimPath,
    claimMutationKind: existingClaim ? 'update' : 'create',
    guardBuckets: buckets,
    guardWrites,
  };

  session.plan.planMutation({
    path: claimPath,
    kind: plan.claimMutationKind,
    category: 'resource_claim',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.claimDocumentBytes,
  });

  for (const guardWrite of guardWrites) {
    session.plan.planMutation({
      path: guardWrite.path,
      kind: guardWrite.mutationKind,
      category: 'resource_guard',
      estimatedPayloadBytes: estimateGuardMutationBytes(guardWrite.entries.length),
    });
  }

  return plan;
}

export function commitResourceClaimPlan(
  session: CanonicalAtomicTransactionSession,
  plan: ResourceClaimOperationPlan,
  metadata: ResourceClaimCommandMetadata
): void {
  if (plan.guardWrites.length === 0 && plan.claimMutationKind === 'update') {
    return;
  }

  const claimPayload = {
    ...plan.claim,
    updatedAt: timestampFromDate(metadata.decidedAt),
    lastChangedByCommandId: metadata.commandId,
    correlationId: metadata.correlationId,
  };

  if (plan.claimMutationKind === 'create') {
    session.tx.create({ path: plan.claimPath }, claimPayload as Record<string, unknown>);
  } else {
    session.tx.update({ path: plan.claimPath }, claimPayload as Record<string, unknown>);
  }

  for (const guardWrite of plan.guardWrites) {
    const payload = planGuardDocumentWrite(guardWrite, metadata);
    if (guardWrite.mutationKind === 'create') {
      session.tx.create({ path: guardWrite.path }, payload);
      continue;
    }
    if (guardWrite.mutationKind === 'delete') {
      session.tx.delete({ path: guardWrite.path });
      continue;
    }
    session.tx.update({ path: guardWrite.path }, payload);
  }
}

export async function acquireResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: AcquireResourceClaimInput
): Promise<ResourceClaim> {
  const plan = await readAndPlanAcquireResourceClaim(session, input);
  if (session.tx.phase !== 'writes') {
    return plan.claim;
  }
  commitResourceClaimPlan(session, plan, input);
  return plan.claim;
}

export async function readAndPlanMoveResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: MoveResourceClaimInput
): Promise<ResourceClaimOperationPlan> {
  const claimPath = claimPathFor(input.claimId);
  session.plan.planRead({ path: claimPath, category: 'resource_claim' });
  const claimSnapshot = await session.tx.get({ path: claimPath });
  const existingClaim = parseClaim(claimSnapshot.data);

  if (!existingClaim) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'claimId', reason: 'required' },
    });
  }

  if (existingClaim.lifecycle.status === 'released') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: input.correlationId,
    });
  }

  const ignore: ResourceClaimReplacementIgnore = input.replacementIgnore ?? {
    claimId: existingClaim.claimId,
    ownerKind: existingClaim.ownerKind,
    ownerId: existingClaim.ownerId,
    occurrenceId: existingClaim.occurrenceId,
  };

  const oldBuckets = expandUtcGuardBuckets(
    existingClaim.resourceKind,
    existingClaim.resourceId,
    existingClaim.interval
  );
  const newBuckets = expandUtcGuardBuckets(
    existingClaim.resourceKind,
    existingClaim.resourceId,
    input.newInterval
  );

  const bucketMap = new Map<string, UtcGuardBucket>();
  for (const bucket of [...oldBuckets, ...newBuckets]) {
    bucketMap.set(bucket.bucketKey, bucket);
  }
  const unionBuckets = [...bucketMap.values()];

  const loadedBuckets = await loadGuardBuckets(session, unionBuckets);
  assertNoIntervalConflict(
    input.correlationId,
    existingClaim.resourceKind,
    input.newInterval,
    loadedBuckets,
    ignore
  );

  const decidedAt = timestampFromDate(input.decidedAt);
  const movedClaim = ResourceClaimSchema.parse({
    ...existingClaim,
    interval: input.newInterval,
    revision: nextAggregateRevision(existingClaim.revision),
    updatedAt: decidedAt,
    lastChangedByCommandId: input.commandId,
    correlationId: input.correlationId,
  });

  const newEntry = buildGuardEntry(movedClaim);
  const oldBucketKeys = new Set(oldBuckets.map((bucket) => bucket.bucketKey));
  const newBucketKeys = new Set(newBuckets.map((bucket) => bucket.bucketKey));

  const guardWrites = loadedBuckets
    .map((bucket) => {
      const inOld = oldBucketKeys.has(bucket.bucket.bucketKey);
      const inNew = newBucketKeys.has(bucket.bucket.bucketKey);
      let entries = [...bucket.conflictEntries];

      if (inOld) {
        entries = removeGuardEntryByClaimId(entries, existingClaim.claimId);
      }
      if (inNew) {
        entries = mergeGuardEntries(entries, newEntry);
      }

      if (entries.length === 0) {
        return bucket.documentExists
          ? {
              bucket: bucket.bucket,
              guardId: bucket.guardId,
              path: bucket.path,
              mutationKind: 'delete' as const,
              entries,
              revision: bucket.existing
                ? nextAggregateRevision(bucket.existing.revision)
                : 1,
            }
          : undefined;
      }

      const mutationKind = bucket.documentExists ? ('update' as const) : ('create' as const);
      return {
        bucket: bucket.bucket,
        guardId: bucket.guardId,
        path: bucket.path,
        mutationKind,
        entries,
        revision: bucket.existing ? nextAggregateRevision(bucket.existing.revision) : 1,
      };
    })
    .filter((write): write is NonNullable<typeof write> => write !== undefined);

  const plan: ResourceClaimOperationPlan = {
    claim: movedClaim,
    claimPath,
    claimMutationKind: 'update',
    guardBuckets: loadedBuckets,
    guardWrites,
    releaseOldBuckets: loadedBuckets.filter((bucket) => oldBucketKeys.has(bucket.bucket.bucketKey)),
  };

  planBudgetForOperation(session, plan);
  return plan;
}

export async function moveResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: MoveResourceClaimInput
): Promise<ResourceClaim> {
  const plan = await readAndPlanMoveResourceClaim(session, input);
  if (session.tx.phase !== 'writes') {
    return plan.claim;
  }
  commitResourceClaimPlan(session, plan, input);
  return plan.claim;
}

export async function readAndPlanReleaseResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseResourceClaimInput
): Promise<ResourceClaimOperationPlan> {
  const claimPath = claimPathFor(input.claimId);
  session.plan.planRead({ path: claimPath, category: 'resource_claim' });
  const claimSnapshot = await session.tx.get({ path: claimPath });
  const existingClaim = parseClaim(claimSnapshot.data);

  if (!existingClaim) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'claimId', reason: 'required' },
    });
  }

  if (existingClaim.lifecycle.status === 'released') {
    return {
      claim: existingClaim,
      claimPath,
      claimMutationKind: 'update',
      guardBuckets: [],
      guardWrites: [],
    };
  }

  const buckets = await loadGuardBuckets(
    session,
    expandUtcGuardBuckets(
      existingClaim.resourceKind,
      existingClaim.resourceId,
      existingClaim.interval
    )
  );

  const decidedAt = timestampFromDate(input.decidedAt);
  const releasedClaim = ResourceClaimSchema.parse({
    ...existingClaim,
    lifecycle: { status: 'released', releasedAt: decidedAt },
    revision: nextAggregateRevision(existingClaim.revision),
    updatedAt: decidedAt,
    lastChangedByCommandId: input.commandId,
    correlationId: input.correlationId,
  });

  const guardWrites = buckets
    .map((bucket) => {
      const entries = removeGuardEntryByClaimId(
        bucket.conflictEntries,
        existingClaim.claimId
      );
      if (!bucket.documentExists) {
        return undefined;
      }
      const mutationKind: 'delete' | 'update' = entries.length === 0 ? 'delete' : 'update';
      return {
        bucket: bucket.bucket,
        guardId: bucket.guardId,
        path: bucket.path,
        mutationKind,
        entries,
        revision: bucket.existing ? nextAggregateRevision(bucket.existing.revision) : 1,
      };
    })
    .filter((write): write is NonNullable<typeof write> => write !== undefined);

  const plan: ResourceClaimOperationPlan = {
    claim: releasedClaim,
    claimPath,
    claimMutationKind: 'update',
    guardBuckets: buckets,
    guardWrites,
  };

  planBudgetForOperation(session, plan);
  return plan;
}

export async function releaseResourceClaim(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseResourceClaimInput
): Promise<ResourceClaim> {
  const plan = await readAndPlanReleaseResourceClaim(session, input);
  if (session.tx.phase !== 'writes') {
    return plan.claim;
  }
  commitResourceClaimPlan(session, plan, input);
  return plan.claim;
}

export function replacementIgnoreFromClaim(
  claim: Pick<ResourceClaim, 'claimId' | 'ownerKind' | 'ownerId' | 'occurrenceId'>
): ResourceClaimReplacementIgnore {
  return {
    claimId: claim.claimId,
    ownerKind: claim.ownerKind,
    ownerId: claim.ownerId,
    occurrenceId: claim.occurrenceId,
  };
}

export function buildAcquireIdentityFromClaim(
  claim: Pick<
    ResourceClaim,
    'claimKind' | 'resourceKind' | 'resourceId' | 'ownerKind' | 'ownerId' | 'occurrenceId'
  >
): ResourceClaimIdentityInput {
  return buildResourceClaimIdentityInput(claim);
}
