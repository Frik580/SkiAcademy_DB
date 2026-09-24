import { createHash } from 'node:crypto';
import type { Bucket } from '@google-cloud/storage';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LESSON_PRICING_SETTINGS_ID,
  isSupportedResortSlideLogicalImageKey,
  normalizeFirestoreDocument,
} from '@ski-academy/shared-domain';
import { LESSON_PRICING_SETTINGS_DOCUMENT_PATH, parseLessonPricingSettings } from '../canonical/pricing/lessonPricingSettingsStore';
import {
  LEGACY_STAGING_FIXTURE_ID,
  LEGACY_STAGING_FIXTURE_MANIFEST_PATH,
  LEGACY_STAGING_FIXTURE_VERSION,
  STAGING_FIXTURE_ID,
  STAGING_FIXTURE_MANIFEST_PATH,
  STAGING_FIXTURE_VERSION,
  assertStagingFixtureManifestMatchesPlan,
  buildLegacyStagingFixturePlanV1,
  buildStagingFixturePlan,
  buildStagingFixturePlanForManifest,
  type ResourceClaimOwnership,
} from './stagingFixtureDefinitions';
import {
  PROMOTION_MANIFEST_VERSION,
  PROMOTION_MEDIA_MAX_BYTES,
  STAGING_PROJECT_ID,
  isAllowedResortSlideYandexUrl,
  mediaPlaceholderUrl,
  parsePromotionManifest,
  stableHash,
  validateSourcePayload,
  type ConfigPromotionManifest,
  type PromotionMediaReference,
  type PromotionSourceDocument,
} from './configPromotionContract';

export const PROMOTION_CONFIG_DOCUMENT_PATHS = [
  LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
  'settings/skill_config',
  'settings/achievements_config',
  'settings/instructor_filters',
  'resort_data/config',
] as const;

/**
 * Identity and scheduled business entities are never read, counted, or exported.
 * Course days live under courses/{courseId}/days and are ignored with courses.
 */
export const PROMOTION_IGNORED_BUSINESS_COLLECTIONS = [
  'instructors',
  'courses',
  'course_catalog_content',
] as const;

export const PROMOTION_EXCLUDED_COLLECTIONS = [
  'users',
  'participants',
  'participant_management',
  'instructor_relationships',
  'participant_blocks',
  'bookings',
  'instructor_reviews',
  'instructor_rating_summaries',
  'participant_progress',
  'participant_achievements',
  'participant_lesson_feedback',
  'booking_proposals',
  'booking_change_requests',
  'course_enrollments',
  'attendance',
  'payments',
  'monetary_events',
  'provider_event_receipts',
  'notifications',
  'admin_issues',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'test_sessions',
  'test_actors',
  'test_actor_assignments',
  'admin_runtime',
  'administrative_availability_blocks',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'image-cache',
] as const;

export const PROMOTION_EXCLUDED_DOCUMENT_PATHS = [
  'resort_data/cache',
] as const;

const INVALID_MEDIA_PLACEHOLDER = 'unsupported-media-reference';
const BANNER_OBJECT_PATH = /^banners\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:png|jpe?g|webp)$/i;

interface SourceDocument {
  readonly path: string;
  readonly id: string;
  readonly data: Record<string, unknown>;
}

