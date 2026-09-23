import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket, File } from '@google-cloud/storage';
import {
  AccountIdSchema,
  CourseProvisioningManifestSchema,
  CorrelationIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  AggregateRevisionSchema,
  normalizeFirestoreDocument,
  parsePersistedCanonicalScope,
  type CommandEnvelope,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import { parseAccount } from '../canonical/finance/financeStore';
import { parseCourseCatalogContent } from '../canonical/courses/courseCatalogContentStore';
import { parseLessonPricingSettings } from '../canonical/pricing/lessonPricingSettingsStore';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../canonical/transactions/firestoreTransactionExecutor';
import {
  destinationMediaPath,
  planConfigPromotion,
  type PromotionTargetState,
} from './configPromotionPlan';
import {
  PROMOTION_MEDIA_MAX_BYTES,
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  parsePromotionManifest,
  stableHash,
  type ConfigPromotionManifest,
  type PromotionOperation,
  type PromotionSourceDocument,
} from './configPromotionContract';
import { exportStagingConfigManifest } from './configPromotionExport';
import { executePromotionPlan } from './configPromotionExecutor';
import { assertConfigPromotionProject } from './configPromotionProjectGuard';

const GENERATED_MANIFEST_PATH = '.staging-export/config-manifest.json';
const APPLY_REASON = 'Approved staging configuration promotion';

interface CliArguments {
  readonly command: 'export' | 'promote';
  readonly projectId: string;
  readonly manifestPath?: string;
  readonly mode?: 'dry-run' | 'apply';
}

interface StorageObservation {
  readonly file: File;
  readonly exists: boolean;
  readonly hash?: string;
  readonly generation?: string;
  readonly token?: string;
}

function parseArguments(argv: readonly string[]): CliArguments {
  const command = argv[0];
  if (command !== 'export' && command !== 'promote') {
    throw new Error('Usage: configPromotionCli <export|promote> --project <project-id> [--manifest <path>] [--dry-run|--apply]');
  }
  const values = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--dry-run' || arg === '--apply') {
      if (values.has('--dry-run') || values.has('--apply')) throw new Error('PROMOTION: choose exactly one of --dry-run or --apply');
      values.set(arg, true);
      continue;
    }
    if (arg !== '--project' && arg !== '--manifest') throw new Error(`PROMOTION: unsupported argument ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || values.has(arg)) throw new Error(`PROMOTION: missing or duplicate value for ${arg}`);
    values.set(arg, value);
    index += 1;
  }
  const projectId = values.get('--project');
  if (typeof projectId !== 'string') throw new Error('PROMOTION: --project is required');
  if (command === 'export') {
    if (values.has('--manifest') || values.has('--apply') || values.has('--dry-run')) {
      throw new Error('PROMOTION: export accepts only --project');
    }
    return { command, projectId };
  }
  const manifestPath = values.get('--manifest');
  const mode = values.has('--dry-run') ? 'dry-run' : values.has('--apply') ? 'apply' : undefined;
  if (typeof manifestPath !== 'string' || !mode) {
    throw new Error('Usage: prod:promote-config --manifest <path> --dry-run|--apply');
  }
  return { command, projectId, manifestPath, mode };
}

function initializeProjectApp(projectId: string, role: 'source' | 'target'): App {
  const name = role === 'source' ? 'config-promotion-staging-read' : 'config-promotion-production';
  const existing = getApps().find((app) => app.name === name);
  const app = existing ?? initializeApp({ credential: applicationDefault(), projectId }, name);
  assertConfigPromotionProject({ role, explicitProjectId: projectId, adminAppProjectId: app.options.projectId });
  return app;
}

function requireStorageBucketName(role: 'source' | 'target', projectId: string): string {
  const envName = role === 'source'
    ? 'CONFIG_PROMOTION_STAGING_STORAGE_BUCKET'
    : 'CONFIG_PROMOTION_PRODUCTION_STORAGE_BUCKET';
  const name = process.env[envName]?.trim();
  if (!name) throw new Error(`PROMOTION: ${envName} is required when Firebase Storage media is selected`);
  const approvedNames = [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`];
  if (!approvedNames.includes(name)) {
    throw new Error(`PROMOTION: refusing ${role} Storage bucket ${name}; configure the Firebase default bucket for ${projectId}`);
  }
  return name;
}

