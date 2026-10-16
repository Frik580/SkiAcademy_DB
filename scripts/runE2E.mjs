import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const projectId = 'demo-ski-school-e2e';
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
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL(relativeCli, import.meta.url)), ...args],
    {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    }
  );
  const interrupt = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGINT');
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  // Diagnostics run in a separate process so a stuck SDK retry cannot hold CI open.
  const timer = timeoutMs ? setTimeout(interrupt, timeoutMs) : undefined;
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[2] === '--snapshot') {
  try {
    await captureFailedEmulatorState(process.argv.slice(3));
  } catch {
    console.error('Emulator diagnostic snapshot failed.');
    process.exitCode = 1;
  }
} else if (process.argv[2] === '--playwright') {
  if (process.env.GCLOUD_PROJECT !== projectId || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Run E2E through npm run test:e2e with the demo emulators.');
  }
  assertEmulators(process.env, ['firestore', 'auth', 'storage']);
  const args = JSON.parse(process.env.CARVE_E2E_PLAYWRIGHT_ARGS ?? '[]');
  process.exitCode = await run('../node_modules/@playwright/test/cli.js', ['test', ...args]);
  if (process.exitCode) {
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
        'auth,firestore,functions,storage',
        'node scripts/runE2E.mjs --playwright',
      ],
      {
        ...process.env,
        CARVE_E2E_PLAYWRIGHT_ARGS: JSON.stringify(process.argv.slice(2)),
        GUEST_ACTION_TOKEN_SECRET: 'e2e-guest-action-token-secret',
        NODE_OPTIONS: nodeOptions,
        CARVE_TEST_EGRESS_LOG: ledger,
        VITE_FIREBASE_PROJECT_ID: projectId,
        VITE_USE_FIREBASE_EMULATORS: 'true',
      }
    );
  } finally {
    if (
      createdSecret &&
      existsSync(secretPath) &&
      readFileSync(secretPath, 'utf8') === testSecret
    ) {
      unlinkSync(secretPath);
    }
  }
  const violations = readFileSync(ledger, 'utf8').trim();
  console.log(
    `Firestore egress ledger: ${ledger} (${violations ? 'BLOCKED ATTEMPT' : '0 attempts'})`
  );
  if (violations) {
    console.error(violations);
    process.exitCode = 1;
  }
}
