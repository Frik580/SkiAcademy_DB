import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  ROOT,
  DEMO_PROJECT,
  executionGroups,
  suites,
  releaseGroups,
  releaseSuites,
  profiles,
  profileSuite,
} from './testManifest.mjs';
import {
  normalize,
  selectProfileFiles,
  validateManifest,
  validateResults,
} from './validateTestManifest.mjs';
const { assertEmulators } = createRequire(import.meta.url)('./testFirestoreNetworkGuard.cjs');

let activeChild;
let interrupted = false;
function interrupt() {
  interrupted = true;
  if (!activeChild?.pid || activeChild.exitCode !== null || activeChild.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(activeChild.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('error', () => {});
  } else activeChild.kill('SIGINT');
}
export async function runProcess(command, args, options = {}) {
  if (interrupted) throw new Error('Test gate interrupted');
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  activeChild = child;
  try {
    const code = await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('exit', (code, signal) => done(code ?? (signal ? 130 : 1)));
    });
    if (code !== 0 || interrupted)
      throw new Error(`Process exited ${code}: ${command} ${args[0] ?? ''}`);
  } finally {
    if (activeChild === child) activeChild = undefined;
  }
}
function npmCommand(script) {
  // npm is needed only for existing build/lint commands; test selections never pass through a shell.
  if (process.env.npm_execpath)
    return [process.execPath, [process.env.npm_execpath, 'run', script], {}];
  return [
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', script],
    { shell: process.platform === 'win32' },
  ];
}
export function vitestArgs(suite, reportPath) {
  const filters = [
    ...new Set(
      suite.files.map((pattern) =>
        pattern.endsWith('**/*.emulator.test.ts')
          ? '.emulator.test.ts'
          : pattern.includes('**/')
            ? pattern.slice(0, pattern.indexOf('**/'))
            : pattern
      )
    ),
  ];
  const args = ['scripts/runVitest.mjs', '--config', suite.config, ...filters];
  for (const pattern of suite.exclude ?? [])
    args.push(
      '--exclude',
      pattern.startsWith('functions/') ? pattern.slice('functions/'.length) : pattern
    );
  if (suite.emulators.length)
    args.push(
      `--require-emulators=${suite.emulators.join(',')}`,
      '--no-file-parallelism',
      '--maxWorkers=1',
      `--testTimeout=${suite.testTimeout ?? 30000}`,
      '--hookTimeout=60000'
    );
  if (suite.coverage) args.push('--coverage');
  return [
    ...args,
    '--reporter=default',
    '--reporter=' + normalize(resolve(ROOT, 'scripts/testManifestVitestReporter.mjs')),
    `--outputFile=${normalize(reportPath)}`,
  ];
}
export async function runGroup(
  groupId,
  {
    inside = false,
    reportDir,
    execute = runProcess,
    profile = 'pr',
    completedChecks = new Set(),
  } = {}
) {
  const permittedGroups =
    profile === 'quick'
      ? ['lint', 'app', 'functions-unit']
      : ['smoke', 'e2e'].includes(profile)
        ? ['e2e']
        : profile === 'hosting'
          ? ['hosting']
          : profile === 'pr'
            ? executionGroups.map((group) => group.id)
            : profile === 'full'
              ? [...executionGroups, ...releaseGroups].map((group) => group.id)
              : [];
  if (
    !permittedGroups.includes(groupId) &&
    [...executionGroups, ...releaseGroups].some((group) => group.id === groupId)
  )
    throw new Error(`Invalid group/profile combination: ${groupId}/${profile}`);
  if (!['quick', 'pr', 'full', 'smoke', 'e2e', 'hosting'].includes(profile))
    throw new Error(`Unknown test profile: ${profile}`);
  const stageEnteredAt = Date.now();
  const checkTimings = [];
  const inventory = validateManifest();
  const group = [...executionGroups, ...releaseGroups].find((item) => item.id === groupId);
  if (!group) throw new Error(`Unknown execution group: ${groupId}`);
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('CI parity requires Node.js 22 or newer');
  const environment = {
    ...process.env,
    ...(group.id === 'fixtures'
      ? { VITE_FIREBASE_PROJECT_ID: DEMO_PROJECT, VITE_USE_FIREBASE_EMULATORS: 'true' }
      : {}),
    GCLOUD_PROJECT: DEMO_PROJECT,
    GOOGLE_CLOUD_PROJECT: DEMO_PROJECT,
    GUEST_ACTION_TOKEN_SECRET: 'e2e-guest-action-token-secret',
    JAVA_TOOL_OPTIONS:
      process.env.JAVA_TOOL_OPTIONS ?? '-Xms512m -Xmx2g -XX:ActiveProcessorCount=2',
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=3072',
  };
  reportDir = resolve(
    reportDir ??
      process.env.CARVE_MANIFEST_RUN_DIR ??
      join(ROOT, '.scratch/test-manifest', `${Date.now()}-${process.pid}`)
  );
  mkdirSync(reportDir, { recursive: true });
  environment.CARVE_MANIFEST_RUN_DIR = reportDir;
  if (inside) {
    if (
      !group.emulators?.length ||
      group.managedLifecycle ||
      process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT !== DEMO_PROJECT
    )
      throw new Error('Invalid inner demo emulator stage');
    assertEmulators(process.env, group.emulators);
    if (process.env.FUNCTIONS_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR === 'true')
      throw new Error('Background Functions forbidden in data/reset suites');
  } else {
    for (const key of [
      'FIRESTORE_EMULATOR_HOST',
      'FIREBASE_AUTH_EMULATOR_HOST',
      'FIREBASE_STORAGE_EMULATOR_HOST',
      'FUNCTIONS_EMULATOR_HOST',
    ])
      if (process.env[key])
        throw new Error(`Run gate outside pre-existing emulator session (${key} is set)`);
    for (const check of profile === 'quick'
      ? group.id === 'lint'
        ? ['test:quick:types']
        : []
      : group.checks) {
      if (completedChecks.has(check)) continue;
      const checkStarted = Date.now();
      const [command, args, options] = npmCommand(check);
      let status = 'FAIL';
      try {
        await execute(command, args, {
          ...options,
          env:
            check === 'build:e2e'
              ? {
                  ...environment,
                  VITE_FIREBASE_PROJECT_ID: DEMO_PROJECT,
                  VITE_USE_FIREBASE_EMULATORS: 'true',
                }
              : environment,
        });
        completedChecks.add(check);
        status = 'PASS';
      } finally {
        checkTimings.push({ check, status, durationMs: Date.now() - checkStarted });
        writeFileSync(
          join(reportDir, `${group.id}.checks.json`),
          JSON.stringify(checkTimings, null, 2)
        );
      }
    }
    if (group.emulators?.length && !group.managedLifecycle) {
      const firebase = resolve(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js');
      if (!existsSync(firebase)) throw new Error('Required Firebase runner missing; run npm ci');
      const started = Date.now();
      rmSync(join(reportDir, `${group.id}.json`), { force: true });
      await execute(
        process.execPath,
        [
          firebase,
          'emulators:exec',
          '--project',
          DEMO_PROJECT,
          '--only',
          group.emulators.join(','),
          `node scripts/runManifestTests.mjs --group ${group.id} --profile ${profile} --inside`,
        ],
        { env: environment }
      );
      // The inner stage verifies assertions. Read its fresh result before reporting success.
      const result = JSON.parse(readFileSync(join(reportDir, `${group.id}.json`), 'utf8'));
      if (result.status !== 'PASS') throw new Error(`Missing successful inner stage: ${group.id}`);
      result.lifecycleMs = Date.now() - started;
      result.checkTimings = checkTimings;
      result.lifecycleOverheadMs = result.lifecycleMs - result.durationMs;
      result.startupMs = result.stageEnteredAt - started;
      result.shutdownMs = Date.now() - result.finishedAt;
      writeFileSync(join(reportDir, `${group.id}.json`), JSON.stringify(result, null, 2));
      return result;
    }
  }
  const started = Date.now();
  const results = [];
  const owners =
    group.id === 'hosting'
      ? [suites.find((item) => item.id === 'playwright')]
      : [...suites, ...releaseSuites].filter((item) => item.executionGroup === group.id);
  for (const owner of owners) {
    if (profile === 'quick' && !profiles.quick.includes(owner.id)) continue;
    const suite = profileSuite(owner, group.id === 'hosting' ? 'hosting' : profile);
    const expectedFiles = selectProfileFiles(suite, inventory.files);
    if (!expectedFiles.length) throw new Error(`Empty selected profile: ${suite.id}/${profile}`);
    const reportPath = join(reportDir, `${suite.id}.results.json`);
    rmSync(reportPath, { force: true }); // A previous successful report must never satisfy a new failed run.
    const suiteStart = Date.now();
    if (suite.runner === 'vitest')
      await execute(
        process.execPath,
        vitestArgs(
          suite.exactSelection
            ? { ...suite, files: expectedFiles.map((file) => resolve(ROOT, file)) }
            : suite,
          reportPath
        ),
        {
          env: {
            ...environment,
            CARVE_TEST_EXCLUDES: JSON.stringify(suite.exclude ?? []),
            CARVE_TEST_INCLUDES: suite.exactSelection ? JSON.stringify(expectedFiles) : '',
            CARVE_TEST_ENVIRONMENT: suite.pureFrontend ? 'node' : 'jsdom',
          },
        }
      );
    else if (suite.runner === 'node') {
      await execute(
        process.execPath,
        [
          '--test',
          '--test-reporter=spec',
          '--test-reporter=./scripts/testManifestNodeReporter.mjs',
          '--test-reporter-destination=stdout',
          `--test-reporter-destination=${reportPath}`,
          ...expectedFiles,
        ],
        { env: suite.guarded ? migrationEnvironment(environment, reportDir) : environment }
      );
    } else if (suite.runner === 'fixtures') {
      const combined = { suites: [], errors: [] };
      for (const [index, config] of suite.configs.entries()) {
        const part = join(reportDir, `fixture-${index}.json`);
        rmSync(part, { force: true });
        await execute(
          process.execPath,
          [
            'node_modules/@playwright/test/cli.js',
            'test',
            '--config',
            config,
            '--reporter=list,json',
            `--output=${join(reportDir, `fixture-${index}-artifacts`)}`,
          ],
          {
            env: { ...environment, PLAYWRIGHT_JSON_OUTPUT_NAME: part },
          }
        );
        const report = JSON.parse(readFileSync(part, 'utf8'));
        if (report.errors?.length) throw new Error(`Fixture runner failed: ${config}`);
        const absolutize = (section) => {
          for (const spec of section.specs ?? [])
            spec.file = resolve(report.config.rootDir, spec.file);
          for (const child of section.suites ?? []) absolutize(child);
        };
        for (const section of report.suites) absolutize(section);
        combined.suites.push(...report.suites);
      }
      writeFileSync(reportPath, JSON.stringify(combined));
    } else if (suite.runner === 'playwright') {
      await execute(
        process.execPath,
        [
          'scripts/runE2E.mjs',
          ...(suite.hosting ? ['--hosting'] : []),
          '--reporter=list,json',
          `--output=${join(reportDir, `${group.id}-artifacts`)}`,
          ...(suite.playwrightArgs ?? []),
        ],
        {
          env: {
            ...environment,
            CARVE_E2E_LIVE_FIXTURES: suite.liveFixtures ? 'true' : 'false',
            PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
          },
        }
      );
    }
    if (suite.guarded && readFileSync(join(reportDir, 'migration-egress.log'), 'utf8').trim())
      throw new Error('Migration Firestore egress attempted');
    if (!existsSync(reportPath)) throw new Error(`Required runner produced no report: ${suite.id}`);
    const counts = validateResults(
      suite.runner === 'fixtures' ? { ...suite, runner: 'playwright' } : suite,
      JSON.parse(readFileSync(reportPath, 'utf8')),
      expectedFiles
    );
    results.push({ suite: suite.id, ...counts, durationMs: Date.now() - suiteStart });
    console.log(`Manifest verified ${suite.id}: ${JSON.stringify(counts)}`);
  }
  const result = {
    group: group.id,
    profile,
    status: 'PASS',
    stageEnteredAt,
    finishedAt: Date.now(),
    checkTimings,
    durationMs: Date.now() - started,
    results,
  };
  writeFileSync(join(reportDir, `${group.id}.json`), JSON.stringify(result, null, 2));
  return result;
}
function migrationEnvironment(environment, reportDir) {
  assertEmulators(environment, ['firestore']);
  if (
    environment.GCLOUD_PROJECT !== DEMO_PROJECT ||
    environment.GOOGLE_CLOUD_PROJECT !== DEMO_PROJECT
  )
    throw new Error('Migration requires isolated demo project');
  const ledger = join(reportDir, 'migration-egress.log');
  writeFileSync(ledger, '');
  const guard = normalize(resolve(ROOT, 'scripts/testFirestoreNetworkGuard.cjs'));
  return {
    ...environment,
    CARVE_TEST_EGRESS_LOG: ledger,
    NODE_OPTIONS: `${environment.NODE_OPTIONS ?? ''} --require=${JSON.stringify(guard)}`,
  };
}
export async function withInterruptHandlers(action) {
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    return await action();
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const groupIndex = args.indexOf('--group');
    const profileIndex = args.indexOf('--profile');
    if (
      groupIndex < 0 ||
      !args[groupIndex + 1] ||
      args.some(
        (arg, i) =>
          !['--group', '--inside', '--profile'].includes(arg) &&
          i !== groupIndex + 1 &&
          i !== profileIndex + 1
      )
    )
      throw new Error('Usage: node scripts/runManifestTests.mjs --group <id> [--inside]');
    await withInterruptHandlers(() =>
      runGroup(args[groupIndex + 1], {
        inside: args.includes('--inside'),
        profile: profileIndex >= 0 ? args[profileIndex + 1] : 'pr',
      })
    );
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
