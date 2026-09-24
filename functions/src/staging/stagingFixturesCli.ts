import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  ResourceClaimGuardSchema,
  nextAggregateRevision,
  parseAccountDocument,
  timestampFromDate,
  type CommandEnvelope,
  type CommandKind,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../canonical/transactions/firestoreTransactionExecutor';
import {
  LEGACY_STAGING_FIXTURE_ID,
  LEGACY_STAGING_FIXTURE_MANIFEST_PATH,
  LEGACY_STAGING_FIXTURE_VERSION,
  STAGING_ACCOUNT_IDS,
  STAGING_AUTH_FIXTURES,
  STAGING_FIXTURE_ID,
  STAGING_FIXTURE_MANIFEST_PATH,
  STAGING_FIXTURE_VERSION,
  assertStagingFixtureManifestMatchesPlan,
  buildStagingFixturePlan,
  buildStagingFixturePlanForManifest,
  type ResourceClaimOwnership,
  type StagingFixturePlan,
} from './stagingFixtureDefinitions';
import {
  STAGING_FIREBASE_PROJECT_ID,
  assertStagingMutationEnvironment,
} from './stagingProjectGuard';

type FixtureStatus = 'seeding' | 'active' | 'resetting';

interface StagingFixtureManifestDocument {
  readonly fixtureId: typeof STAGING_FIXTURE_ID | typeof LEGACY_STAGING_FIXTURE_ID;
  readonly version: typeof STAGING_FIXTURE_VERSION | typeof LEGACY_STAGING_FIXTURE_VERSION;
  readonly projectId: typeof STAGING_FIREBASE_PROJECT_ID;
  readonly scheduleAnchorDate?: string;
  readonly ownedFirestorePaths: readonly string[];
  readonly resourceClaimOwnership: readonly ResourceClaimOwnership[];
  readonly authUids: readonly string[];
  readonly storagePrefixes: readonly string[];
  readonly status: FixtureStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const ADMIN_RUNTIME_REVISION_PATHS = [
  'admin_runtime/admin_people',
  'admin_runtime/admin_courses',
  'admin_runtime/admin_finance',
  'admin_runtime/admin_planner',
] as const;

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function parseStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid staging fixture manifest field: ${field}`);
  }
  return value as string[];
}

function parseClaimOwnership(value: unknown): readonly ResourceClaimOwnership[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid staging fixture manifest field: resourceClaimOwnership');
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid staging fixture resource claim ownership entry');
    }
    const record = item as Record<string, unknown>;
    if (typeof record.claimPath !== 'string') {
      throw new Error('Invalid staging fixture resource claim path');
    }
    return {
      claimPath: record.claimPath,
      guardPaths: parseStringArray(record.guardPaths, 'resourceClaimOwnership.guardPaths'),
    };
  });
}

function parseManifest(input: Record<string, unknown>): StagingFixtureManifestDocument {
  const scheduleAnchorDate =
    typeof input.scheduleAnchorDate === 'string' ? input.scheduleAnchorDate : undefined;
  if (
    input.projectId !== STAGING_FIREBASE_PROJECT_ID ||
    (Object.hasOwn(input, 'scheduleAnchorDate') && scheduleAnchorDate === undefined) ||
    typeof input.createdAt !== 'string' ||
    typeof input.updatedAt !== 'string' ||
    (input.status !== 'seeding' && input.status !== 'active' && input.status !== 'resetting')
  ) {
    throw new Error('Invalid or foreign staging fixture manifest');
  }
  const plan = buildStagingFixturePlanForManifest({
    fixtureId: input.fixtureId,
    version: input.version,
    ...(scheduleAnchorDate === undefined ? {} : { scheduleAnchorDate }),
  });
  return {
    fixtureId: plan.fixtureId,
    version: plan.version,
    projectId: STAGING_FIREBASE_PROJECT_ID,
    ...(scheduleAnchorDate === undefined ? {} : { scheduleAnchorDate }),
    ownedFirestorePaths: parseStringArray(input.ownedFirestorePaths, 'ownedFirestorePaths'),
    resourceClaimOwnership: parseClaimOwnership(input.resourceClaimOwnership),
    authUids: parseStringArray(input.authUids, 'authUids'),
    storagePrefixes: parseStringArray(input.storagePrefixes, 'storagePrefixes'),
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function assertManifestMatchesPlan(
  manifest: StagingFixtureManifestDocument,
  plan: StagingFixturePlan
): void {
  assertStagingFixtureManifestMatchesPlan(manifest, plan);
}

function initializeStagingAdminApp(projectId: string): App {
  const appName = 'carve-academy-staging-fixtures';
  const existing = getApps().find((app) => app.name === appName);
  const app =
    existing ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId,
      },
      appName
    );
  assertStagingMutationEnvironment({
    explicitProjectId: projectId,
    adminAppProjectId: app.options.projectId,
  });
  return app;
}

async function authUserExists(auth: Auth, uid: string): Promise<boolean> {
  try {
    await auth.getUser(uid);
    return true;
  } catch (error) {
    if (errorCode(error) === 'auth/user-not-found') return false;
    throw error;
  }
}

async function assertFreshFixtureTargets(
  auth: Auth,
  firestore: Firestore,
  plan: StagingFixturePlan
): Promise<void> {
  for (const fixture of STAGING_AUTH_FIXTURES) {
    if (await authUserExists(auth, fixture.uid)) {
      throw new Error(`STAGING ONLY: Auth uid ${fixture.uid} exists without fixture ownership`);
    }
    try {
      const byEmail = await auth.getUserByEmail(fixture.email);
      throw new Error(
        `STAGING ONLY: Auth email ${fixture.email} is already owned by uid ${byEmail.uid}`
      );
    } catch (error) {
      if (errorCode(error) !== 'auth/user-not-found') throw error;
    }
  }

  const snapshots = await firestore.getAll(
    ...plan.ownedFirestorePaths.map((path) => firestore.doc(path))
  );
  const existing = snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.ref.path);
  if (existing.length > 0) {
    throw new Error(
      `STAGING ONLY: fixture documents exist without manifest ownership: ${existing.join(', ')}`
    );
  }
}

function toManifestDocument(
  plan: StagingFixturePlan,
  status: FixtureStatus,
  createdAt: string
): StagingFixtureManifestDocument {
  return {
    fixtureId: plan.fixtureId,
    version: plan.version,
    projectId: STAGING_FIREBASE_PROJECT_ID,
    ...(plan.scheduleAnchorDate ? { scheduleAnchorDate: plan.scheduleAnchorDate } : {}),
    ownedFirestorePaths: plan.ownedFirestorePaths,
    resourceClaimOwnership: plan.resourceClaimOwnership,
    authUids: plan.authUids,
    storagePrefixes: plan.storagePrefixes,
    status,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

async function ensureSeedManifest(
  auth: Auth,
  firestore: Firestore,
  now: Date
): Promise<{
  readonly manifest: StagingFixtureManifestDocument;
  readonly plan: StagingFixturePlan;
}> {
  const [legacySnapshot, currentSnapshot] = await firestore.getAll(
    firestore.doc(LEGACY_STAGING_FIXTURE_MANIFEST_PATH),
    firestore.doc(STAGING_FIXTURE_MANIFEST_PATH)
  );
  if (legacySnapshot.exists && currentSnapshot.exists) {
    throw new Error('STAGING ONLY: multiple fixture manifests found; refusing overlapping ownership');
  }
  if (legacySnapshot.exists) {
    const manifest = parseManifest(legacySnapshot.data() as Record<string, unknown>);
    const plan = buildStagingFixturePlanForManifest(manifest);
    assertManifestMatchesPlan(manifest, plan);
    throw new Error('STAGING ONLY: v1 fixtures are still owned; run staging:reset before v2 seed');
  }
  if (currentSnapshot.exists) {
    const manifest = parseManifest(currentSnapshot.data() as Record<string, unknown>);
    if (manifest.status === 'resetting') {
      throw new Error('STAGING ONLY: fixture reset is in progress; rerun staging:reset first');
    }
    const plan = buildStagingFixturePlan();
    assertManifestMatchesPlan(manifest, plan);
    return { manifest, plan };
  }

  const manifestRef = firestore.doc(STAGING_FIXTURE_MANIFEST_PATH);
  const plan = buildStagingFixturePlan();
  await assertFreshFixtureTargets(auth, firestore, plan);
  const createdAt = now.toISOString();
  const manifest = toManifestDocument(plan, 'seeding', createdAt);
  await manifestRef.create(manifest);
  return { manifest, plan };
}

function requiredPasswords(env: NodeJS.ProcessEnv): ReadonlyMap<string, string> {
  const passwords = new Map<string, string>();
  for (const fixture of STAGING_AUTH_FIXTURES) {
    const value = env[fixture.passwordEnvironmentVariable];
    if (!value || value.length < 8) {
      throw new Error(
        `${fixture.passwordEnvironmentVariable} is required and must contain at least 8 characters`
      );
    }
    passwords.set(fixture.uid, value);
  }
  return passwords;
}

async function ensureAuthUsers(auth: Auth, passwords: ReadonlyMap<string, string>): Promise<void> {
  for (const fixture of STAGING_AUTH_FIXTURES) {
    const password = passwords.get(fixture.uid)!;
    try {
      const existing = await auth.getUser(fixture.uid);
      if (existing.email !== fixture.email) {
        throw new Error(`STAGING ONLY: Auth uid ${fixture.uid} has an unexpected email`);
      }
      await auth.updateUser(fixture.uid, {
        email: fixture.email,
        displayName: fixture.displayName,
        password,
        emailVerified: true,
        disabled: false,
      });
    } catch (error) {
      if (errorCode(error) !== 'auth/user-not-found') throw error;
      await auth.createUser({
        uid: fixture.uid,
        email: fixture.email,
        displayName: fixture.displayName,
        password,
        emailVerified: true,
        disabled: false,
      });
    }
  }
}

function accountDocument(
  fixture: (typeof STAGING_AUTH_FIXTURES)[number],
  now: Date
): Record<string, unknown> {
  const decidedAt = timestampFromDate(now);
  const correlationId = CorrelationIdSchema.parse(`staging-account-${fixture.uid}`);
  const canonical = AccountSchema.parse({
    accountId: fixture.uid,
    dataScope: 'live',
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: CommandIdSchema.parse('command_staging_fixture_bootstrap'),
      lastChangedByCommandId: CommandIdSchema.parse('command_staging_fixture_bootstrap'),
      correlationId,
    },
  });
  return {
    ...canonical,
    uid: fixture.uid,
    email: fixture.email,
    displayName: fixture.displayName,
    avatarUrl: '',
    role: fixture.uid === STAGING_ACCOUNT_IDS.admin ? 'admin' : 'user',
    isClientActive: true,
  };
}

async function ensureAccountDocuments(firestore: Firestore, now: Date): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const refs = STAGING_AUTH_FIXTURES.map((fixture) => firestore.doc(`users/${fixture.uid}`));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot, index) => {
      const fixture = STAGING_AUTH_FIXTURES[index]!;
      if (!snapshot.exists) {
        transaction.create(snapshot.ref, accountDocument(fixture, now));
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      const account = parseAccountDocument(data);
      if (
        !account ||
        account.accountId !== fixture.uid ||
        account.dataScope !== 'live' ||
        account.testSessionId !== undefined ||
        data.email !== fixture.email ||
        data.displayName !== fixture.displayName
      ) {
        throw new Error(`STAGING ONLY: owned Account ${fixture.uid} has an unexpected shape`);
      }
    });
  });
}

async function executeFixtureCommands(
  firestore: Firestore,
  envelopes: readonly CommandEnvelope<CommandKind>[],
  now: Date
): Promise<void> {
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(now), scope: { dataScope: 'live' } },
    createFirestoreCanonicalTransactionExecutor(firestore)
  );
  for (const envelope of envelopes) {
    const result = await commands.execute(envelope);
    if (result.status !== 'success') {
      throw new Error(`Staging fixture command ${envelope.kind} failed: ${result.error.code}`);
    }
  }
}

async function seed(auth: Auth, firestore: Firestore): Promise<void> {
  const now = new Date();
  const passwords = requiredPasswords(process.env);
  const { manifest, plan } = await ensureSeedManifest(auth, firestore, now);
  await ensureAuthUsers(auth, passwords);
  await ensureAccountDocuments(firestore, now);
  await executeFixtureCommands(firestore, plan.commandEnvelopes, now);
  await firestore.doc(STAGING_FIXTURE_MANIFEST_PATH).update({
    status: 'active',
    updatedAt: new Date().toISOString(),
  });
  const scheduleSuffix = manifest.scheduleAnchorDate
    ? `, legacy schedule anchor ${manifest.scheduleAnchorDate}`
    : '';
  console.info(
    `Staging fixtures ready: ${plan.authUids.length} Auth users, ${plan.ownedFirestorePaths.length} owned documents${scheduleSuffix}.`
  );
}

async function deleteAuthUsers(auth: Auth, uids: readonly string[]): Promise<void> {
  for (const uid of uids) {
    try {
      await auth.deleteUser(uid);
    } catch (error) {
      if (errorCode(error) !== 'auth/user-not-found') throw error;
    }
  }
}

async function removeOwnedGuardEntries(
  firestore: Firestore,
  ownership: readonly ResourceClaimOwnership[]
): Promise<void> {
  const claimIdsByGuard = new Map<string, Set<string>>();
  for (const item of ownership) {
    const claimId = item.claimPath.split('/').at(-1);
    if (!claimId) throw new Error(`Invalid owned resource claim path: ${item.claimPath}`);
    for (const guardPath of item.guardPaths) {
      const ids = claimIdsByGuard.get(guardPath) ?? new Set<string>();
      ids.add(claimId);
      claimIdsByGuard.set(guardPath, ids);
    }
  }

  const resetCommandId = CommandIdSchema.parse('command_staging_fixture_reset');
  const resetCorrelationId = CorrelationIdSchema.parse('correlation_staging_fixture_reset');
  for (const [guardPath, claimIds] of claimIdsByGuard) {
    const guardRef = firestore.doc(guardPath);
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(guardRef);
      if (!snapshot.exists) return;
      const parsed = ResourceClaimGuardSchema.safeParse(snapshot.data());
      if (!parsed.success) {
        throw new Error(`STAGING ONLY: refusing to mutate malformed resource guard ${guardPath}`);
      }
      const remaining = parsed.data.entries.filter((entry) => !claimIds.has(entry.claimId));
      if (remaining.length === parsed.data.entries.length) return;
      if (remaining.length === 0) {
        transaction.delete(guardRef);
        return;
      }
      transaction.set(
        guardRef,
        ResourceClaimGuardSchema.parse({
          ...parsed.data,
          entries: remaining,
          revision: nextAggregateRevision(parsed.data.revision),
          updatedAt: timestampFromDate(new Date()),
          lastChangedByCommandId: resetCommandId,
          correlationId: resetCorrelationId,
        })
      );
    });
  }
}

async function deleteOwnedDocuments(firestore: Firestore, paths: readonly string[]): Promise<void> {
  const chunkSize = 400;
  for (let index = 0; index < paths.length; index += chunkSize) {
    const batch = firestore.batch();
    for (const path of paths.slice(index, index + chunkSize)) {
      batch.delete(firestore.doc(path));
    }
    await batch.commit();
  }
}

async function bumpAdminRuntimeRevisions(firestore: Firestore): Promise<void> {
  const now = timestampFromDate(new Date());
  await firestore.runTransaction(async (transaction) => {
    const refs = ADMIN_RUNTIME_REVISION_PATHS.map((path) => firestore.doc(path));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot) => {
      const current = snapshot.data()?.revision;
      const revision = typeof current === 'number' && Number.isFinite(current) ? current + 1 : 1;
      transaction.set(snapshot.ref, { revision, updatedAt: now });
    });
  });
}

export async function resetStagingFixtures(auth: Auth, firestore: Firestore): Promise<void> {
  const snapshots = await firestore.getAll(
    firestore.doc(LEGACY_STAGING_FIXTURE_MANIFEST_PATH),
    firestore.doc(STAGING_FIXTURE_MANIFEST_PATH)
  );
  const ownedManifests = snapshots.filter((snapshot) => snapshot.exists);
  if (ownedManifests.length > 1) {
    throw new Error('STAGING ONLY: multiple fixture manifests found; refusing overlapping ownership');
  }
  const snapshot = ownedManifests[0];
  if (!snapshot) {
    console.info('No staging fixture manifest found; reset is already complete.');
    return;
  }
  const manifestRef = snapshot.ref;
  const manifest = parseManifest(snapshot.data() as Record<string, unknown>);
  const expectedManifestPath = manifest.fixtureId === LEGACY_STAGING_FIXTURE_ID
    ? LEGACY_STAGING_FIXTURE_MANIFEST_PATH
    : STAGING_FIXTURE_MANIFEST_PATH;
  if (manifestRef.path !== expectedManifestPath) {
    throw new Error('STAGING ONLY: fixture manifest is stored at an unexpected path');
  }
  const plan = buildStagingFixturePlanForManifest(manifest);
  assertManifestMatchesPlan(manifest, plan);
  await manifestRef.update({ status: 'resetting', updatedAt: new Date().toISOString() });
  await deleteAuthUsers(auth, plan.authUids);
  await removeOwnedGuardEntries(firestore, plan.resourceClaimOwnership);
  await deleteOwnedDocuments(firestore, plan.ownedFirestorePaths);
  await bumpAdminRuntimeRevisions(firestore);
  await manifestRef.delete();
  console.info(
    `Staging fixture reset complete: ${plan.authUids.length} Auth users and ${plan.ownedFirestorePaths.length} owned documents targeted.`
  );
}

function parseArguments(argv: readonly string[]): {
  readonly action: 'seed' | 'reset';
  readonly projectId: string;
} {
  const [action, ...rest] = argv;
  if (action !== 'seed' && action !== 'reset') {
    throw new Error('Usage: stagingFixturesCli <seed|reset> --project ski-school-staging');
  }
  const projectIndex = rest.indexOf('--project');
  const projectId = projectIndex >= 0 ? rest[projectIndex + 1] : undefined;
  if (!projectId || rest.length !== 2 || projectIndex !== 0) {
    throw new Error('Usage: stagingFixturesCli <seed|reset> --project ski-school-staging');
  }
  return { action, projectId };
}

async function main(): Promise<void> {
  const { action, projectId: explicitProjectId } = parseArguments(process.argv.slice(2));
  const projectId = assertStagingMutationEnvironment({ explicitProjectId });
  const app = initializeStagingAdminApp(projectId);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  if (action === 'seed') {
    await seed(auth, firestore);
  } else {
    await resetStagingFixtures(auth, firestore);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
