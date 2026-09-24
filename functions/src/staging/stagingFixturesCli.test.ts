import { describe, expect, it } from 'vitest';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CommandIdSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  ResourceClaimGuardSchema,
  ResourceClaimIdSchema,
  ResourceClaimGuardIdSchema,
  resourceClaimGuardBucketKeyFromIdentity,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { resetStagingFixtures } from './stagingFixturesCli';
import {
  LEGACY_STAGING_FIXTURE_MANIFEST_PATH,
  STAGING_FIXTURE_MANIFEST_PATH,
  buildLegacyStagingFixturePlanV1,
  buildStagingFixturePlan,
} from './stagingFixtureDefinitions';

type FakeData = Record<string, unknown>;

interface FakeSnapshot {
  readonly exists: boolean;
  readonly ref: FakeReference;
  data(): FakeData | undefined;
}

interface FakeReference {
  readonly path: string;
  get(): Promise<FakeSnapshot>;
  update(value: FakeData): Promise<void>;
  delete(): Promise<void>;
}

class FakeFirestore {
  readonly docs = new Map<string, FakeData>();

  doc(path: string): FakeReference {
    return {
      path,
      get: async () => this.snapshot(this.doc(path)),
      update: async (value) => {
        const current = this.docs.get(path);
        if (!current) throw new Error(`Missing document ${path}`);
        this.docs.set(path, { ...current, ...value });
      },
      delete: async () => void this.docs.delete(path),
    };
  }

  async getAll(...references: FakeReference[]): Promise<FakeSnapshot[]> {
    return references.map((reference) => this.snapshot(reference));
  }

  async runTransaction<T>(
    operation: (transaction: {
      get(reference: FakeReference): Promise<FakeSnapshot>;
      delete(reference: FakeReference): void;
      set(reference: FakeReference, value: FakeData): void;
    }) => Promise<T>
  ): Promise<T> {
    return operation({
      get: async (reference) => this.snapshot(reference),
      delete: (reference) => void this.docs.delete(reference.path),
      set: (reference, value) => void this.docs.set(reference.path, value),
    });
  }

  batch() {
    const paths: string[] = [];
    return {
      delete: (reference: FakeReference) => {
        paths.push(reference.path);
      },
      commit: async () => paths.forEach((path) => this.docs.delete(path)),
    };
  }

  private snapshot(reference: FakeReference): FakeSnapshot {
    const data = this.docs.get(reference.path);
    return { exists: data !== undefined, ref: reference, data: () => data };
  }
}