function openBucket(app: App, role: 'source' | 'target', projectId: string): { bucket: Bucket; name: string } {
  const name = requireStorageBucketName(role, projectId);
  return { bucket: getStorage(app).bucket(name), name };
}

async function runExport(projectId: string): Promise<void> {
  assertConfigPromotionProject({ role: 'source', explicitProjectId: projectId });
  const app = initializeProjectApp(projectId, 'source');
  const firestore = getFirestore(app);
  const storageBucketName = process.env.CONFIG_PROMOTION_STAGING_STORAGE_BUCKET?.trim();
  let bucket: Bucket | undefined;
  if (storageBucketName) {
    const opened = openBucket(app, 'source', projectId);
    bucket = opened.bucket;
  }
  const manifest = await exportStagingConfigManifest({
    firestore,
    ...(bucket ? { bucket } : {}),
    ...(storageBucketName ? { stagingStorageBucketName: storageBucketName } : {}),
  });
  const outputPath = resolve(process.cwd(), GENERATED_MANIFEST_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.info(JSON.stringify({
    result: 'exported',
    outputPath,
    sourceProjectId: manifest.sourceProjectId,
    candidateDocuments: manifest.sourceDocuments.length,
    mediaReferences: manifest.media.length,
    excludedFixtureDocuments: manifest.excludedSummary.fixtureOwnedDocumentCount,
  }, null, 2));
}

async function runPromotion(args: CliArguments): Promise<void> {
  if (args.projectId !== PRODUCTION_PROJECT_ID) throw new Error(`PROMOTION: target must be ${PRODUCTION_PROJECT_ID}`);
  const manifest = await readManifest(args.manifestPath!);
  assertConfigPromotionProject({ role: 'source', explicitProjectId: STAGING_PROJECT_ID });
  assertConfigPromotionProject({ role: 'target', explicitProjectId: args.projectId });

  const sourceApp = initializeProjectApp(STAGING_PROJECT_ID, 'source');
  const targetApp = initializeProjectApp(PRODUCTION_PROJECT_ID, 'target');
  const sourceFirestore = getFirestore(sourceApp);
  const targetFirestore = getFirestore(targetApp);
  await assertInstructorMappingDoesNotReuseStagingAccounts(sourceFirestore, manifest);
  const hasSelectedMedia = manifest.media.some((media) => ownerSelected(manifest, media.ownerLogicalKey));
  const sourceStorage = hasSelectedMedia || manifest.media.length > 0
    ? openBucket(sourceApp, 'source', STAGING_PROJECT_ID)
    : undefined;
  const targetStorage = hasSelectedMedia
    ? openBucket(targetApp, 'target', PRODUCTION_PROJECT_ID)
    : undefined;

  if (sourceStorage) {
    for (const media of manifest.media) {
      if (media.sourceBucket !== sourceStorage.name) throw new Error('PROMOTION: manifest Storage bucket does not match the guarded staging bucket');
    }
  }
  const freshSource = await exportStagingConfigManifest({
    firestore: sourceFirestore,
    ...(sourceStorage ? { bucket: sourceStorage.bucket, stagingStorageBucketName: sourceStorage.name } : {}),
  });
  assertSourceFresh(manifest, freshSource);
  if (args.mode === 'apply' && manifest.media.some((media) => ownerSelected(manifest, media.ownerLogicalKey)) && !targetStorage) {
    throw new Error('PROMOTION: production Storage bucket is required for selected media');
  }

  const adminAccountId = args.mode === 'apply' ? requireAdminAccountId() : undefined;
  const state = await loadTargetState({
    firestore: targetFirestore,
    manifest,
    ...(adminAccountId ? { adminAccountId } : {}),
    ...(targetStorage ? { bucket: targetStorage.bucket } : {}),
  });
  const plan = planConfigPromotion(manifest, state);
  printPlan(plan.operations, manifest);
  if (args.mode === 'dry-run') return;
  if (plan.hasConflicts) throw new Error('PROMOTION: apply stopped because the plan contains CONFLICT operations');
  if (!adminAccountId) throw new Error('PROMOTION: CONFIG_PROMOTION_ADMIN_ACCOUNT_ID is required for --apply');
  const admin = parseAccount(state.documents[`users/${adminAccountId}`]);
  const rawAdmin = state.documents[`users/${adminAccountId}`];
  if (!admin || admin.lifecycle.status !== 'active' || rawAdmin?.role !== 'admin' || isTestRecord(rawAdmin)) {
    throw new Error('PROMOTION: configured operator Account must exist, be active, and have admin role in production');
  }

  const downloadUrls = new Map<string, string>();
  if (targetStorage) {
    for (const media of manifest.media) {
      if (!ownerSelected(manifest, media.ownerLogicalKey)) continue;
      const targetPath = destinationMediaPath(media, manifest);
      if (!targetPath) continue;
      const observation = await observeStorageFile(targetStorage.bucket, targetPath);
      if (observation.hash === media.sha256 && observation.token) {
        downloadUrls.set(media.mediaKey, buildDownloadUrl(targetStorage.name, targetPath, observation.token));
      }
    }
  }

  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(), scope: { dataScope: 'live' } },
    createFirestoreCanonicalTransactionExecutor(targetFirestore)
  );
  const verifiedMutationGroups = new Set<string>();
  await executePromotionPlan(plan, 'apply', async (operation) => {
    if (operation.kind === 'media') {
      if (!sourceStorage || !targetStorage) throw new Error('PROMOTION: guarded Storage buckets are required for selected media');
      const media = manifest.media.find((item) => item.mediaKey === operation.logicalKey);
      if (!media) throw new Error('PROMOTION: planned media reference is missing from the manifest');
      await assertMediaPrecondition(operation, targetStorage.bucket);
      const object = await readSourceMedia(sourceStorage.bucket, media);
      const observation = await observeStorageFile(targetStorage.bucket, operation.targetPath);
      const token = observation.hash === media.sha256 && observation.token ? observation.token : randomUUID();
      if (observation.hash !== media.sha256 || !observation.token) {
        await writeStorageMedia(targetStorage.bucket, operation.targetPath, object.bytes, media.contentType, token, observation);
      }
      const verified = await observeStorageFile(targetStorage.bucket, operation.targetPath);
      if (verified.hash !== media.sha256 || !verified.token) throw new Error(`PROMOTION: Storage postcondition failed at ${operation.targetPath}`);
      downloadUrls.set(media.mediaKey, buildDownloadUrl(targetStorage.name, operation.targetPath, verified.token));
      return;
    }
    const record = findSourceRecordForOperation(manifest, operation);
    const groupKey = mutationGroupKey(operation);
    if (!verifiedMutationGroups.has(groupKey)) {
      await assertDocumentPrecondition(operation, manifest, targetFirestore);
      verifiedMutationGroups.add(groupKey);
    }
    if (!record && operation.kind !== 'instructor_link') throw new Error(`PROMOTION: source record not found for ${operation.operationId}`);
    const payload = record ? resolveMediaPlaceholders(record.payload, downloadUrls) : undefined;
    await executeOperation({
      operation,
      record,
      payload,
      manifest,
      firestore: targetFirestore,
      commands,
      adminAccountId,
    });
  });
  console.info('PROMOTION: apply completed. No delete, Auth, transactional, TEST, or deployment operation was issued.');
}

