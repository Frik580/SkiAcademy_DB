import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Every non-PR release runs all canonical suites. Changed paths only decide
// which expensive checks can safely be deferred to that release gate.
const allJobs = Object.freeze({
  functions_tests: true,
  functions_emulator: true,
  emulator_integration: true,
  firestore: true,
  e2e: true,
});

const noExtraJobs = Object.freeze({
  functions_tests: false,
  functions_emulator: false,
  emulator_integration: false,
  firestore: false,
  e2e: false,
});

export function planCiJobs(paths, { eventName = 'pull_request', fullValidation = false } = {}) {
  if (fullValidation || paths === null || !Array.isArray(paths)) return { ...allJobs };
  if (eventName === 'workflow_dispatch') return { ...noExtraJobs };
  if (!['pull_request', 'push'].includes(eventName)) return { ...allJobs };

  const changed = paths.map((path) => path.replaceAll('\\', '/'));
  // CI, manifests, and toolchain changes require complete validation.
  const infrastructure = changed.some(
    (path) =>
      path.startsWith('.github/workflows/') ||
      /^scripts\/(?:ciChangePlan|testManifest|runManifestTests|runLocalTestSuite|validateTestManifest)/.test(path) ||
      /^(?:package|functions\/package)(?:-lock)?\.json$/.test(path) ||
      path === 'firebase.json' ||
      path === '.firebaserc'
  );
  if (infrastructure) return { ...allJobs };

  const backend = changed.some((path) => path.startsWith('functions/') || path.startsWith('packages/shared-domain/'));
  const rules = changed.some((path) => path === 'firestore.rules' || path === 'tests/firestore.rules.test.ts');
  const storage = changed.some((path) => path === 'storage.rules' || path === 'tests/storage.rules.test.ts');
  const userJourney = changed.some(
    (path) =>
      path.startsWith('src/') ||
      path.startsWith('e2e/') ||
      path.startsWith('tests/browser/') ||
      /^playwright[^/]*\.config\.ts$/.test(path) ||
      path.startsWith('tests/unit/')
  );

  // The merged main branch receives quick repeat checks; the full suite remains
  // available through workflow_dispatch(full_validation=true) before release.
  return {
    functions_tests: backend,
    functions_emulator: eventName === 'pull_request' && backend,
    emulator_integration: eventName === 'pull_request' && (backend || rules || storage),
    firestore: rules,
    e2e: eventName === 'pull_request' && (backend || userJourney),
  };
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0+$/.test(value);
}

export function changedPaths(base, head) {
  if (!isSha(base) || !isSha(head)) throw new Error('Missing or invalid commit range');
  execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', base], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
  return execFileSync('git', ['diff', '--name-only', '-z', base, head, '--'], {
    encoding: 'utf8',
    timeout: 60000,
  }).split('\0').filter(Boolean);
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const fullValidation = process.env.CI_FORCE_FULL === 'true';
  let paths = [];
  if (!fullValidation && eventName !== 'workflow_dispatch') {
    try {
      paths = changedPaths(process.env.CI_BASE_SHA, process.env.CI_HEAD_SHA);
    } catch (error) {
      // Missing history, force-push or network errors must never silently skip checks.
      console.warn(`CI change detection unavailable; running all checks: ${error.message}`);
      paths = null;
    }
  }
  const plan = planCiJobs(paths, { eventName, fullValidation });
  console.log(`CI plan (${eventName}): ${JSON.stringify({ paths, plan })}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join('')
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