function makeManifest(plan: ReturnType<typeof buildStagingFixturePlan>): FakeData {
  return {
    fixtureId: plan.fixtureId,
    version: plan.version,
    projectId: 'ski-school-staging',
    ...(plan.scheduleAnchorDate ? { scheduleAnchorDate: plan.scheduleAnchorDate } : {}),
    ownedFirestorePaths: plan.ownedFirestorePaths,
    resourceClaimOwnership: plan.resourceClaimOwnership,
    authUids: plan.authUids,
    storagePrefixes: plan.storagePrefixes,
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function guardDocument(input: {
  readonly guardId: string;
  readonly resourceId: string;
  readonly claimIds: readonly string[];
}): FakeData {
  const bucketStartAt = timestampFromDate(new Date('2026-10-01T00:00:00.000Z'));
  const bucketKey = resourceClaimGuardBucketKeyFromIdentity({
    strategyVersion: 'guard:v2',
    resourceKind: 'instructor',
    resourceId: input.resourceId,
    bucketStartSeconds: bucketStartAt.seconds,
  });
  return ResourceClaimGuardSchema.parse({
    guardId: input.guardId,
    dataScope: 'live',
    strategyVersion: 'guard:v2',
    bucketKey,
    resourceKind: 'instructor',
    resourceId: input.resourceId,
    bucketStartAt,
    entries: input.claimIds.map((claimId, index) => ({
      claimId: ResourceClaimIdSchema.parse(claimId),
      ownerKind: 'course_day',
      ownerId: `staging-day-${index + 1}`,
      occurrenceId: OccurrenceIdSchema.parse(`occurrence_fixture_day_${index + 1}`),
      interval: {
        startsAt: bucketStartAt,
        endsAt: timestampFromDate(new Date('2026-10-01T01:00:00.000Z')),
      },
      lifecycleStatus: 'active',
    })),
    revision: 1,
    updatedAt: bucketStartAt,
    lastChangedByCommandId: CommandIdSchema.parse('command_staging_fixture_seed'),
    correlationId: CorrelationIdSchema.parse('correlation_staging_fixture_seed'),
  });
}

function fixtureFirestore(plan: ReturnType<typeof buildStagingFixturePlan>, manifestPath: string) {
  const firestore = new FakeFirestore();
  for (const path of plan.ownedFirestorePaths) firestore.docs.set(path, { fixtureOwned: true });
  firestore.docs.set(manifestPath, makeManifest(plan));

  const claimIdsByGuard = new Map<string, Set<string>>();
  for (const ownership of plan.resourceClaimOwnership) {
    const claimId = ownership.claimPath.split('/').at(-1)!;
    for (const guardPath of ownership.guardPaths) {
      const claimIds = claimIdsByGuard.get(guardPath) ?? new Set<string>();
      claimIds.add(claimId);
      claimIdsByGuard.set(guardPath, claimIds);
    }
  }
  for (const [guardPath, claimIds] of claimIdsByGuard) {
    firestore.docs.set(
      guardPath,
      guardDocument({
        guardId: ResourceClaimGuardIdSchema.parse(guardPath.split('/').at(-1)),
        resourceId: 'staging-instructor-catalog',
        claimIds: [...claimIds],
      })
    );
  }
  return firestore;
}

function addUnownedGuardEntry(
  firestore: FakeFirestore,
  plan: ReturnType<typeof buildStagingFixturePlan>
): { readonly guardPath: string; readonly claimId: string } {
  const guardPath = plan.resourceClaimOwnership.flatMap((ownership) => ownership.guardPaths)[0];
  if (!guardPath) throw new Error('Expected the legacy plan to own guard paths');
  const current = ResourceClaimGuardSchema.parse(firestore.docs.get(guardPath));
  const claimId = ResourceClaimIdSchema.parse('resource_claim_operator_booking');
  const entry = {
    claimId,
    ownerKind: 'booking' as const,
    ownerId: 'booking_operator_fixture',
    occurrenceId: OccurrenceIdSchema.parse('occurrence_operator_fixture'),
    interval: current.entries[0]!.interval,
    lifecycleStatus: 'active' as const,
  };
  firestore.docs.set(
    guardPath,
    ResourceClaimGuardSchema.parse({ ...current, entries: [...current.entries, entry] })
  );
  firestore.docs.set(`resource_claims/${claimId}`, { claimId });
  return { guardPath, claimId };
}

function fakeAuth(userIds: readonly string[]) {
  const existing = new Set(userIds);
  const deleted: string[] = [];
  return {
    value: {
      async deleteUser(uid: string) {
        if (!existing.delete(uid)) {
          const error = new Error('User not found') as Error & { code: string };
          error.code = 'auth/user-not-found';
          throw error;
        }
        deleted.push(uid);
      },
    } as unknown as Auth,
    existing,
    deleted,
  };
}

describe('staging fixture reset ownership', () => {
  it('resets the complete old v1 graph without touching operator resources or the Google owner', async () => {
    const plan = buildLegacyStagingFixturePlanV1('2026-10-12');
    const firestore = fixtureFirestore(plan, LEGACY_STAGING_FIXTURE_MANIFEST_PATH);
    const sharedGuard = addUnownedGuardEntry(firestore, plan);
    firestore.docs.set('users/google-owner-uid', { role: 'admin', systemRole: 'owner' });
    firestore.docs.set('courses/operator-authored-course', { title: 'Operator course' });
    firestore.docs.set('instructors/operator-authored-instructor', { name: 'Operator instructor' });
    const operatorClaimId = ResourceClaimIdSchema.parse('resource_claim_operator_fixture');
    firestore.docs.set(`resource_claims/${operatorClaimId}`, { claimId: operatorClaimId });
    const operatorGuardPath = 'resource_claim_guards/resource_claim_guard_operator_fixture';
    firestore.docs.set(
      operatorGuardPath,
      guardDocument({
        guardId: ResourceClaimGuardIdSchema.parse(operatorGuardPath.split('/').at(-1)),
        resourceId: 'operator-instructor',
        claimIds: [operatorClaimId],
      })
    );
    const auth = fakeAuth([...plan.authUids, 'google-owner-uid']);

    await resetStagingFixtures(auth.value, firestore as unknown as Firestore);

    expect([...plan.ownedFirestorePaths].filter((path) => firestore.docs.has(path))).toEqual([]);
    for (const ownership of plan.resourceClaimOwnership) {
      expect(firestore.docs.has(ownership.claimPath)).toBe(false);
      for (const guardPath of ownership.guardPaths) {
        if (guardPath !== sharedGuard.guardPath) expect(firestore.docs.has(guardPath)).toBe(false);
      }
    }
    expect(firestore.docs.get('courses/operator-authored-course')).toMatchObject({
      title: 'Operator course',
    });
    expect(firestore.docs.get('instructors/operator-authored-instructor')).toMatchObject({
      name: 'Operator instructor',
    });
    expect(firestore.docs.has(`resource_claims/${operatorClaimId}`)).toBe(true);
    expect(firestore.docs.has(operatorGuardPath)).toBe(true);
    const remainingSharedGuard = ResourceClaimGuardSchema.parse(
      firestore.docs.get(sharedGuard.guardPath)
    );
    expect(remainingSharedGuard.entries.map((entry) => entry.claimId)).toEqual([
      sharedGuard.claimId,
    ]);
    expect(firestore.docs.has(`resource_claims/${sharedGuard.claimId}`)).toBe(true);
    expect(firestore.docs.get('users/google-owner-uid')).toMatchObject({
      role: 'admin',
      systemRole: 'owner',
    });
    expect(auth.deleted).toEqual(plan.authUids);
    expect(auth.existing.has('google-owner-uid')).toBe(true);
    expect(firestore.docs.has(LEGACY_STAGING_FIXTURE_MANIFEST_PATH)).toBe(false);

    const reducedPlan = buildStagingFixturePlan();
    for (const path of reducedPlan.ownedFirestorePaths) {
      firestore.docs.set(path, { fixtureOwned: true });
    }
    firestore.docs.set(STAGING_FIXTURE_MANIFEST_PATH, makeManifest(reducedPlan));
    reducedPlan.authUids.forEach((uid) => auth.existing.add(uid));
    await resetStagingFixtures(auth.value, firestore as unknown as Firestore);
    expect([...reducedPlan.ownedFirestorePaths].filter((path) => firestore.docs.has(path))).toEqual(
      []
    );
    expect(firestore.docs.has(STAGING_FIXTURE_MANIFEST_PATH)).toBe(false);
    expect(firestore.docs.get('courses/operator-authored-course')).toMatchObject({
      title: 'Operator course',
    });
    expect(firestore.docs.get('instructors/operator-authored-instructor')).toMatchObject({
      name: 'Operator instructor',
    });
    expect(firestore.docs.has('users/google-owner-uid')).toBe(true);

    await resetStagingFixtures(auth.value, firestore as unknown as Firestore);
    expect(auth.deleted).toHaveLength(plan.authUids.length + reducedPlan.authUids.length);
  });

  it('resets the reduced v2 graph while preserving operator-created Courses and Instructors', async () => {
    const plan = buildStagingFixturePlan();
    const firestore = fixtureFirestore(plan, STAGING_FIXTURE_MANIFEST_PATH);
    firestore.docs.set('users/google-owner-uid', { role: 'admin', systemRole: 'owner' });
    firestore.docs.set('courses/operator-authored-course', { title: 'Operator course' });
    firestore.docs.set('instructors/operator-authored-instructor', { name: 'Operator instructor' });
    const auth = fakeAuth([...plan.authUids, 'google-owner-uid']);

    await resetStagingFixtures(auth.value, firestore as unknown as Firestore);

    expect([...plan.ownedFirestorePaths].filter((path) => firestore.docs.has(path))).toEqual([]);
    expect(firestore.docs.has('courses/operator-authored-course')).toBe(true);
    expect(firestore.docs.has('instructors/operator-authored-instructor')).toBe(true);
    expect(firestore.docs.has('users/google-owner-uid')).toBe(true);
    expect(auth.existing.has('google-owner-uid')).toBe(true);
    expect(firestore.docs.has(STAGING_FIXTURE_MANIFEST_PATH)).toBe(false);
  });

  it('refuses overlapping manifests before deleting anything', async () => {
    const oldPlan = buildLegacyStagingFixturePlanV1('2026-10-12');
    const newPlan = buildStagingFixturePlan();
    const firestore = fixtureFirestore(oldPlan, LEGACY_STAGING_FIXTURE_MANIFEST_PATH);
    firestore.docs.set(STAGING_FIXTURE_MANIFEST_PATH, makeManifest(newPlan));
    const auth = fakeAuth(oldPlan.authUids);
    const before = new Map(firestore.docs);

    await expect(
      resetStagingFixtures(auth.value, firestore as unknown as Firestore)
    ).rejects.toThrow('multiple fixture manifests');

    expect(firestore.docs).toEqual(before);
    expect(auth.deleted).toEqual([]);
  });
});