async function assertInstructorMappingDoesNotReuseStagingAccounts(
  firestore: Firestore,
  manifest: ConfigPromotionManifest
): Promise<void> {
  const mappings = manifest.mappings.instructors.filter((entry) => entry.productionAccountId);
  if (!mappings.length) return;
  const refs = mappings.flatMap((entry) => [
    firestore.doc(`instructors/${entry.stagingInstructorId}`),
    firestore.doc(`users/${entry.productionAccountId}`),
  ]);
  const snapshots = await firestore.getAll(...refs);
  for (let index = 0; index < mappings.length; index += 1) {
    const instructor = snapshots[index * 2]!;
    const stagingAccount = snapshots[index * 2 + 1]!;
    const mappedAccountId = mappings[index]!.productionAccountId;
    if (
      (instructor.exists && instructor.get('linkedAccountId') === mappedAccountId) ||
      stagingAccount.exists
    ) {
      throw new Error('PROMOTION: productionAccountId must be independently mapped and cannot reuse the staging Account/Auth UID');
    }
  }
}

async function readManifest(path: string): Promise<ConfigPromotionManifest> {
  const absolutePath = resolve(process.cwd(), path);
  const contents = await readFile(absolutePath, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > 16 * 1024 * 1024) throw new Error('PROMOTION: manifest exceeds 16 MiB limit');
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('PROMOTION: manifest is not valid JSON');
  }
  return parsePromotionManifest(parsed);
}

