import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DEMO_PROJECT = 'demo-ski-school-e2e';
export const DATA_EMULATORS = ['auth', 'firestore', 'storage'];
const resetFiles = [
  'functions/src/maintenance/dataResetAuthorization.emulator.test.ts',
  'functions/src/maintenance/dataReset.emulator.test.ts',
  'functions/src/maintenance/dataResetLiveFixtures.emulator.test.ts',
  'functions/src/canonical/guestConfirmation/guestConfirmationWork.emulator.test.ts',
];
export const criticalAssertions = {
  backend: [
    [
      'bookingAttendanceMigrationGuard.emulator.test.ts',
      18,
      'runs the actual CLI twice and requires explicit cutover',
    ],
    ['bookingAttendanceCommands.emulator.test.ts', 30],
    ['chatMedia.emulator.test.ts', 32],
  ],
  reset: [
    ['dataReset.emulator.test.ts', 20],
    ['dataResetLiveFixtures.emulator.test.ts', 4],
    [
      'dataResetAuthorization.emulator.test.ts',
      8,
      'serializes parallel apply and requires new authorization for safe partial resume/bootstrap',
    ],
    ['guestConfirmationWork.emulator.test.ts', 24],
  ],
};
export const hostingSkips = [
  'Hosting serves security headers without applying frame denial to Firebase Auth reserved URLs',
  'public image rewrite preserves cached GET/HEAD and limits uncached transforms',
];

// Order is the sequential local gate. CI executes the same groups in separate jobs.
// ciGate names are existing status checks; changing discovery requires reviewing the inventory lock.
export const executionGroups = [
  { id: 'lint', ciGate: 'lint', checks: ['lint'] },
  { id: 'app', ciGate: 'app-tests', checks: [] },
  { id: 'functions-unit', ciGate: 'functions-tests', checks: ['build:functions'] },
  { id: 'backend', ciGate: 'functions-emulator', checks: [], emulators: DATA_EMULATORS },
  { id: 'reset', ciGate: 'functions-emulator', checks: [], emulators: DATA_EMULATORS },
  { id: 'integration', ciGate: 'emulator-integration', checks: [], emulators: DATA_EMULATORS },
  { id: 'firestore', ciGate: 'firestore', checks: [], emulators: ['firestore'] },
  { id: 'build', ciGate: 'build', checks: ['build'] },
  {
    id: 'e2e',
    ciGate: 'e2e',
    checks: ['build:functions'],
    emulators: [...DATA_EMULATORS, 'functions'],
    managedLifecycle: true,
  },
];
const suite = (id, executionGroup, runner, files, options = {}) => ({
  id,
  executionGroup,
  runner,
  files,
  required: true,
  emulators: executionGroups.find((group) => group.id === executionGroup).emulators ?? [],
  functionsRequired: executionGroup === 'e2e',
  isolation:
    executionGroup === 'e2e' ? 'real-functions-separate-lifecycle' : 'no-functions-triggers',
  skipPolicy: 'none',
  ...options,
});
export const suites = [
  suite('translations', 'lint', 'vitest', ['tests/unit/translationsParity.test.ts'], {
    config: 'vitest.config.ts',
  }),
  suite('app-unit', 'app', 'vitest', ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'], {
    config: 'vitest.config.ts',
    coverage: true,
    exclude: ['tests/unit/translationsParity.test.ts'],
  }),
  suite('shared-domain', 'app', 'vitest', ['packages/shared-domain/src/**/*.test.ts'], {
    config: 'packages/shared-domain/vitest.config.ts',
  }),
  suite('functions-unit', 'functions-unit', 'vitest', ['functions/src/**/*.test.ts'], {
    exclude: ['functions/src/**/*.emulator.test.ts'],
    config: 'functions/vitest.config.ts',
  }),
  suite('node-guards', 'functions-unit', 'node', [
    'scripts/compareFunctionConfig.test.mjs',
    'scripts/compareStagingResetRelease.test.mjs',
    'scripts/syncSharedDomain.test.mjs',
    'scripts/testFirestoreNetworkGuard.test.mjs',
    'scripts/runLocalTestSuite.test.mjs',
    'scripts/testManifest.test.mjs',
  ]),
  suite('canonical-backend', 'backend', 'vitest', ['functions/src/**/*.emulator.test.ts'], {
    exclude: resetFiles,
    config: 'functions/vitest.config.ts',
    testTimeout: 30000,
  }),
  suite('reset-rehearsal', 'reset', 'vitest', resetFiles, {
    config: 'functions/vitest.config.ts',
    testTimeout: 90000,
  }),
  suite(
    'firebase-integration',
    'integration',
    'vitest',
    ['tests/integration/**/*.test.ts', 'tests/storage.rules.test.ts'],
    { config: 'vitest.config.ts', testTimeout: 30000 }
  ),
  suite('firestore-rules', 'firestore', 'vitest', ['tests/firestore.rules.test.ts'], {
    config: 'vitest.config.ts',
  }),
  suite('playwright', 'e2e', 'playwright', ['e2e/**/*.spec.ts'], {
    skipPolicy: 'hosting-only',
    allowedSkips: hostingSkips.map((title) => ({ file: 'e2e/prelaunch-security.spec.ts', title })),
  }),
];

// Existing coverage gaps are inventory entries, not newly enabled gates.
export const deferredSuites = [
  {
    id: 'colocated',
    files: ['src/**/*.test.ts'],
    proposedGroup: 'app',
    reason:
      'Existing colocated tests outside the tests/unit selection; separate coverage change required.',
  },
  {
    id: 'cutover-node',
    files: ['scripts/individual-booking-cutover-inventory.test.mjs'],
    proposedGroup: 'functions-unit',
    reason: 'Existing Node cutover test outside the required gate.',
  },
  {
    id: 'migration-cli',
    files: ['functions/scripts/**/*.test.cjs'],
    proposedGroup: 'isolated-migration',
    reason:
      'Do not auto-enable destructive CLI rehearsals; review demo-only guards and isolation first.',
  },
  {
    id: 'compile-contracts',
    files: ['packages/shared-domain/type-tests/**/*.ts'],
    proposedGroup: 'typecheck',
    reason: 'Compile-only contracts; not runtime assertions.',
  },
  {
    id: 'browser-fixtures',
    files: ['tests/browser/**/*.spec.ts'],
    proposedGroup: 'browser-fixtures',
    reason:
      'Separate browser fixture configurations; preserve inventory without expanding the required E2E gate.',
  },
];
