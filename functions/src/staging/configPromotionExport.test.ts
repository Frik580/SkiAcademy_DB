import { describe, expect, it } from 'vitest';
import {
  isAllowedBannerStorageObjectPath,
  PROMOTION_CONFIG_DOCUMENT_PATHS,
  PROMOTION_EXCLUDED_COLLECTIONS,
  PROMOTION_IGNORED_BUSINESS_COLLECTIONS,
  exportStagingConfigManifest,
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

const exportedAt = new Date('2026-09-24T00:00:00.000Z');
const bucketName = 'ski-school-staging.firebasestorage.app';

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

function promotionFirestore(documents: Readonly<Record<string, Record<string, unknown> | undefined>>, counts: Readonly<Record<string, number>> = {}) {
  const collectionReads: string[] = [];
  const documentReads: string[] = [];
  const firestore = {
    collectionReads,
    documentReads,
    doc(path: string) {
      return {
        path,
        async get() {
          documentReads.push(path);
          const data = documents[path];
          return { exists: data !== undefined, id: path.split('/').at(-1), ref: { path }, data: () => data };
        },
      };
    },
    async getAll(...references: Array<{ path: string }>) {
      return references.map((ref) => {
        documentReads.push(ref.path);
        const data = documents[ref.path];
        return { exists: data !== undefined, id: ref.path.split('/').at(-1), ref, data: () => data };
      });
    },
    collection(name: string) {
      collectionReads.push(name);
      return {
        count() {
          return { get: async () => ({ data: () => ({ count: counts[name] ?? 0 }) }) };
        },
      };
    },
  };
  return firestore;
}

const decidedAt = { seconds: 1_700_000_000, nanoseconds: 0 };
const pricingDocument = {
  settingsId: 'lesson_booking',
  additionalParticipantSurchargePerHourKzt: 6_000,
  maxParticipantsPerLesson: 4,
  revision: 2,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_seed_lesson_pricing_settings',
    lastChangedByCommandId: 'command_seed_lesson_pricing_settings',
    correlationId: 'correlation_seed_pricing',
  },
};
const skillDocument = {
  passPercentage: 70,
  items: [{
    id: 'skill_1', levelTarget: 1, section: 'Basics', num: '1', title: 'Snowplow',
    maxPoints: 10, controlPoints: 4, speedPoints: 3, techniquePoints: 3,
  }],
};
const achievementDocument = {
  items: [{
    id: 'ach_1', labelRu: 'Старт', labelEn: 'Start', icon: 'star', order: 1,
    rule: { type: 'lessons_completed', count: 1 },
  }],
};
const filterDocument = { enabled: true, internalNote: 'do-not-export' };
const resortDocument = {
  nameEn: 'Shymbulak',
  latitude: 43.1,
  longitude: 77.0,
  slides: [{
    id: 'hero',
    line1En: 'Alpine',
    line1Ru: 'Альпы',
    line2En: '',
    line2Ru: '',
    line3En: '',
    line3Ru: '',
    backgroundImage: 'https://storage.yandexcloud.net/carve/hero.webp',
  }],
  slideIntervalSeconds: 12,
  slidesRandomOrder: false,
};

function globalDocuments(extra: Record<string, Record<string, unknown> | undefined> = {}) {
  return {
    'lesson_pricing_settings/lesson_booking': pricingDocument,
    'settings/skill_config': skillDocument,
    'settings/achievements_config': achievementDocument,
    'settings/instructor_filters': filterDocument,
    'resort_data/config': resortDocument,
    ...extra,
  };
}

const businessDocuments = {
  'instructors/instructor_operator': { name: 'Operator Instructor Secret', avatarUrl: 'https://example.invalid/instructors/instructor_operator.jpg' },
  'courses/course_operator': { title: 'operator-course-title', lifecycle: 'active' },
  'courses/course_operator/days/day_operator': { courseDayId: 'day_operator', secretSchedule: 'course-day-secret' },
  'course_catalog_content/course_operator': { description: 'catalog-secret-description', bgImageUrl: 'https://example.invalid/courses/course_operator.webp' },
  'users/account_private': { email: 'private@example.com', password: 'secret-password', authUid: 'auth-uid-private' },
  'bookings/booking_private': { note: 'booking-secret' },
};