function assertSourceFresh(manifest: ConfigPromotionManifest, current: ConfigPromotionManifest): void {
  const projection = (value: ConfigPromotionManifest) => ({
    documents: value.sourceDocuments.map((record) => ({
      kind: record.kind,
      sourcePath: record.sourcePath,
      sourceId: record.sourceId,
      sourceDayPaths: record.kind === 'course' ? record.sourceDayPaths : undefined,
      sourceHash: record.sourceHash,
      issues: record.issues ?? [],
    })).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    media: value.media.map((item) => ({
      mediaKey: item.mediaKey, ownerKind: item.ownerKind, ownerLogicalKey: item.ownerLogicalKey,
      fieldPath: item.fieldPath, sourceBucket: item.sourceBucket, sourceObjectPath: item.sourceObjectPath,
      sha256: item.sha256, contentType: item.contentType,
    })).sort((a, b) => a.mediaKey.localeCompare(b.mediaKey)),
  });
  if (stableHash(projection(manifest)) !== stableHash(projection(current))) {
    throw new Error('PROMOTION: staging source changed after export; re-export and review the manifest');
  }
}

function requireAdminAccountId(): string {
  const parsed = AccountIdSchema.safeParse(process.env.CONFIG_PROMOTION_ADMIN_ACCOUNT_ID?.trim());
  if (!parsed.success) throw new Error('PROMOTION: CONFIG_PROMOTION_ADMIN_ACCOUNT_ID must be a production Account ID for --apply');
  return parsed.data;
}

async function loadTargetState(input: {
  readonly firestore: Firestore;
  readonly manifest: ConfigPromotionManifest;
  readonly adminAccountId?: string;
  readonly bucket?: Bucket;
}): Promise<PromotionTargetState> {
  const paths = new Set<string>();
  const courseIds = new Set<string>();
  for (const record of input.manifest.sourceDocuments) {
    if (!record.selected) continue;
    if (record.kind === 'instructor') {
      const mapping = input.manifest.mappings.instructors.find((entry) => entry.stagingInstructorId === record.sourceId);
      if (mapping?.productionInstructorId) paths.add(`instructors/${mapping.productionInstructorId}`);
      if (mapping?.productionAccountId) paths.add(`users/${mapping.productionAccountId}`);
    } else if (record.kind === 'course' || record.kind === 'course_catalog_content') {
      const mapping = input.manifest.mappings.courses.find((entry) => entry.stagingCourseId === record.sourceId);
      const courseId = mapping?.productionCourseId ?? mapping?.stagingCourseId;
      if (courseId) {
        courseIds.add(courseId);
        paths.add(`courses/${courseId}`);
        if (record.kind === 'course_catalog_content') paths.add(`course_catalog_content/${courseId}`);
      }
    } else paths.add(record.sourcePath);
  }
  if (input.adminAccountId) paths.add(`users/${input.adminAccountId}`);
  const documents: Record<string, Record<string, unknown> | undefined> = {};
  const pathList = [...paths].sort();
  const snapshots = pathList.length ? await input.firestore.getAll(...pathList.map((path) => input.firestore.doc(path))) : [];
  snapshots.forEach((snapshot, index) => {
    documents[pathList[index]!] = snapshot.exists
      ? (normalizeFirestoreDocument(snapshot.data() as Record<string, unknown>) as Record<string, unknown>)
      : undefined;
  });
  const courseDaysById: Record<string, readonly Record<string, unknown>[]> = {};
  await Promise.all([...courseIds].map(async (courseId) => {
    courseDaysById[courseId] = await readTargetDays(input.firestore, courseId);
  }));
  const mediaHashes: Record<string, string | undefined> = {};
  const mediaVersions: Record<string, string | undefined> = {};
  const mediaUrlReady: Record<string, boolean | undefined> = {};
  if (input.bucket) {
    await Promise.all(input.manifest.media.filter((media) => ownerSelected(input.manifest, media.ownerLogicalKey)).map(async (media) => {
      const destination = destinationMediaPath(media, input.manifest);
      if (!destination) return;
      const observation = await observeStorageFile(input.bucket!, destination);
      mediaHashes[destination] = observation.hash;
      mediaVersions[destination] = observation.generation;
      mediaUrlReady[destination] = Boolean(observation.token);
    }));
  }
  return { documents, courseDaysById, mediaHashes, mediaVersions, mediaUrlReady };
}