interface MediaBytes {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface ConfigPromotionExportInput {
  readonly firestore: Firestore;
  readonly bucket?: Bucket;
  readonly stagingStorageBucketName?: string;
  readonly exportedAt?: Date;
}

export async function exportStagingConfigManifest(
  input: ConfigPromotionExportInput
): Promise<ConfigPromotionManifest> {
  const fixture = await readStagingFixtureOwnership(input.firestore);
  const singletonSnapshots = await input.firestore.getAll(
    ...PROMOTION_CONFIG_DOCUMENT_PATHS.map((path) => input.firestore.doc(path))
  );
  const excludedCounts = await Promise.all(PROMOTION_EXCLUDED_COLLECTIONS.map(async (name) => {
    try {
      const result = await input.firestore.collection(name).count().get();
      return [name, result.data().count] as const;
    } catch {
      throw new Error(`PROMOTION: could not count excluded collection ${name}`);
    }
  }));
  const excludedDocumentCounts = await Promise.all(PROMOTION_EXCLUDED_DOCUMENT_PATHS.map(async (path) => {
    const snapshot = await input.firestore.doc(path).get();
    return [path, snapshot.exists ? 1 : 0] as const;
  }));

  const excludedPaths: string[] = [];
  const reasonCounts: Record<string, number> = {};
  const countExcluded = (reason: string, path: string) => {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    excludedPaths.push(path);
  };
  const records: PromotionSourceDocument[] = [];
  const media: PromotionMediaReference[] = [];
  const storageReader = input.bucket ? (objectPath: string) => readStorageMedia(input.bucket!, objectPath) : undefined;
  const bucketName = input.stagingStorageBucketName?.trim();

  const singletonRecords = singletonSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({ path: snapshot.ref.path, id: snapshot.id, data: snapshot.data() as Record<string, unknown> }));
  for (const doc of singletonRecords) {
    if (shouldExcludeSource(doc, fixture.ownedPaths, countExcluded)) continue;
    const prepared = await buildSingletonRecord({
      doc, storageReader, bucketName, media, fixtureStoragePrefixes: fixture.storagePrefixes,
    });
    if (prepared) records.push(prepared);
  }

  records.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  media.sort((left, right) => left.mediaKey.localeCompare(right.mediaKey));
  const collectionCounts = Object.fromEntries(
    [...excludedCounts, ...excludedDocumentCounts].sort(([left], [right]) => left.localeCompare(right))
  );
  const manifest = {
    schemaVersion: PROMOTION_MANIFEST_VERSION,
    sourceProjectId: STAGING_PROJECT_ID,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    sourceDocuments: records,
    media,
    excludedSummary: {
      collectionCounts,
      reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
      fixtureOwnedDocumentCount: excludedPaths.filter((path) => fixture.ownedPaths.has(path)).length,
      excludedPaths: excludedPaths.sort(),
    },
  };
  return parsePromotionManifest(manifest);
}