function firebaseUrl(objectPath: string, token?: string) {
  const base = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  return token ? `${base}&token=${token}` : base;
}

describe('configuration promotion export allowlist', () => {
  it('reads only global configuration documents and excluded aggregate counts', () => {
    expect(PROMOTION_CONFIG_DOCUMENT_PATHS).toEqual([
      'lesson_pricing_settings/lesson_booking',
      'settings/skill_config',
      'settings/achievements_config',
      'settings/instructor_filters',
      'resort_data/config',
    ]);
    expect(PROMOTION_IGNORED_BUSINESS_COLLECTIONS).toEqual(['instructors', 'courses', 'course_catalog_content']);
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('bookings');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('users');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('image-cache');
    for (const name of PROMOTION_IGNORED_BUSINESS_COLLECTIONS) {
      expect(PROMOTION_EXCLUDED_COLLECTIONS).not.toContain(name);
    }
  });

  it('excludes fixture-owned and TEST-scoped configuration documents', () => {
    const reasons: string[] = [];
    const exclude = (doc: { path: string; id: string; data: Record<string, unknown> }, owned = new Set<string>()) =>
      shouldExcludeSource(doc, owned, (reason) => reasons.push(reason));
    expect(exclude({ path: 'settings/skill_config', id: 'skill_config', data: {} }, new Set(['settings/skill_config']))).toBe(true);
    expect(exclude({ path: 'settings/skill_config', id: 'skill_config', data: { dataScope: 'test' } })).toBe(true);
    expect(exclude({ path: 'settings/achievements_config', id: 'achievements_config', data: { testSessionId: 'test-session' } })).toBe(true);
    expect(reasons).toEqual(['fixture_owned', 'test_scoped', 'test_scoped']);
  });

  it('keeps the v2 smoke seed out of promotable configuration documents', () => {
    const fixture = buildStagingFixturePlan();
    expect(fixture.ownedFirestorePaths.filter((path) =>
      (PROMOTION_CONFIG_DOCUMENT_PATHS as readonly string[]).includes(path)
    )).toEqual([]);
    expect(fixture.ownedFirestorePaths).not.toContain('users/real-google-owner');
    expect(fixture.ownedFirestorePaths.some((path) => path.startsWith('users/') || path.startsWith('participants/'))).toBe(true);
  });

  it('keeps v1 fixture ownership fail-closed without treating those courses as promotion candidates', async () => {
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
      'course_catalog_content/staging-course-ski-foundations',
    ]) {
      expect(ownership.ownedPaths.has(path)).toBe(true);
    }
    expect([...ownership.ownedPaths].filter((path) =>
      (PROMOTION_CONFIG_DOCUMENT_PATHS as readonly string[]).includes(path)
    )).toEqual([]);
  });

  it('reads only a single v2 manifest and fails closed if both versions are present', async () => {
    const currentPlan = buildStagingFixturePlan();
    expect(currentPlan.fixtureId).toBe(STAGING_FIXTURE_ID);
    expect(currentPlan.version).toBe(STAGING_FIXTURE_VERSION);
    const currentManifest = manifestForPlan(currentPlan);
    const currentOwnership = await readStagingFixtureOwnership(
      firestoreWithManifests(new Map([[STAGING_FIXTURE_MANIFEST_PATH, currentManifest]])) as never
    );
    expect(currentPlan.ownedFirestorePaths.filter((path) =>
      (PROMOTION_CONFIG_DOCUMENT_PATHS as readonly string[]).includes(path)
    )).toEqual([]);
    expect(currentOwnership.ownedPaths.has('courses/operator-authored-course')).toBe(false);

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

  it('allows only explicit banner object paths', () => {
    expect(isAllowedBannerStorageObjectPath('banners/winter-banner.webp')).toBe(true);
    expect(isAllowedBannerStorageObjectPath('banners/winter-banner.jpg')).toBe(true);
    expect(isAllowedBannerStorageObjectPath('courses/course_a.webp')).toBe(false);
    expect(isAllowedBannerStorageObjectPath('instructors/instructor_a.jpg')).toBe(false);
    expect(isAllowedBannerStorageObjectPath('image-cache/hash')).toBe(false);
    expect(isAllowedBannerStorageObjectPath('customers/customer_a/avatar.jpg')).toBe(false);
  });

  it('preserves supported logical resort slide keys without creating media entries', async () => {
    const logicalKeys = ['wall7', 'wall2', 'wall5', 'about'];
    const documents = globalDocuments({
      'resort_data/config': {
        slides: logicalKeys.map((backgroundImage, index) => ({
          id: `logical-${index + 1}`,
          line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '',
          backgroundImage,
        })),
        slideIntervalSeconds: 12,
        slidesRandomOrder: false,
      },
    });
    const manifest = await exportStagingConfigManifest({
      firestore: promotionFirestore(documents) as never,
      exportedAt,
    });
    const resort = manifest.sourceDocuments.find((item) => item.kind === 'resort_slides');
    const slides = (resort?.payload as { slides: Array<{ backgroundImage: string }> }).slides;

    expect(slides.map((slide) => slide.backgroundImage)).toEqual(logicalKeys);
    expect(manifest.media).toEqual([]);
    expect(resort?.issues).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('unsupported_media_reference');
  });

  it('marks unknown logical keys and unsupported image URLs as export issues', async () => {
    const documents = globalDocuments({
      'resort_data/config': {
        slides: ['something-random', 'https://images.example.com/hero.jpg'].map((backgroundImage, index) => ({
          id: `unsupported-${index + 1}`,
          line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '',
          backgroundImage,
        })),
        slideIntervalSeconds: 12,
        slidesRandomOrder: false,
      },
    });
    const manifest = await exportStagingConfigManifest({
      firestore: promotionFirestore(documents) as never,
      exportedAt,
    });
    const resort = manifest.sourceDocuments.find((item) => item.kind === 'resort_slides');
    const slides = (resort?.payload as { slides: Array<{ backgroundImage: string }> }).slides;

    expect(slides.every((slide) => slide.backgroundImage === 'unsupported-media-reference')).toBe(true);
    expect(resort?.issues).toContain('unsupported_media_reference');
    expect(manifest.media).toEqual([]);
  });

  it('rejects public Yandex Course, Instructor, and image-cache paths', async () => {
    const forbiddenUrls = [
      'https://storage.yandexcloud.net/carve/courses/course.webp',
      'https://storage.yandexcloud.net/carve/instructors/instructor.jpg',
      'https://storage.yandexcloud.net/carve/image-cache/cached.webp',
    ];
    const documents = globalDocuments({
      'resort_data/config': {
        slides: forbiddenUrls.map((backgroundImage, index) => ({
          id: `forbidden-${index + 1}`,
          line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '',
          backgroundImage,
        })),
        slideIntervalSeconds: 12,
        slidesRandomOrder: false,
      },
    });
    const manifest = await exportStagingConfigManifest({
      firestore: promotionFirestore(documents) as never,
      exportedAt,
    });
    const resort = manifest.sourceDocuments.find((item) => item.kind === 'resort_slides');
    const slides = (resort?.payload as { slides: Array<{ backgroundImage: string }> }).slides;

    expect(slides.every((slide) => slide.backgroundImage === 'unsupported-media-reference')).toBe(true);
    expect(resort?.issues).toContain('unsupported_media_reference');
    expect(manifest.media).toEqual([]);
  });

  it('exports global configuration and ignores instructors, courses, days, catalog content, accounts, and bookings', async () => {
    const counts = { users: 4, bookings: 2 };
    const withBusiness = promotionFirestore(globalDocuments(businessDocuments), counts);
    const withoutBusiness = promotionFirestore(globalDocuments(), counts);
    const withManifest = await exportStagingConfigManifest({ firestore: withBusiness as never, exportedAt });
    const withoutManifest = await exportStagingConfigManifest({ firestore: withoutBusiness as never, exportedAt });

    expect(withManifest).toEqual(withoutManifest);
    for (const name of PROMOTION_IGNORED_BUSINESS_COLLECTIONS) {
      expect(withBusiness.collectionReads).not.toContain(name);
    }
    for (const path of [
      'instructors/instructor_operator',
      'courses/course_operator',
      'courses/course_operator/days/day_operator',
      'course_catalog_content/course_operator',
      'users/account_private',
      'bookings/booking_private',
    ]) {
      expect(withBusiness.documentReads).not.toContain(path);
    }
    expect(withManifest.sourceDocuments.map((item) => item.sourcePath).sort()).toEqual([
      'lesson_pricing_settings/lesson_booking',
      'resort_data/config',
      'settings/achievements_config',
      'settings/instructor_filters',
      'settings/skill_config',
    ]);
    const serialized = JSON.stringify(withManifest);
    for (const secret of [
      'Operator Instructor Secret',
      'operator-course-title',
      'course-day-secret',
      'catalog-secret-description',
      'private@example.com',
      'auth-uid-private',
      'booking-secret',
      'secret-password',
      'do-not-export',
      'Shymbulak',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(withManifest.sourceDocuments.find((item) => item.kind === 'lesson_pricing_settings')?.payload).toEqual({
      additionalParticipantSurchargePerHourKzt: 6_000,
      maxParticipantsPerLesson: 4,
    });
    expect(withManifest.sourceDocuments.find((item) => item.kind === 'skill_config')?.payload).toEqual(skillDocument);
    expect(withManifest.sourceDocuments.find((item) => item.kind === 'achievements_config')?.payload).toEqual(achievementDocument);
    expect(withManifest.sourceDocuments.find((item) => item.kind === 'instructor_filters')?.payload).toEqual({ enabled: true });
    expect(withManifest.sourceDocuments.find((item) => item.kind === 'resort_slides')?.payload).toMatchObject({
      slides: [expect.objectContaining({ backgroundImage: 'https://storage.yandexcloud.net/carve/hero.webp' })],
      slideIntervalSeconds: 12,
      slidesRandomOrder: false,
    });
    expect(withManifest.media).toEqual([]);
    expect(withManifest.excludedSummary.collectionCounts.users).toBe(4);
    expect(serialized).not.toContain('authUids');
  });

  it('exports banner media only from the explicit banners path and rejects course, instructor, cache, and private objects', async () => {
    const bannerBytes = Buffer.from('banner-binary');
    const documents = {
      'resort_data/config': {
        slides: [
          { id: 'yandex', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: 'https://storage.yandexcloud.net/carve/hero.webp' },
          { id: 'banner', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: firebaseUrl('banners/winter-banner.webp') },
          { id: 'course', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: firebaseUrl('courses/course_operator.webp', 'download-token-secret') },
          { id: 'instructor', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: firebaseUrl('instructors/instructor_operator.jpg', 'download-token-secret') },
          { id: 'cache', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: firebaseUrl('image-cache/cached.webp') },
          { id: 'private', line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage: firebaseUrl('customers/customer_a/avatar.jpg') },
        ],
        slideIntervalSeconds: 10,
        slidesRandomOrder: false,
      },
    };
    const bucket = {
      file(objectPath: string) {
        if (objectPath !== 'banners/winter-banner.webp') throw new Error(`unexpected storage read ${objectPath}`);
        return {
          getMetadata: async () => [{ size: bannerBytes.length, contentType: 'image/webp' }],
          download: async () => [bannerBytes],
        };
      },
    };
    const manifest = await exportStagingConfigManifest({
      firestore: promotionFirestore(documents) as never,
      bucket: bucket as never,
      stagingStorageBucketName: bucketName,
      exportedAt,
    });
    expect(manifest.media).toHaveLength(1);
    expect(manifest.media[0]).toMatchObject({
      ownerKind: 'resort',
      fieldPath: 'slides.1.backgroundImage',
      sourceObjectPath: 'banners/winter-banner.webp',
      contentType: 'image/webp',
    });
    const slides = (manifest.sourceDocuments[0]?.payload as { slides: Array<{ backgroundImage: string }> }).slides;
    expect(slides[0]?.backgroundImage).toBe('https://storage.yandexcloud.net/carve/hero.webp');
    expect(slides[1]?.backgroundImage).toMatch(/^promotion-media:\/\//);
    expect(slides.slice(2).every((slide) => slide.backgroundImage === 'unsupported-media-reference')).toBe(true);
    expect(manifest.sourceDocuments[0]?.issues).toContain('storage_object_outside_promotion_allowlist');
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain('download-token-secret');
    expect(serialized).not.toContain('courses/course_operator.webp');
    expect(serialized).not.toContain('instructors/instructor_operator.jpg');
    expect(serialized).not.toContain('image-cache/');
    expect(serialized).not.toContain('customers/');
    expect(serialized).not.toMatch(/[?&]token=/);
  });
});