async function readTargetDays(firestore: Firestore, courseId: string): Promise<Record<string, unknown>[]> {
  const query = firestore.collection(`courses/${courseId}/days`).orderBy('__name__').limit(200);
  const snapshot = await query.get();
  if (snapshot.size === 200) throw new Error(`PROMOTION: target Course ${courseId} exceeds the CourseDay safety bound`);
  return snapshot.docs.map((doc) => normalizeFirestoreDocument(doc.data() as Record<string, unknown>) as Record<string, unknown>);
}

async function assertDocumentPrecondition(
  operation: PromotionOperation,
  manifest: ConfigPromotionManifest,
  firestore: Firestore
): Promise<void> {
  let precondition: unknown;
  if (operation.kind === 'instructor') {
    const mapping = manifest.mappings.instructors.find((entry) => entry.logicalKey === operation.logicalKey);
    if (!mapping?.productionAccountId) throw new Error('PROMOTION: instructor mapping is incomplete');
    const [instructor, account] = await Promise.all([
      getNormalizedDocument(firestore, operation.targetPath),
      getNormalizedDocument(firestore, `users/${mapping.productionAccountId}`),
    ]);
    precondition = { instructor: instructor ?? null, account: account ?? null };
  } else if (operation.kind === 'instructor_link') {
    const mapping = manifest.mappings.instructors.find((entry) => entry.logicalKey === operation.logicalKey);
    if (!mapping?.productionAccountId) throw new Error('PROMOTION: instructor link mapping is incomplete');
    const [instructor, account] = await Promise.all([
      getNormalizedDocument(firestore, operation.targetPath),
      getNormalizedDocument(firestore, `users/${mapping.productionAccountId}`),
    ]);
    precondition = { instructor: instructor ?? null, account: account ?? null };
  } else if (operation.kind === 'course') {
    const course = await getNormalizedDocument(firestore, operation.targetPath);
    if (operation.status === 'CREATE' && course) throw new Error(`PROMOTION: Course create precondition changed at ${operation.targetPath}`);
    const courseId = operation.targetPath.slice('courses/'.length);
    const days = await readTargetDays(firestore, courseId);
    precondition = { course: course ?? null, days };
  } else {
    const current = await getNormalizedDocument(firestore, operation.targetPath);
    precondition = current ?? null;
  }
  if (stableHash(precondition) !== operation.targetPreconditionHash) {
    throw new Error(`PROMOTION: target changed after planning at ${operation.targetPath}; regenerate the dry-run`);
  }
}