export async function readStagingFixtureOwnership(
  firestore: Firestore
): Promise<{ ownedPaths: Set<string>; storagePrefixes: readonly string[] }> {
  const [legacySnapshot, currentSnapshot] = await firestore.getAll(
    firestore.doc(LEGACY_STAGING_FIXTURE_MANIFEST_PATH),
    firestore.doc(STAGING_FIXTURE_MANIFEST_PATH)
  );
  const snapshots = [legacySnapshot, currentSnapshot].filter((snapshot) => snapshot.exists);
  if (snapshots.length > 1) {
    throw new Error('PROMOTION: refusing multiple active staging fixture ownership manifests');
  }
  if (snapshots.length === 0) {
    const fallback = buildStagingFixturePlan();
    const legacyFallback = buildLegacyStagingFixturePlanV1('2026-10-12');
    return {
      ownedPaths: new Set([...fallback.ownedFirestorePaths, ...legacyFallback.ownedFirestorePaths]),
      storagePrefixes: [...fallback.storagePrefixes, ...legacyFallback.storagePrefixes],
    };
  }
  const snapshot = snapshots[0]!;
  const raw = snapshot.data();
  if (
    (raw?.fixtureId !== STAGING_FIXTURE_ID && raw?.fixtureId !== LEGACY_STAGING_FIXTURE_ID) ||
    (raw.version !== STAGING_FIXTURE_VERSION && raw.version !== LEGACY_STAGING_FIXTURE_VERSION) ||
    raw.projectId !== STAGING_PROJECT_ID || !Array.isArray(raw.ownedFirestorePaths) ||
    raw.ownedFirestorePaths.some((path: unknown) => typeof path !== 'string') ||
    !Array.isArray(raw.storagePrefixes) || raw.storagePrefixes.some((path: unknown) => typeof path !== 'string') ||
    !Array.isArray(raw.authUids) || raw.authUids.some((uid: unknown) => typeof uid !== 'string') ||
    !Array.isArray(raw.resourceClaimOwnership) ||
    raw.resourceClaimOwnership.some((entry: unknown) =>
      !entry || typeof entry !== 'object' || Array.isArray(entry) ||
      typeof (entry as Record<string, unknown>).claimPath !== 'string' ||
      !Array.isArray((entry as Record<string, unknown>).guardPaths) ||
      ((entry as Record<string, unknown>).guardPaths as unknown[]).some((path) => typeof path !== 'string')
    ) ||
    (Object.hasOwn(raw ?? {}, 'scheduleAnchorDate') && typeof raw?.scheduleAnchorDate !== 'string') ||
    raw.status !== 'active'
  ) {
    throw new Error('PROMOTION: refusing invalid or foreign staging fixture ownership manifest');
  }
  const expectedPath = raw.fixtureId === LEGACY_STAGING_FIXTURE_ID
    ? LEGACY_STAGING_FIXTURE_MANIFEST_PATH
    : STAGING_FIXTURE_MANIFEST_PATH;
  if (snapshot.ref.path !== expectedPath) {
    throw new Error('PROMOTION: refusing fixture ownership manifest at an unexpected path');
  }
  let expected;
  try {
    expected = buildStagingFixturePlanForManifest({
      fixtureId: raw.fixtureId,
      version: raw.version,
      ...(typeof raw.scheduleAnchorDate === 'string'
        ? { scheduleAnchorDate: raw.scheduleAnchorDate }
        : {}),
    });
    assertStagingFixtureManifestMatchesPlan(
      {
        fixtureId: raw.fixtureId,
        version: raw.version,
        ...(typeof raw.scheduleAnchorDate === 'string'
          ? { scheduleAnchorDate: raw.scheduleAnchorDate }
          : {}),
        ownedFirestorePaths: raw.ownedFirestorePaths as string[],
        authUids: raw.authUids as string[],
        storagePrefixes: raw.storagePrefixes as string[],
        resourceClaimOwnership: raw.resourceClaimOwnership as ResourceClaimOwnership[],
      },
      expected
    );
  } catch {
    throw new Error('PROMOTION: refusing stale staging fixture ownership manifest');
  }
  return {
    ownedPaths: new Set(raw.ownedFirestorePaths as string[]),
    storagePrefixes: raw.storagePrefixes as string[],
  };
}

export function shouldExcludeSource(
  doc: SourceDocument,
  fixturePaths: ReadonlySet<string>,
  countExcluded: (reason: string, path: string) => void
): boolean {
  if (fixturePaths.has(doc.path)) {
    countExcluded('fixture_owned', doc.path);
    return true;
  }
  if (doc.data.testSessionId !== undefined || doc.data.dataScope === 'test') {
    countExcluded('test_scoped', doc.path);
    return true;
  }
  if (doc.data.dataScope !== undefined && doc.data.dataScope !== 'live') {
    countExcluded('invalid_scope', doc.path);
    return true;
  }
  return false;
}

function makeRecord(input: {
  readonly kind: PromotionSourceDocument['kind'];
  readonly logicalKey: string;
  readonly sourcePath: string;
  readonly sourceId: string;
  readonly payload: Record<string, unknown>;
  readonly issues: readonly string[];
}): PromotionSourceDocument {
  const issueList = [...input.issues];
  const base = {
    kind: input.kind,
    logicalKey: input.logicalKey,
    sourcePath: input.sourcePath,
    sourceId: input.sourceId,
    selected: true,
    sourceHash: stableHash(input.payload),
    payload: jsonSafe(input.payload) as Record<string, unknown>,
    ...(issueList.length ? { issues: [...new Set(issueList)].sort() } : {}),
  };
  if (!issueList.length) {
    try {
      validateSourcePayload(base as PromotionSourceDocument);
    } catch {
      issueList.push('source_payload_invalid');
    }
  }
  return (issueList.length
    ? { ...base, issues: [...new Set(issueList)].sort() }
    : base) as PromotionSourceDocument;
}

