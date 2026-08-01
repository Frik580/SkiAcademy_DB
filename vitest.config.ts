import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Files exercised by integration / Firestore rules tests, not unit coverage. */
const COVERAGE_EXCLUDE = [
  'src/lib/firebase.ts',
  'src/lib/i18n/translations.ts',
  'src/lib/i18n/contentTranslation.ts',
  'src/lib/i18n/courseDates.ts',
  'src/lib/i18n/bookingLabels.ts',
  'src/lib/bookingTransactions.ts',
  'src/lib/courseTransactions.ts',
  'src/lib/walletCredit.ts',
  'src/lib/notifications.ts',
  'src/lib/availabilityMigration.ts',
  'src/lib/backfillActivityLog.ts',
  'src/lib/useTranslatedBookings.ts',
  'src/lib/storage.ts',
  'src/lib/designTheme.ts',
  'src/lib/workspaceRoutes.ts',
  'src/lib/accessControl.ts',
  'src/lib/achievements.ts',
  'src/lib/activityLog.ts',
  'src/lib/logger.ts',
];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/components/personal_cabinet/student/studentCabinetUtils.ts'],
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
