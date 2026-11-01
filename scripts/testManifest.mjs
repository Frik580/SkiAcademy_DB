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
    checks: ['build:functions', 'build:e2e'],
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

// Historical release-only inventory owners; FULL promotion is defined below.
export const deferredSuites = [
  {
    id: 'colocated',
    files: ['src/**/*.test.ts'],
    proposedGroup: 'app',
    reason: 'Release-only colocated tests; exact source selection preserves isolation.',
  },
  {
    id: 'cutover-node',
    files: ['scripts/individual-booking-cutover-inventory.test.mjs'],
    proposedGroup: 'functions-unit',
    reason: 'Release-only Node cutover contract tests.',
  },
  {
    id: 'migration-cli',
    files: ['functions/scripts/**/*.test.cjs'],
    proposedGroup: 'isolated-migration',
    reason:
      'Release-only CLI rehearsals require isolated demo Firestore and inherited cloud egress guard.',
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

// Profiles are views of canonical owners, never independent inventories.
export const smokeFiles = [
  'e2e/auth-smoke.spec.ts',
  'e2e/booking-flow.spec.ts',
  'e2e/booking-invariants.spec.ts',
  'e2e/course-enrollment-smoke.spec.ts',
  'e2e/admin-smoke.spec.ts',
  'e2e/instructor-smoke.spec.ts',
  'e2e/guest-lesson-booking.spec.ts',
  'e2e/prelaunch-security.spec.ts',
];
export const profiles = {
  quick: ['translations', 'app-unit', 'shared-domain', 'functions-unit', 'node-guards'],
  pr: suites.map((item) => item.id),
  full: suites.map((item) => item.id),
};
export function profileSuite(suite, profile = 'pr') {
  if (!['quick', 'pr', 'full', 'e2e', 'smoke', 'hosting'].includes(profile))
    throw new Error(`Unknown test profile: ${profile}`);
  if (suite.id !== 'playwright')
    return {
      ...suite,
      coverage: profile === 'quick' ? false : suite.coverage,
      pureFrontend: profile === 'quick' && suite.id === 'app-unit',
      exactSelection: suite.exactSelection || (profile === 'quick' && suite.id === 'app-unit'),
    };
  if (profile === 'hosting')
    return {
      ...suite,
      files: ['e2e/prelaunch-security.spec.ts'],
      allowedSkips: [],
      playwrightArgs: ['--grep', '@hosting'],
      hosting: true,
    };
  if (['pr', 'smoke'].includes(profile))
    return {
      ...suite,
      files: smokeFiles,
      preview: true,
      liveFixtures: false,
      allowedSkips: [],
      playwrightArgs: ['--grep-invert', '@hosting', ...smokeFiles],
    };
  return {
    ...suite,
    allowedSkips: [],
    preview: true,
    liveFixtures: true,
    // FULL executes Hosting bodies in its separate lifecycle exactly once.
    playwrightArgs: ['--grep-invert', '@hosting'],
  };
}
export const releaseGroups = [
  { id: 'release-unit', checks: ['build:functions'], emulators: [] },
  { id: 'migration', checks: [], emulators: ['firestore'] },
  { id: 'contracts', checks: ['test:contracts'], emulators: [] },
  {
    id: 'fixtures',
    checks: ['test:fixture:planner:build', 'test:fixture:admin-modals:build'],
    emulators: [],
  },
  {
    id: 'hosting',
    checks: ['build:functions', 'build'],
    managedLifecycle: true,
    emulators: [...DATA_EMULATORS, 'functions', 'hosting'],
  },
];
// Deferred classifications retain their canonical inventory owner. Full promotes
// each owner to one execution stage, with no second list of test paths.
export const releaseSuites = deferredSuites.flatMap((item) => {
  if (item.id === 'compile-contracts') return [];
  const base = {
    ...item,
    id: `release-${item.id}`,
    required: true,
    skipPolicy: 'none',
    functionsRequired: false,
  };
  if (item.id === 'colocated')
    return [
      {
        ...base,
        executionGroup: 'release-unit',
        exactSelection: true,
        runner: 'vitest',
        config: 'vitest.config.ts',
        emulators: [],
      },
    ];
  if (item.id === 'cutover-node')
    return [{ ...base, executionGroup: 'release-unit', runner: 'node', emulators: [] }];
  if (item.id === 'migration-cli')
    return [
      {
        ...base,
        id: 'migration-unit',
        files: ['functions/scripts/guestConfirmationQueueMigration.test.cjs'],
        executionGroup: 'release-unit',
        runner: 'node',
        emulators: [],
      },
      {
        ...base,
        files: ['functions/scripts/guestConfirmationQueueMigration.emulator.test.cjs'],
        executionGroup: 'migration',
        runner: 'node',
        emulators: ['firestore'],
        guarded: true,
      },
    ];
  return [
    {
      ...base,
      executionGroup: 'fixtures',
      runner: 'fixtures',
      emulators: [],
      configs: [
        'playwright.admin-modals.config.ts',
        'playwright.admin-issue-attendance.config.ts',
        'playwright.level-modals.config.ts',
        'playwright.participant-levels.config.ts',
        'playwright.journey-geometry.config.ts',
        'tests/browser/planner-overlap/playwright.config.ts',
      ],
    },
  ];
});

export function executionPlan(profile = 'pr') {
  if (profile === 'quick')
    return executionGroups.filter((group) =>
      suites.some((suite) => suite.executionGroup === group.id && profiles.quick.includes(suite.id))
    );
  if (profile === 'pr') return executionGroups;
  if (profile === 'full') return [...executionGroups, ...releaseGroups];
  if (profile === 'release') return releaseGroups;
  throw new Error(`Unknown profile: ${profile}`);
}