function mutationGroupKey(operation: PromotionOperation): string {
  if (operation.kind === 'instructor' || operation.kind === 'instructor_link') {
    return `instructor:${operation.logicalKey}`;
  }
  return `${operation.kind}:${operation.targetPath}`;
}

async function assertMediaPrecondition(operation: PromotionOperation, bucket: Bucket): Promise<void> {
  const observation = await observeStorageFile(bucket, operation.targetPath);
  const ready = Boolean(observation.token);
  const actual = stableHash({
    hash: observation.hash ?? null,
    generation: observation.generation ?? null,
    ready,
  });
  if (actual !== operation.targetPreconditionHash) {
    throw new Error(`PROMOTION: target media changed after planning at ${operation.targetPath}; regenerate the dry-run`);
  }
}

async function getNormalizedDocument(firestore: Firestore, path: string): Promise<Record<string, unknown> | undefined> {
  const snapshot = await firestore.doc(path).get();
  return snapshot.exists
    ? normalizeFirestoreDocument(snapshot.data() as Record<string, unknown>) as Record<string, unknown>
    : undefined;
}

async function executeOperation(input: {
  readonly operation: PromotionOperation;
  readonly record?: PromotionSourceDocument;
  readonly payload: unknown;
  readonly manifest: ConfigPromotionManifest;
  readonly firestore: Firestore;
  readonly commands: ReturnType<typeof createProductionCanonicalCommands>;
  readonly adminAccountId: string;
}): Promise<void> {
  const { operation, record } = input;
  const idempotencyKey = `promotion:${operation.operationId}`;
  const correlationId = CorrelationIdSchema.parse(`correlation_promotion_${operation.operationId}`);
  const commandContext = {
    actor: { kind: 'account' as const, accountId: AccountIdSchema.parse(input.adminAccountId) },
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
  };
  const payload = input.payload as Record<string, unknown>;
  let result: { status: string } | undefined;

  if (record?.kind === 'instructor' && operation.kind === 'instructor') {
    const instructorId = InstructorIdSchema.parse(operation.targetPath.slice('instructors/'.length));
    const raw = await getNormalizedDocument(input.firestore, operation.targetPath);
    if (!raw) throw new Error(`PROMOTION: production Instructor disappeared at ${operation.targetPath}`);
    const envelope = {
      kind: 'update_instructor_catalog_profile',
      context: { ...commandContext, expectedRevision: AggregateRevisionSchema.parse(Number(raw.revision ?? 0)) },
      intent: { instructorId, ...payload, reasonExplanation: APPLY_REASON },
    } as CommandEnvelope<'update_instructor_catalog_profile'>;
    result = await input.commands.execute(envelope);
  } else if (operation.kind === 'instructor_link') {
    const mapping = input.manifest.mappings.instructors.find((entry) => entry.logicalKey === operation.logicalKey);
    if (!mapping?.productionAccountId || !mapping.productionInstructorId) {
      throw new Error('PROMOTION: instructor link mapping is incomplete');
    }
    const accountId = AccountIdSchema.parse(mapping.productionAccountId);
    const instructorId = InstructorIdSchema.parse(mapping.productionInstructorId);
    const account = parseAccount(await getNormalizedDocument(input.firestore, `users/${accountId}`));
    if (!account) throw new Error('PROMOTION: mapped production Account disappeared before instructor linkage');
    const envelope = {
      kind: 'link_account_instructor_catalog',
      context: { ...commandContext, expectedRevision: AggregateRevisionSchema.parse(account.revision) },
      intent: { accountId, instructorId, reasonExplanation: APPLY_REASON },
    } as CommandEnvelope<'link_account_instructor_catalog'>;
    result = await input.commands.execute(envelope);
  } else if (record?.kind === 'course' && operation.kind === 'course') {
    const courseId = CourseIdSchema.parse(operation.targetPath.slice('courses/'.length));
    const courseManifest = mapCourseManifestForApply(record.payload as CourseProvisioningManifest, courseId, input.manifest);
    const envelope = {
      kind: 'apply_canonical_course_provisioning_manifest',
      context: commandContext,
      intent: { manifest: courseManifest, dryRun: false, createOnly: true },
    } as CommandEnvelope<'apply_canonical_course_provisioning_manifest'>;
    result = await input.commands.execute(envelope);
  } else if (record?.kind === 'course_catalog_content' && operation.kind === 'course_catalog_content') {
    const courseId = CourseIdSchema.parse(operation.targetPath.slice('course_catalog_content/'.length));
    const current = await getNormalizedDocument(input.firestore, operation.targetPath);
    const parsed = parseCourseCatalogContent(current, courseId);
    const envelope = {
      kind: 'update_course_catalog_content',
      context: { ...commandContext, expectedRevision: AggregateRevisionSchema.parse(parsed?.revision ?? 0) },
      intent: { courseId, content: payload, reasonExplanation: APPLY_REASON },
    } as CommandEnvelope<'update_course_catalog_content'>;
    result = await input.commands.execute(envelope);
  } else if (record?.kind === 'lesson_pricing_settings') {
    const current = await getNormalizedDocument(input.firestore, operation.targetPath);
    const settings = parseLessonPricingSettings(current);
    const envelope = {
      kind: 'update_lesson_pricing_settings',
      context: { ...commandContext, expectedRevision: AggregateRevisionSchema.parse(settings?.revision ?? 0) },
      intent: { ...payload, reasonExplanation: APPLY_REASON },
    } as CommandEnvelope<'update_lesson_pricing_settings'>;
    result = await input.commands.execute(envelope);
  } else {
    if (!record) throw new Error(`PROMOTION: source record not found for ${operation.operationId}`);
    await writeAllowlistedConfigWithPrecondition(input.firestore, operation, record.kind, payload);
    return;
  }
  if (!result || result.status !== 'success') {
    throw new Error(`PROMOTION: canonical operation failed at ${operation.targetPath}`);
  }
}