async function buildSingletonRecord(input: {
  readonly doc: SourceDocument;
  readonly storageReader?: (path: string) => Promise<MediaBytes>;
  readonly bucketName?: string;
  readonly media: PromotionMediaReference[];
  readonly fixtureStoragePrefixes: readonly string[];
}): Promise<PromotionSourceDocument | undefined> {
  const { doc } = input;
  const raw = normalizeFirestoreDocument(doc.data) ?? doc.data;
  if (doc.path === LESSON_PRICING_SETTINGS_DOCUMENT_PATH) {
    const settings = parseLessonPricingSettings(raw);
    if (!settings) return makeRecord({
      kind: 'lesson_pricing_settings', logicalKey: 'lesson_booking', sourcePath: doc.path,
      sourceId: LESSON_PRICING_SETTINGS_ID, payload: {}, issues: ['invalid_lesson_pricing_settings'],
    });
    return makeRecord({
      kind: 'lesson_pricing_settings', logicalKey: 'lesson_booking', sourcePath: doc.path,
      sourceId: LESSON_PRICING_SETTINGS_ID,
      payload: {
        additionalParticipantSurchargePerHourKzt: settings.additionalParticipantSurchargePerHourKzt,
        maxParticipantsPerLesson: settings.maxParticipantsPerLesson,
      }, issues: [],
    });
  }
  if (doc.path === 'settings/skill_config') {
    return makeRecord({ kind: 'skill_config', logicalKey: 'skill_config', sourcePath: doc.path,
      sourceId: 'skill_config', payload: pick(raw, ['passPercentage', 'items']), issues: [] });
  }
  if (doc.path === 'settings/achievements_config') {
    return makeRecord({ kind: 'achievements_config', logicalKey: 'achievements_config', sourcePath: doc.path,
      sourceId: 'achievements_config', payload: pick(raw, ['items']), issues: [] });
  }
  if (doc.path === 'settings/instructor_filters') {
    return makeRecord({ kind: 'instructor_filters', logicalKey: 'instructor_filters', sourcePath: doc.path,
      sourceId: 'instructor_filters', payload: pick(raw, ['enabled']), issues: [] });
  }
  if (doc.path !== 'resort_data/config') return undefined;
  const payload = pick(raw, ['slides', 'slideIntervalSeconds', 'slidesRandomOrder']);
  if (Array.isArray(payload.slides)) {
    payload.slides = payload.slides.map((slide) => slide && typeof slide === 'object' && !Array.isArray(slide)
      ? pick(slide as Record<string, unknown>, [
        'id', 'line1En', 'line1Ru', 'line2En', 'line2Ru', 'line3En', 'line3Ru', 'backgroundImage', 'hidden',
      ])
      : slide);
  }
  const issues: string[] = [];
  if (Array.isArray(payload.slides)) {
    for (let index = 0; index < payload.slides.length; index += 1) {
      await sanitizeBannerField({
        payload, fieldPath: `slides.${index}.backgroundImage`,
        storageReader: input.storageReader, bucketName: input.bucketName, media: input.media,
        fixtureStoragePrefixes: input.fixtureStoragePrefixes,
        onIssue: (reason) => issues.push(reason),
      });
    }
  }
  return makeRecord({ kind: 'resort_slides', logicalKey: 'resort_slides', sourcePath: doc.path,
    sourceId: 'resort_config', payload, issues });
}

