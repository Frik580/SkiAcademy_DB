import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { availableParallelism } from 'node:os';
import react from '@vitejs/plugin-react';

/** Files exercised by integration / Firestore rules tests, not unit coverage. */
const COVERAGE_EXCLUDE = [
  'src/infrastructure/firebase/**',
  'src/lib/i18n/translations.ts',
  'src/lib/i18n/contentTranslation.ts',
  'src/lib/i18n/courseDates.ts',
  'src/lib/i18n/bookingLabels.ts',
  'src/features/bookings/bookingTransactions.ts',
  'src/lib/courseTransactions.ts',
  'src/lib/availabilityMigration.ts',
  'src/lib/useTranslatedBookings.ts',
  'src/infrastructure/firebase/storage.ts',
  'src/lib/workspaceRoutes.ts',
  'src/lib/accessControl.ts',
  'src/domain/achievements/achievements.ts',
  'src/lib/activityLog.ts',
  'src/shared/logger.ts',
  'src/lib/clearStudentBookings.ts',
  'src/lib/completeBooking.ts',
  'src/lib/createBookingCallable.ts',
  'src/lib/enrollInCourseCallable.ts',
  'src/lib/todayChecklist.ts',
  'src/lib/useBookingChatUnread.ts',
];

// Child projects override root/CLI excludes; the manifest supplies the same
// exclusions here so discovery and runtime execution stay identical.
const manifestExcludes: string[] = JSON.parse(process.env.CARVE_TEST_EXCLUDES ?? '[]');

const NODE_TESTS = [
  'tests/callable/**',
  'tests/integration/**',
  'tests/firestore.rules.test.ts',
  'tests/storage.rules.test.ts',
];

const NODE_TEST_INCLUDES = [
  'tests/{callable,integration}/**/*.{test,spec}.?(c|m)[jt]s?(x)',
  'tests/firestore.rules.test.ts',
  'tests/storage.rules.test.ts',
];

export default defineConfig({
  resolve: {
    alias: {
      '@ski-academy/shared-domain/canonical': fileURLToPath(
        new URL('./packages/shared-domain/src/canonical/', import.meta.url)
      ),
      '@ski-academy/shared-domain/booking': fileURLToPath(
        new URL('./packages/shared-domain/src/booking.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/resortSlideImages': fileURLToPath(
        new URL('./packages/shared-domain/src/resortSlideImages.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/testing': fileURLToPath(
        new URL('./packages/shared-domain/src/testing/index.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain/entities': fileURLToPath(
        new URL('./packages/shared-domain/src/entities.ts', import.meta.url)
      ),
      '@ski-academy/shared-domain': fileURLToPath(
        new URL('./packages/shared-domain/src/index.ts', import.meta.url)
      ),
    },
  },
  plugins: [react()],
  test: {
    env: {
      VITE_FIREBASE_PROJECT_ID: 'demo-ski-school-e2e',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-ski-school-e2e.appspot.com',
    },
    // Bound CPU-heavy jsdom/V8 work on large hosts while retaining Vitest's
    // usual one-CPU reserve on smaller runners.
    maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
    exclude: [...configDefaults.exclude, '.scratch/**', '**/.worktrees/**'],
    environment: 'jsdom',
    projects: [
      { extends: true, test: { name: 'app', exclude: [...NODE_TESTS, ...manifestExcludes] } },
      {
        extends: true,
        test: { name: 'firebase', environment: 'node', include: NODE_TEST_INCLUDES },
      },
    ],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/lib/**/*.ts',
        'src/components/personal_cabinet/student/studentCabinetUtils.ts',
      ],
      exclude: COVERAGE_EXCLUDE,
      thresholds: {
        lines: 45,
        functions: 40,
        branches: 40,
        statements: 45,
      },
    },
  },
});