function mapCourseManifestForApply(
  source: CourseProvisioningManifest,
  targetCourseId: string,
  manifest: ConfigPromotionManifest
): CourseProvisioningManifest {
  const mapInstructorId = (sourceId: string): string | undefined =>
    manifest.mappings.instructors.find((entry) => entry.stagingInstructorId === sourceId)?.productionInstructorId;
  const instructorRosterIds = source.instructorRosterIds.map(mapInstructorId);
  const days = source.days.map((day) => ({ ...day, instructorId: mapInstructorId(day.instructorId) }));
  if (instructorRosterIds.some((id) => !id) || days.some((day) => !day.instructorId)) {
    throw new Error(`PROMOTION: production instructor mapping is incomplete for Course ${targetCourseId}`);
  }
  const mapped = {
    ...source,
    courseId: CourseIdSchema.parse(targetCourseId),
    instructorRosterIds,
    days,
  };
  const cleaned = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
  return CourseProvisioningManifestSchema.parse(cleaned);
}

async function writeAllowlistedConfigWithPrecondition(
  firestore: Firestore,
  operation: PromotionOperation,
  kind: PromotionSourceDocument['kind'],
  payload: Record<string, unknown>
): Promise<void> {
  const ref = firestore.doc(operation.targetPath);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const raw = snapshot.exists
      ? normalizeFirestoreDocument(snapshot.data() as Record<string, unknown>) as Record<string, unknown>
      : undefined;
    if (raw && isTestRecord(raw)) throw new Error(`PROMOTION: target config is not live at ${operation.targetPath}`);
    const actual = stableHash(raw ?? null);
    if (actual !== operation.targetPreconditionHash) {
      throw new Error(`PROMOTION: target changed inside config write transaction at ${operation.targetPath}`);
    }
    const safePayload = kind === 'resort_slides'
      ? { slides: payload.slides, slideIntervalSeconds: payload.slideIntervalSeconds, slidesRandomOrder: payload.slidesRandomOrder }
      : payload;
    transaction.set(ref, safePayload, { merge: true });
  });
}

