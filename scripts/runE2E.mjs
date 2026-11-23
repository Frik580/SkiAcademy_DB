import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runE2EProcess } from './e2eProcess.mjs';
import { diagnose, heartbeat } from './e2eDiagnostics.mjs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve } from 'node:path';

const lifecycleStarted = Date.now();
const lifecyclePath = process.env.CARVE_E2E_TIMING_PATH;
function markTiming(key) {
  if (!lifecyclePath) return;
  const timings = existsSync(lifecyclePath) ? JSON.parse(readFileSync(lifecyclePath, 'utf8')) : {};
  timings[key] = Date.now();
  writeFileSync(lifecyclePath, JSON.stringify(timings, null, 2));
}

const root = fileURLToPath(new URL('../', import.meta.url));
const projectId = 'demo-ski-school-e2e';
const manifestRoot = resolve(root, '.scratch/test-manifest');
const fallbackRunDirectory = resolve(manifestRoot, `local-${Date.now()}-${process.pid}`);
const requestedRunDirectory = resolve(process.env.CARVE_MANIFEST_RUN_DIR ?? fallbackRunDirectory);
const runRelativePath = relative(manifestRoot, requestedRunDirectory);
// Keep emulator output under the ignored manifest tree, including direct runs.
const emulatorLogDirectory =
  runRelativePath && !runRelativePath.startsWith('..') && !isAbsolute(runRelativePath)
    ? requestedRunDirectory
    : fallbackRunDirectory;
process.env.CARVE_MANIFEST_RUN_DIR ??= emulatorLogDirectory;
const secretPath = fileURLToPath(new URL('../functions/.secret.local', import.meta.url));
const testSecret = 'GUEST_ACTION_TOKEN_SECRET=e2e-guest-action-token-secret\n';
const { assertEmulators } = createRequire(import.meta.url)('./testFirestoreNetworkGuard.cjs');
const guardPath = fileURLToPath(
  new URL('./testFirestoreNetworkGuard.cjs', import.meta.url)
).replaceAll('\\', '/');
const localEnvPath = fileURLToPath(new URL('../functions/.env.local', import.meta.url));