async function sanitizeBannerField(input: {
  readonly payload: Record<string, unknown>;
  readonly fieldPath: string;
  readonly storageReader?: (path: string) => Promise<MediaBytes>;
  readonly bucketName?: string;
  readonly fixtureStoragePrefixes?: readonly string[];
  readonly media: PromotionMediaReference[];
  readonly onIssue: (reason: string) => void;
}): Promise<void> {
  const value = getPathValue(input.payload, input.fieldPath);
  if (typeof value !== 'string' || !value) return;
  if (isSupportedResortSlideLogicalImageKey(value)) return;
  if (isAllowedResortSlideYandexUrl(value)) return;
  const firebase = parseFirebaseDownloadUrl(value);
  if (!firebase) {
    setPathValue(input.payload, input.fieldPath, INVALID_MEDIA_PLACEHOLDER);
    input.onIssue('unsupported_media_reference');
    return;
  }
  if (input.fixtureStoragePrefixes?.some((prefix) =>
    firebase.objectPath === prefix || firebase.objectPath.startsWith(`${prefix.replace(/\/$/, '')}/`))) {
    setPathValue(input.payload, input.fieldPath, INVALID_MEDIA_PLACEHOLDER);
    input.onIssue('fixture_owned_media');
    return;
  }
  if (!isAllowedBannerStorageObjectPath(firebase.objectPath)) {
    setPathValue(input.payload, input.fieldPath, INVALID_MEDIA_PLACEHOLDER);
    input.onIssue('storage_object_outside_promotion_allowlist');
    return;
  }
  if (!input.bucketName || firebase.bucket !== input.bucketName || !input.storageReader) {
    setPathValue(input.payload, input.fieldPath, INVALID_MEDIA_PLACEHOLDER);
    input.onIssue('staging_storage_bucket_unverified');
    return;
  }
  try {
    const object = await input.storageReader(firebase.objectPath);
    if (!object.bytes.length || object.bytes.length > PROMOTION_MEDIA_MAX_BYTES) {
      throw new Error('unsupported_size');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(object.contentType)) {
      throw new Error('unsupported_content_type');
    }
    const sha256 = createHash('sha256').update(object.bytes).digest('hex');
    const mediaKey = `media:${stableHash({
      ownerLogicalKey: 'resort_slides',
      fieldPath: input.fieldPath,
      sha256,
    }).slice(0, 32)}`;
    input.media.push({
      mediaKey,
      ownerKind: 'resort',
      ownerLogicalKey: 'resort_slides',
      fieldPath: input.fieldPath,
      sourceBucket: firebase.bucket,
      sourceObjectPath: firebase.objectPath,
      sha256,
      contentType: object.contentType,
    });
    setPathValue(input.payload, input.fieldPath, mediaPlaceholderUrl(mediaKey));
  } catch {
    setPathValue(input.payload, input.fieldPath, INVALID_MEDIA_PLACEHOLDER);
    input.onIssue('storage_object_read_or_validation_failed');
  }
}

async function readStorageMedia(bucket: Bucket, objectPath: string): Promise<MediaBytes> {
  const file = bucket.file(objectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > PROMOTION_MEDIA_MAX_BYTES) {
    throw new Error('unsupported_size');
  }
  const [bytes] = await file.download();
  return {
    bytes,
    contentType: (metadata.contentType ?? '').split(';')[0]!.trim().toLowerCase(),
  };
}

function parseFirebaseDownloadUrl(value: string): { bucket: string; objectPath: string } | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return undefined;
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(parsed.pathname);
    if (!match) return undefined;
    return { bucket: decodeURIComponent(match[1]!), objectPath: decodeURIComponent(match[2]!) };
  } catch {
    return undefined;
  }
}

export function isAllowedBannerStorageObjectPath(objectPath: string): boolean {
  return BANNER_OBJECT_PATH.test(objectPath);
}

function pick(raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, jsonSafe(raw[key])]));
}

function jsonSafe(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'dataScope' && key !== 'testSessionId' && key !== 'revision' && key !== 'audit')
      .map(([key, nested]) => [key, jsonSafe(nested)]));
  }
  return undefined;
}

function getPathValue(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}

function setPathValue(value: Record<string, unknown>, path: string, replacement: unknown): void {
  const keys = path.split('.');
  let cursor: Record<string, unknown> | unknown[] = value;
  for (const key of keys.slice(0, -1)) {
    const next = Array.isArray(cursor) ? cursor[Number(key)] : cursor[key];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown> | unknown[];
  }
  const finalKey = keys[keys.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(finalKey)] = replacement;
  else cursor[finalKey] = replacement;
}