function findSourceRecordForOperation(
  manifest: ConfigPromotionManifest,
  operation: PromotionOperation
): PromotionSourceDocument | undefined {
  if (operation.kind === 'media' || operation.kind === 'instructor_link') return undefined;
  return manifest.sourceDocuments.find((record) => record.kind === operation.kind && record.logicalKey === operation.logicalKey);
}

function resolveMediaPlaceholders(
  payload: unknown,
  downloadUrls: ReadonlyMap<string, string>
): unknown {
  if (typeof payload === 'string' && payload.startsWith('promotion-media://')) {
    const mediaKey = payload.slice('promotion-media://'.length);
    const url = downloadUrls.get(mediaKey);
    if (!url) throw new Error(`PROMOTION: target URL for media ${mediaKey} is unavailable`);
    return url;
  }
  if (Array.isArray(payload)) return payload.map((item) => resolveMediaPlaceholders(item, downloadUrls));
  if (!payload || typeof payload !== 'object') return payload;
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>)
    .map(([key, value]) => [key, resolveMediaPlaceholders(value, downloadUrls)]));
}

function ownerSelected(manifest: ConfigPromotionManifest, logicalKey: string): boolean {
  return Boolean(manifest.sourceDocuments.find((record) => record.logicalKey === logicalKey)?.selected);
}

async function readSourceMedia(bucket: Bucket, media: ConfigPromotionManifest['media'][number]): Promise<{ bytes: Buffer }> {
  const file = bucket.file(media.sourceObjectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > PROMOTION_MEDIA_MAX_BYTES) throw new Error('PROMOTION: source media size is outside the configured bound');
  const [bytes] = await file.download();
  if (metadata.contentType?.split(';')[0]?.trim().toLowerCase() !== media.contentType || stableHashBytes(bytes) !== media.sha256) {
    throw new Error(`PROMOTION: source media changed after export at ${media.sourceObjectPath}`);
  }
  return { bytes };
}

async function observeStorageFile(bucket: Bucket, path: string): Promise<StorageObservation> {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return { file, exists: false };
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > PROMOTION_MEDIA_MAX_BYTES) throw new Error(`PROMOTION: target media size is outside the configured bound at ${path}`);
  const [bytes] = await file.download();
  const tokensRaw = metadata.metadata?.firebaseStorageDownloadTokens;
  const token = typeof tokensRaw === 'string' ? tokensRaw.split(',')[0]?.trim() : undefined;
  return {
    file,
    exists: true,
    hash: stableHashBytes(bytes),
    generation: typeof metadata.generation === 'string' ? metadata.generation : String(metadata.generation),
    ...(token ? { token } : {}),
  };
}

async function writeStorageMedia(
  bucket: Bucket,
  path: string,
  bytes: Buffer,
  contentType: string,
  token: string,
  current: StorageObservation
): Promise<void> {
  await current.file.save(bytes, {
    resumable: false,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
    preconditionOpts: { ifGenerationMatch: current.exists ? Number(current.generation) : 0 },
  });
}

function buildDownloadUrl(bucket: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

function stableHashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isTestRecord(raw: Record<string, unknown>): boolean {
  if (raw.testSessionId !== undefined) return true;
  try {
    return parsePersistedCanonicalScope(raw, { allowLegacyLive: true }).dataScope !== 'live';
  } catch {
    return true;
  }
}

function printPlan(operations: readonly PromotionOperation[], manifest: ConfigPromotionManifest): void {
  console.info(JSON.stringify({
    sourceProjectId: manifest.sourceProjectId,
    targetProjectId: PRODUCTION_PROJECT_ID,
    mode: 'reviewable-plan',
    excludedSummary: manifest.excludedSummary,
    operations: operations.map((operation) => ({
      status: operation.status,
      kind: operation.kind,
      logicalKey: operation.logicalKey,
      targetPath: operation.targetPath,
      changedFields: operation.changedFields,
      sourceHash: operation.sourceHash,
      ...(operation.targetHash ? { targetHash: operation.targetHash } : {}),
      ...(operation.reason ? { reason: operation.reason } : {}),
    })),
  }, null, 2));
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.command === 'export') await runExport(args.projectId);
  else await runPromotion(args);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
