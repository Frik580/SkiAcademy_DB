import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT, DEMO_PROJECT, executionGroups, suites } from './testManifest.mjs';
import { normalize, validateManifest, validateResults } from './validateTestManifest.mjs';
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
export async function runGroup(groupId, { inside = false, reportDir, execute = runProcess } = {}) {
  const inventory = validateManifest();
  const group = executionGroups.find((item) => item.id === groupId);
  if (!group) throw new Error(`Unknown execution group: ${groupId}`);
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('CI parity requires Node.js 22 or newer');
  const environment = {
    ...process.env,
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
    for (const check of group.checks) {
      const [command, args, options] = npmCommand(check);
      await execute(command, args, { ...options, env: environment });
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
          `node scripts/runManifestTests.mjs --group ${group.id} --inside`,
        ],
        { env: environment }
      );
      // The inner stage verifies assertions. Read its fresh result before reporting success.
      const result = JSON.parse(readFileSync(join(reportDir, `${group.id}.json`), 'utf8'));
      if (result.status !== 'PASS') throw new Error(`Missing successful inner stage: ${group.id}`);
      result.lifecycleMs = Date.now() - started;
      writeFileSync(join(reportDir, `${group.id}.json`), JSON.stringify(result, null, 2));
      return result;
    }
  }
  const started = Date.now();
  const results = [];
  for (const suite of suites.filter((item) => item.executionGroup === group.id)) {
    const reportPath = join(reportDir, `${suite.id}.results.json`);
    rmSync(reportPath, { force: true }); // A previous successful report must never satisfy a new failed run.
    const suiteStart = Date.now();
    if (suite.runner === 'vitest')
      await execute(process.execPath, vitestArgs(suite, reportPath), {
        env: { ...environment, CARVE_TEST_EXCLUDES: JSON.stringify(suite.exclude ?? []) },
      });
    else if (suite.runner === 'node') {
      await execute(
        process.execPath,
        [
          '--test',
          '--test-reporter=spec',
          '--test-reporter=./scripts/testManifestNodeReporter.mjs',
          '--test-reporter-destination=stdout',
          `--test-reporter-destination=${reportPath}`,
          ...inventory.selected.get(suite.id),
        ],
        { env: environment }
      );
    } else if (suite.runner === 'playwright') {
      await execute(process.execPath, ['scripts/runE2E.mjs', '--reporter=list,json'], {
        env: { ...environment, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
      });
    }
    if (!existsSync(reportPath)) throw new Error(`Required runner produced no report: ${suite.id}`);
    const counts = validateResults(
      suite,
      JSON.parse(readFileSync(reportPath, 'utf8')),
      inventory.selected.get(suite.id)
    );
    results.push({ suite: suite.id, ...counts, durationMs: Date.now() - suiteStart });
    console.log(`Manifest verified ${suite.id}: ${JSON.stringify(counts)}`);
  }
  const result = { group: group.id, status: 'PASS', durationMs: Date.now() - started, results };
  writeFileSync(join(reportDir, `${group.id}.json`), JSON.stringify(result, null, 2));
  return result;
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
    if (
      groupIndex < 0 ||
      !args[groupIndex + 1] ||
      args.some((arg, i) => !['--group', '--inside'].includes(arg) && i !== groupIndex + 1)
    )
      throw new Error('Usage: node scripts/runManifestTests.mjs --group <id> [--inside]');
    await withInterruptHandlers(() =>
      runGroup(args[groupIndex + 1], { inside: args.includes('--inside') })
    );
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
