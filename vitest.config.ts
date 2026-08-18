import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
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
  'src/domain/wallet/walletCredit.ts',
  'src/domain/notifications/notifications.ts',
  'src/lib/availabilityMigration.ts',
  'src/lib/backfillActivityLog.ts',
  'src/lib/useTranslatedBookings.ts',
  'src/infrastructure/firebase/storage.ts',
  'src/shared/designTheme.ts',
  'src/lib/workspaceRoutes.ts',
  'src/lib/accessControl.ts',
  'src/domain/achievements/achievements.ts',
  'src/lib/activityLog.ts',
  'src/shared/logger.ts',
  'src/lib/clearStudentBookings.ts',
  'src/lib/completeBooking.ts',
  'src/lib/createBookingCallable.ts',
  'src/lib/createGuestCourseEnrollmentCallable.ts',
  'src/lib/enrollInCourseCallable.ts',
  'src/lib/lessonRecommendations.ts',
  'src/lib/todayChecklist.ts',
  'src/lib/useBookingChatUnread.ts',
];

export default defineConfig({
  resolve: {
    alias: {
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
    environment: 'jsdom',
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
