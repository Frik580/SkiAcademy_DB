import { describe, expect, it } from 'vitest';
import {
  isAllowedStorageObjectPath,
  PROMOTION_ALLOWED_SOURCE_COLLECTIONS,
  PROMOTION_EXCLUDED_COLLECTIONS,
  readStagingFixtureOwnership,
  shouldExcludeSource,
} from './configPromotionExport';
import {
  LEGACY_STAGING_FIXTURE_ID,
  LEGACY_STAGING_FIXTURE_MANIFEST_PATH,
  LEGACY_STAGING_FIXTURE_VERSION,
  STAGING_FIXTURE_ID,
  STAGING_FIXTURE_MANIFEST_PATH,
  STAGING_FIXTURE_VERSION,
  buildLegacyStagingFixturePlanV1,
  buildStagingFixturePlan,
} from './stagingFixtureDefinitions';

function firestoreWithManifests(manifests: ReadonlyMap<string, Record<string, unknown>>) {
  return {
    doc(path: string) {
      return { path };
    },
    async getAll(...references: Array<{ path: string }>) {
      return references.map((ref) => {
        const data = manifests.get(ref.path);
        return { exists: data !== undefined, ref, data: () => data };
      });
    },
  };
}

function manifestForPlan(
  plan: ReturnType<typeof buildStagingFixturePlan>,
  status = 'active'
): Record<string, unknown> {
  return {
    fixtureId: plan.fixtureId,
    version: plan.version,
    projectId: 'ski-school-staging',
    ...(plan.scheduleAnchorDate ? { scheduleAnchorDate: plan.scheduleAnchorDate } : {}),
    ownedFirestorePaths: plan.ownedFirestorePaths,
    resourceClaimOwnership: plan.resourceClaimOwnership,
    authUids: plan.authUids,
    storagePrefixes: plan.storagePrefixes,
    status,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('configuration promotion export allowlist', () => {
  it('reads only the explicit configuration collections', () => {
    expect(PROMOTION_ALLOWED_SOURCE_COLLECTIONS).toEqual(['instructors', 'courses', 'course_catalog_content']);
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('bookings');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('users');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('image-cache');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('administrative_availability_blocks');
  });

  it('excludes fixture-owned, TEST-scoped, and testSessionId source documents', () => {
    const reasons: string[] = [];
    const exclude = (doc: { path: string; id: string; data: Record<string, unknown> }, owned = new Set<string>()) =>
      shouldExcludeSource(doc, owned, (reason) => reasons.push(reason));
    expect(exclude({ path: 'courses/fixture-course', id: 'fixture-course', data: {} }, new Set(['courses/fixture-course']))).toBe(true);
    expect(exclude({ path: 'courses/test-course', id: 'test-course', data: { dataScope: 'test' } })).toBe(true);
    expect(exclude({ path: 'courses/session-course', id: 'session-course', data: { testSessionId: 'test-session' } })).toBe(true);
    expect(reasons).toEqual(['fixture_owned', 'test_scoped', 'test_scoped']);
  });

  it('keeps the v2 smoke seed out of promotion configuration and preserves operator eligibility', () => {
    const fixture = buildStagingFixturePlan();
    const promotableFixturePaths = fixture.ownedFirestorePaths.filter((path) =>
      /^(instructors|courses|course_catalog_content)\//.test(path)
    );
    expect(promotableFixturePaths).toEqual([]);

    const operatorCourse = {
      path: 'courses/operator-authored-course',
      id: 'operator-authored-course',
      data: {},
    };
    expect(
      shouldExcludeSource(operatorCourse, new Set(fixture.ownedFirestorePaths), () => undefined)
    ).toBe(false);

    const legacyFixture = buildLegacyStagingFixturePlanV1('2026-10-12');
    for (const path of [
      'instructors/staging-instructor-catalog',
      'courses/staging-course-ski-foundations',
      'courses/staging-course-snowboard-progress',
      'course_catalog_content/staging-course-ski-foundations',
      'course_catalog_content/staging-course-snowboard-progress',
    ]) {
      expect(legacyFixture.ownedFirestorePaths).toContain(path);
      expect(
        shouldExcludeSource(
          { path, id: path.split('/')[1]!, data: {} },
          new Set(legacyFixture.ownedFirestorePaths),
          () => undefined
        )
      ).toBe(true);
    }
  });

  it('keeps v1 fixture configuration excluded until its old manifest is reset', async () => {
    const legacyPlan = buildLegacyStagingFixturePlanV1('2026-10-12');
    expect(legacyPlan.fixtureId).toBe(LEGACY_STAGING_FIXTURE_ID);
    expect(legacyPlan.version).toBe(LEGACY_STAGING_FIXTURE_VERSION);
    const ownership = await readStagingFixtureOwnership(
      firestoreWithManifests(
        new Map([[LEGACY_STAGING_FIXTURE_MANIFEST_PATH, manifestForPlan(legacyPlan)]])
      ) as never
    );
    for (const path of [
      'instructors/staging-instructor-catalog',
      'courses/staging-course-ski-foundations',
      'courses/staging-course-snowboard-progress',
      'course_catalog_content/staging-course-ski-foundations',
      'course_catalog_content/staging-course-snowboard-progress',
    ]) {
      expect(ownership.ownedPaths.has(path)).toBe(true);
      expect(
        shouldExcludeSource({ path, id: path.split('/')[1]!, data: {} }, ownership.ownedPaths, () => undefined)
      ).toBe(true);
    }

    const fallbackOwnership = await readStagingFixtureOwnership(
      firestoreWithManifests(new Map()) as never
    );
    expect(
      fallbackOwnership.ownedPaths.has('courses/staging-course-ski-foundations')
    ).toBe(true);
  });

  it('reads only a single v2 manifest and fails closed if both versions are present', async () => {
    const currentPlan = buildStagingFixturePlan();
    expect(currentPlan.fixtureId).toBe(STAGING_FIXTURE_ID);
    expect(currentPlan.version).toBe(STAGING_FIXTURE_VERSION);
    const currentManifest = manifestForPlan(currentPlan);
    const currentOwnership = await readStagingFixtureOwnership(
      firestoreWithManifests(new Map([[STAGING_FIXTURE_MANIFEST_PATH, currentManifest]])) as never
    );
    expect(
      currentPlan.ownedFirestorePaths.filter((path) =>
        /^(instructors|courses|course_catalog_content)\//.test(path)
      )
    ).toEqual([]);
    expect(
      shouldExcludeSource(
        { path: 'courses/operator-authored-course', id: 'operator-authored-course', data: {} },
        currentOwnership.ownedPaths,
        () => undefined
      )
    ).toBe(false);

    const legacyPlan = buildLegacyStagingFixturePlanV1('2026-10-12');
    await expect(
      readStagingFixtureOwnership(
        firestoreWithManifests(
          new Map([
            [LEGACY_STAGING_FIXTURE_MANIFEST_PATH, manifestForPlan(legacyPlan)],
            [STAGING_FIXTURE_MANIFEST_PATH, currentManifest],
          ])
        ) as never
      )
    ).rejects.toThrow('multiple active staging fixture ownership manifests');
  });

  it('allows only exact catalog, instructor, and banner source object paths', () => {
    expect(isAllowedStorageObjectPath('course', 'course_a', 'courses/course_a.webp')).toBe(true);
    expect(isAllowedStorageObjectPath('instructor', 'instructor_a', 'instructors/instructor_a.jpg')).toBe(true);
    expect(isAllowedStorageObjectPath('resort', 'resort_config', 'banners/winter-banner.webp')).toBe(true);
    expect(isAllowedStorageObjectPath('course', 'course_a', 'image-cache/hash')).toBe(false);
    expect(isAllowedStorageObjectPath('course', 'course_a', 'customers/customer_a/avatar.jpg')).toBe(false);
    expect(isAllowedStorageObjectPath('resort', 'resort_config', 'private/banner.webp')).toBe(false);
  });
});