async function captureFailedEmulatorState(args) {
  if (process.env.GCLOUD_PROJECT !== projectId) {
    throw new Error('Diagnostic snapshot requires the isolated E2E demo project.');
  }
  assertEmulators(process.env, ['firestore']);
  const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
  const { getFirestore } = requireFunctions('firebase-admin/firestore');
  const app = initializeApp({ projectId }, 'e2e-failure-diagnostics');
  const db = getFirestore(app);
  try {
    db.settings({ host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
    const outputIndex = args.indexOf('--output');
    const output =
      args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ??
      (outputIndex >= 0 ? args[outputIndex + 1] : undefined) ??
      'test-results';
    const directory = resolve(root, output);
    mkdirSync(directory, { recursive: true });
    const snapshot = { projectId, collections: {} };
    for (const collection of ['participants', 'course_enrollments', 'courses']) {
      // Empty projection: never read or serialize personal fields, credentials or document IDs.
      const result = await db.collection(collection).select().limit(101).get();
      snapshot.collections[collection] = {
        documentCount: Math.min(result.size, 100),
        truncated: result.size > 100,
      };
    }
    writeFileSync(
      resolve(directory, 'emulator-firestore-failure.json'),
      JSON.stringify(snapshot, null, 2)
    );
  } finally {
    try {
      await db.terminate();
    } finally {
      await deleteApp(app);
    }
  }
}

async function run(relativeCli, args, env = process.env, timeoutMs) {
  return runE2EProcess(
    process.execPath,
    [fileURLToPath(new URL(relativeCli, import.meta.url)), ...args],
    {
      cwd: root,
      env,
      timeoutMs,
      group: relativeCli.includes('firebase-tools'),
      ...(relativeCli.includes('firebase-tools') ? { emulatorLogDirectory } : {}),
      stage: relativeCli.includes('firebase-tools')
        ? 'emulator-lifecycle'
        : args[0] === '--snapshot'
          ? 'snapshot'
          : 'playwright',
    }
  );
}

if (process.argv[2] === '--snapshot') {
  try {
    await captureFailedEmulatorState(process.argv.slice(3));
  } catch {
    console.error('Emulator diagnostic snapshot failed.');
    process.exitCode = 1;
  }
} else if (process.argv[2] === '--playwright') {
  diagnose('emulator-startup:ready');
  markTiming('emulatorsReadyAt');
  if (process.env.GCLOUD_PROJECT !== projectId || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Run E2E through npm run test:e2e with the demo emulators.');
  }
  assertEmulators(process.env, ['firestore', 'auth', 'storage']);
  const args = JSON.parse(process.env.CARVE_E2E_PLAYWRIGHT_ARGS ?? '[]');
  diagnose('playwright:start');
  process.exitCode = await run('../node_modules/@playwright/test/cli.js', ['test', ...args]);
  diagnose('playwright:end', { code: process.exitCode });
  markTiming('playwrightFinishedAt');
  if (process.exitCode && ![130, 143].includes(process.exitCode)) {
    try {
      const diagnosticCode = await run(
        './runE2E.mjs',
        ['--snapshot', ...args],
        process.env,
        15_000
      );
      if (diagnosticCode) throw new Error('Diagnostic subprocess failed or timed out.');
    } catch {
      console.error('Emulator diagnostic snapshot failed; preserving the Playwright exit code.');
    }
  }
  diagnose('emulator-shutdown:start');
} else {
  if (existsSync(localEnvPath)) {
    throw new Error(
      'Preserve functions/.env.local; run E2E in a clean checkout without local Functions overrides.'
    );
  }
  mkdirSync(new URL('../.scratch/test-egress/', import.meta.url), { recursive: true });
  const ledger = fileURLToPath(
    new URL(`../.scratch/test-egress/e2e-${process.pid}.log`, import.meta.url)
  );
  writeFileSync(ledger, '');
  const nodeOptions =
    `${process.env.NODE_OPTIONS ?? ''} --require=${JSON.stringify(guardPath)}`.trim();
  const timingPath = resolve(
    process.env.CARVE_MANIFEST_RUN_DIR ?? resolve(root, '.scratch/test-manifest'),
    `e2e-${process.pid}.timing.json`
  );
  mkdirSync(resolve(timingPath, '..'), { recursive: true });
  writeFileSync(timingPath, JSON.stringify({ lifecycleStartedAt: lifecycleStarted }));
  process.env.CARVE_E2E_DIAGNOSTICS_DIR ??= resolve(
    timingPath,
    '..',
    `e2e-${process.pid}-diagnostics`
  );
  diagnose('emulator-startup:start');
  const stopHeartbeat = heartbeat('emulator-lifecycle:heartbeat');
  let createdSecret = false;
  try {
    if (existsSync(secretPath)) {
      if (!/^GUEST_ACTION_TOKEN_SECRET\s*=/m.test(readFileSync(secretPath, 'utf8'))) {
        throw new Error(
          'Existing functions/.secret.local lacks GUEST_ACTION_TOKEN_SECRET; preserve it and add a local test override.'
        );
      }
    } else {
      writeFileSync(secretPath, testSecret, { flag: 'wx' });
      createdSecret = true;
    }
    process.exitCode = await run(
      '../node_modules/firebase-tools/lib/bin/firebase.js',
      [
        'emulators:exec',
        '--project',
        projectId,
        '--only',
        process.argv.includes('--hosting')
          ? 'auth,firestore,functions,storage,hosting'
          : 'auth,firestore,functions,storage',
        'node scripts/runE2E.mjs --playwright',
      ],
      {
        ...process.env,
        // Windows native watch events can report unchanged build output as modified
        // when the Functions runtime reads it. Poll file metadata to avoid reloads.
        ...(process.platform === 'win32' && {
          CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? 'true',
          CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL ?? '1000',
        }),
        CARVE_E2E_TIMING_PATH: timingPath,
        CARVE_E2E_PLAYWRIGHT_ARGS: JSON.stringify(
          process.argv.slice(2).filter((arg) => arg !== '--hosting')
        ),
        GUEST_ACTION_TOKEN_SECRET: 'e2e-guest-action-token-secret',
        GCLOUD_PROJECT: projectId,
        GOOGLE_CLOUD_PROJECT: projectId,
        CARVE_TEST_HOSTING: process.argv.includes('--hosting') ? 'true' : 'false',
        NODE_OPTIONS: nodeOptions,
        CARVE_TEST_EGRESS_LOG: ledger,
        VITE_FIREBASE_PROJECT_ID: projectId,
        VITE_USE_FIREBASE_EMULATORS: 'true',
      }
    );
  } finally {
    stopHeartbeat();
    diagnose('emulator-shutdown:end', { code: process.exitCode });
    if (
      createdSecret &&
      existsSync(secretPath) &&
      readFileSync(secretPath, 'utf8') === testSecret
    ) {
      unlinkSync(secretPath);
    }
  }
  const timings = JSON.parse(readFileSync(timingPath, 'utf8'));
  timings.lifecycleFinishedAt = Date.now();
  timings.startupMs = timings.emulatorsReadyAt ? timings.emulatorsReadyAt - lifecycleStarted : null;
  timings.shutdownMs = timings.playwrightFinishedAt
    ? Date.now() - timings.playwrightFinishedAt
    : null;
  timings.fixtureSetupMs = timings.fixturesReadyAt - timings.globalSetupStartedAt || null;
  timings.functionReadinessMs = timings.functionsReadyAt - timings.fixturesReadyAt || null;
  timings.playwrightMs = timings.playwrightFinishedAt - timings.emulatorsReadyAt || null;
  writeFileSync(timingPath, JSON.stringify(timings, null, 2));
  const violations = readFileSync(ledger, 'utf8').trim();
  console.log(
    `Firestore egress ledger: ${ledger} (${violations ? 'BLOCKED ATTEMPT' : '0 attempts'})`
  );
  if (violations) {
    console.error(violations);
    process.exitCode = 1;
  }
}
