import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Fresh CI checkouts have no generated provenance module until the build.
// Keep the real SDK/declarations; only omit unrelated build identity bootstrap.
vi.mock('./deploymentProvenanceBootstrap', () => ({}));
import * as functions from './index';

const require = createRequire(import.meta.url);
const sdkLib = resolve(dirname(require.resolve('firebase-functions/v2/https')), '../..');
const { extractStack } = require(resolve(sdkLib, 'runtime/loader.js'));
const { stackToWire } = require(resolve(sdkLib, 'runtime/manifest.js'));

// Reviewed deployment contract, independent of the options objects under test.
// Three additional max=20 declarations are approved in both staging and production.
const maxOne = [
  'scheduledDeliverDomainOutbox',
  'scheduledExpireGuestCourseReservations',
  'scheduledExpireGuestLessonReservations',
  'scheduledReconcileGuestConfirmationMismatches',
  'scheduledResolveCourseEnrollmentOutcomes',
  'scheduledResolveLessonBookingAttendanceOutcomes',
];
const eventDocuments: Record<string, string> = {
  deliverDomainOutboxOnCreate: 'domain_outbox/{outboxId}',
  syncCourseEnrollmentOutcomeWork: 'course_enrollments/{enrollmentId}',
  syncGuestBookingConfirmationWork: 'bookings/{bookingId}',
  syncGuestEnrollmentConfirmationWork: 'course_enrollments/{enrollmentId}',
  syncGuestPaymentConfirmationWork: 'payments/{paymentId}',
  syncInstructorLessonRevenueBooking: 'bookings/{bookingId}',
  syncInstructorLessonRevenuePayment: 'payments/{paymentId}',
  syncLessonBookingAttendanceOutcomeWork: 'bookings/{bookingId}',
};
const maxTwenty = [
  'executeCanonicalCommand',
  'executeGuestCanonicalCommand',
  'executeTestSessionLifecycle',
  'queryAccountWalletHistory',
  'queryAdminCourseEnrollmentReadModels',
  'queryAdminCourseReadModels',
  'queryAdminFinanceReadModels',
  'queryAdminIdentityReadModels',
  'queryAdminIssueReadModels',
  'queryAdminPlannerReadModels',
  'queryBookingChangeRequestReadModels',
  'queryBookingInstructorCatalogueReadModels',
  'queryBookingProposalReadModels',
  'queryCourseAttendanceReadModels',
  'queryCourseCatalogReadModels',
  'queryCourseEnrollmentReadModels',
  'queryEmailDeliverySettingsReadModel',
  'queryInstructorCourseAssignmentReadModels',
  'queryInstructorOccupancyReadModels',
  'queryInstructorReviewReadModels',
  'queryLessonBookingReadModels',
  'queryLessonPricingSettingsReadModel',
  'queryManagedParticipantPickerReadModels',
  'queryOutboxDeadLetterReadModel',
  'queryParticipantAchievementsReadModels',
  'queryParticipantInstructorAccessReadModels',
  'queryParticipantLessonFeedbackReadModels',
  'queryParticipantOccupancyReadModels',
  'queryParticipantProgressReadModels',
  'queryTestSessionReadModels',
  'resolveInstructorLessonRevenue',
  'scheduledPurgeExpiredNotifications',
];
const expectedCaps = Object.fromEntries([
  ...maxOne.map((name) => [name, 1]),
  ...[...Object.keys(eventDocuments), 'optimizeImage'].map((name) => [name, 10]),
  ...maxTwenty.map((name) => [name, 20]),
]);
const secretCallables = new Set([
  'executeCanonicalCommand',
  'executeGuestCanonicalCommand',
  'queryCourseEnrollmentReadModels',
  'queryLessonBookingReadModels',
]);

function deploymentSpec(): Record<string, Record<string, unknown>> {
  const endpoints = {};
  extractStack(functions, endpoints, [], {});
  // Use the SDK serializer: an absent/reset limit becomes null here. Looking
  // only at source text or truthiness of ResetValue would miss the regression.
  return stackToWire({ endpoints }).endpoints;
}

describe('reviewed Functions deployment configuration', () => {
  it('requires the exact scaling map and export inventory in the generated specification', () => {
    const spec = deploymentSpec();
    expect(Object.keys(spec)).toHaveLength(47);
    expect(
      Object.fromEntries(Object.entries(spec).map(([name, e]) => [name, e.maxInstances]))
    ).toEqual(expectedCaps);
  });

  it.each(Object.keys(expectedCaps))(
    'preserves all other declared runtime options for %s',
    (name) => {
      const endpoint = deploymentSpec()[name];
      const runtime = { ...endpoint };
      delete runtime.labels;
      const eventDocument = eventDocuments[name];
      const lowCpuScheduler = maxOne.includes(name);
      const purge = name === 'scheduledPurgeExpiredNotifications';
      const scheduled = lowCpuScheduler || purge;
      expect(runtime).toEqual({
        platform: 'gcfv2',
        entryPoint: name,
        availableMemoryMb:
          name === 'optimizeImage' ? 512 : lowCpuScheduler || eventDocument ? 256 : null,
        timeoutSeconds: name === 'optimizeImage' ? 60 : null,
        minInstances: null,
        maxInstances: expectedCaps[name],
        ingressSettings: null,
        concurrency: null,
        serviceAccountEmail: null,
        vpc: null,
        ...(scheduled ? {} : { region: ['us-central1'] }),
        ...(lowCpuScheduler ? { cpu: 'gcf_gen1' } : eventDocument ? { cpu: 1 } : {}),
        ...(secretCallables.has(name)
          ? { secretEnvironmentVariables: [{ key: 'GUEST_ACTION_TOKEN_SECRET' }] }
          : {}),
        ...(scheduled
          ? {
              scheduleTrigger: {
                schedule: purge
                  ? 'every 24 hours'
                  : name === 'scheduledDeliverDomainOutbox'
                    ? 'every 30 minutes'
                    : 'every 5 minutes',
                retryConfig: {},
                timeZone: purge ? 'Asia/Almaty' : 'UTC',
              },
            }
          : eventDocument
            ? {
                eventTrigger: {
                  eventType: `google.cloud.firestore.document.v1.${name === 'deliverDomainOutboxOnCreate' ? 'created' : 'written'}`,
                  eventFilters: { database: '(default)', namespace: '(default)' },
                  eventFilterPathPatterns: { document: eventDocument },
                  retry: true,
                },
              }
            : name === 'optimizeImage'
              ? { httpsTrigger: {} }
              : { callableTrigger: {} }),
      });
    }
  );

  it('does not use global scaling or preserveExternalChanges to hide reset declarations', () => {
    const bootstrap = readFileSync(resolve(__dirname, 'deploymentProvenanceBootstrap.ts'), 'utf8');
    const entrypoint = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    expect(bootstrap).not.toMatch(/\b(?:maxInstances|preserveExternalChanges)\s*:/);
    expect(entrypoint).not.toMatch(/\bpreserveExternalChanges\s*:/);
  });
});
