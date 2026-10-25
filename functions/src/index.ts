import './deploymentProvenanceBootstrap';
import { defineSecret } from 'firebase-functions/params';
import {
  onCall as firebaseOnCall,
  type CallableOptions,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { admitRequest, requestPrincipalKey } from './security/requestAdmission';
import { createClaimGuestProfileHandler } from './security/claimGuestProfile';
import { createReportClientErrorsHandler } from './security/reportClientErrors';
import { createQueryAccountWalletHistoryHandler } from './canonical/readModels/queryAccountWalletHistoryCallable';
import { createResolveInstructorLessonRevenueHandler } from './canonical/readModels/resolveInstructorLessonRevenueCallable';
import {
  syncInstructorLessonRevenue,
  syncInstructorLessonRevenuePayment as syncInstructorLessonRevenuePaymentWrite,
} from './canonical/readModels/instructorLessonRevenueProjection';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { OUTBOX_RECOVERY_INTERVAL_MINUTES } from '@ski-academy/shared-domain';
import { getAdminFirestore } from './adminFirestore';
import { purgeExpiredNotifications } from './purgeExpiredNotifications';
import { createExecuteCanonicalCommandHandler } from './canonical/commands/executeCanonicalCommandCallable';
import { createExecuteGuestCanonicalCommandHandler } from './canonical/commands/executeGuestCanonicalCommandCallable';
import { GUEST_RESERVATION_ACTIVE_LIMITS } from './canonical/commands/guestReservationAdmission';
import { createQueryLessonBookingReadModelsHandler } from './canonical/readModels/queryLessonBookingReadModelsCallable';
import { createQueryManagedParticipantPickerReadModelsHandler } from './canonical/readModels/queryManagedParticipantPickerReadModelsCallable';
import { createQueryBookingProposalReadModelsHandler } from './canonical/readModels/queryBookingProposalReadModelsCallable';
import { createQueryBookingChangeRequestReadModelsHandler } from './canonical/readModels/queryBookingChangeRequestReadModelsCallable';
import { createQueryParticipantInstructorAccessReadModelsHandler } from './canonical/readModels/queryParticipantInstructorAccessReadModelsCallable';
import { createQueryCourseEnrollmentReadModelsHandler } from './canonical/readModels/queryCourseEnrollmentReadModelsCallable';
import { createQueryCourseCatalogReadModelsHandler } from './canonical/readModels/queryCourseCatalogReadModelsCallable';
import { createQueryCourseAttendanceReadModelsHandler } from './canonical/readModels/queryCourseAttendanceReadModelsCallable';
import { createQueryInstructorCourseAssignmentReadModelsHandler } from './canonical/readModels/queryInstructorCourseAssignmentReadModelsCallable';
import { createQueryAdminIssueReadModelsHandler } from './canonical/readModels/queryAdminIssueReadModelsCallable';
import { createQueryAdminFinanceReadModelsHandler } from './canonical/readModels/queryAdminFinanceReadModelsCallable';
import { createQueryAdminCourseReadModelsHandler } from './canonical/readModels/queryAdminCourseReadModelsCallable';
import { createQueryAdminCourseEnrollmentReadModelsHandler } from './canonical/readModels/queryAdminCourseEnrollmentReadModelsCallable';
import { createQueryAdminIdentityReadModelsHandler } from './canonical/readModels/queryAdminIdentityReadModelsCallable';
import { createQueryAdminPlannerReadModelsHandler } from './canonical/readModels/queryAdminPlannerReadModelsCallable';
import { createQueryInstructorOccupancyReadModelsHandler } from './canonical/readModels/queryInstructorOccupancyReadModelsCallable';
import { createQueryParticipantOccupancyReadModelsHandler } from './canonical/readModels/queryParticipantOccupancyReadModelsCallable';
import { createQueryBookingInstructorCatalogueReadModelsHandler } from './canonical/readModels/queryBookingInstructorCatalogueReadModelsCallable';
import { createQueryLessonPricingSettingsReadModelHandler } from './canonical/readModels/queryLessonPricingSettingsReadModelCallable';
import { createQueryEmailDeliverySettingsReadModelHandler } from './canonical/readModels/queryEmailDeliverySettingsReadModelCallable';
import { createQueryOutboxDeadLetterReadModelHandler } from './canonical/readModels/queryOutboxDeadLetterReadModelCallable';
import { createQueryInstructorReviewReadModelsHandler } from './canonical/readModels/queryInstructorReviewReadModelsCallable';
import { createQueryParticipantProgressReadModelsHandler } from './canonical/readModels/queryParticipantProgressReadModelsCallable';
import { createQueryParticipantAchievementsReadModelsHandler } from './canonical/readModels/queryParticipantAchievementsReadModelsCallable';
import { createQueryParticipantLessonFeedbackReadModelsHandler } from './canonical/readModels/queryParticipantLessonFeedbackReadModelsCallable';
import { createQueryTestSessionReadModelsHandler } from './canonical/readModels/queryTestSessionReadModelsCallable';
import { createExecuteTestSessionLifecycleHandler } from './canonical/testSessions/executeTestSessionLifecycleCallable';
import { runScheduledGuestConfirmationReconciliation } from './canonical/guestConfirmation/guestConfirmationScheduler';
import { syncGuestConfirmationWrite } from './canonical/guestConfirmation/guestConfirmationWork';
import { sweepExpiredGuestLessonReservations } from './canonical/bookings/guestLessonReservationExpirySweep';
import { sweepExpiredGuestCourseReservations } from './canonical/courses/guestCourseReservationExpirySweep';
import { sweepLessonBookingAttendanceOutcomes } from './canonical/bookings/bookingAttendanceOutcomeSweep';
import { syncLessonBookingAttendanceOutcomeWorkForBookingWrite } from './canonical/bookings/bookingAttendanceOutcomeWorkSync';
import {
  deliverCreatedDomainOutbox,
  deliverDueDomainOutbox,
} from './canonical/auditOutbox/firestoreOutboxDeliveryStore';
import { purgeTerminalDomainOutbox } from './canonical/auditOutbox/outboxRetention';
import { sweepCourseEnrollmentOutcomes } from './canonical/courses/courseEnrollmentOutcomeSweep';
import { syncCourseEnrollmentOutcomeWorkForEnrollmentWrite } from './canonical/courses/courseEnrollmentOutcomeWorkSync';

export { optimizeImage } from './images/optimizeImageHttp';

const guestActionTokenSecret = defineSecret('GUEST_ACTION_TOKEN_SECRET');

/** Browser callables need public Cloud Run invoker; auth is enforced inside the handler. */
const PLATFORM_DEFAULT_CALLABLE_OPTIONS = { region: 'us-central1', invoker: 'public' as const };
const CANONICAL_CALLABLE_OPTIONS = {
  ...PLATFORM_DEFAULT_CALLABLE_OPTIONS,
  // Preserve the production cap explicitly; an unspecified SDK option is reset
  // to the platform default by Firebase CLI, rather than kept at 20.
  maxInstances: 20,
  enforceAppCheck: false, // Observe staging metrics before a separately approved enforcement rollout.
  secrets: [guestActionTokenSecret],
};

/** Admission runs before parsing/expensive reads, including failed requests.
 * UID quota avoids imposing a shared-IP quota on signed-in families. Public
 * traffic has a generous network allowance; reservation admission stays 3/2.
 * Scope counters by endpoint so independent reads do not contend on one doc. */
function onCall<T = CallableRequest['data'], R = unknown>(
  endpoint: string,
  options: CallableOptions & { guestAttempts?: boolean },
  handler: (request: CallableRequest<T>) => Promise<R>
) {
  const { guestAttempts, ...firebaseOptions } = options;
  return firebaseOnCall(firebaseOptions, async (request: CallableRequest<T>) => {
    const secret = guestActionTokenSecret.value();
    const principal = requestPrincipalKey(request, secret);
    await admitRequest(
      getAdminFirestore(),
      `callable_${endpoint}_${principal}`,
      request.auth ? 120 : 300
    );
    if (guestAttempts) {
      // Guest actors cannot escape their network limit by rotating Auth accounts.
      const network = requestPrincipalKey({ ...request, auth: undefined }, secret);
      await admitRequest(getAdminFirestore(), `guest_attempt_${network}`, 30);
    }
    return handler(request);
  });
}

const GUEST_SECRET_CALLABLE_OPTIONS = {
  ...CANONICAL_CALLABLE_OPTIONS,
  secrets: [guestActionTokenSecret],
};

export const claimGuestProfile = onCall(
  'claimGuestProfile',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createClaimGuestProfileHandler(getAdminFirestore())(request)
);

export const reportClientErrors = onCall(
  'reportClientErrors',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createReportClientErrorsHandler(getAdminFirestore(), guestActionTokenSecret.value())(request)
);

export const executeCanonicalCommand = onCall(
  'executeCanonicalCommand',
  GUEST_SECRET_CALLABLE_OPTIONS,
  async (request) => createExecuteCanonicalCommandHandler(getAdminFirestore())(request)
);

export const executeGuestCanonicalCommand = onCall(
  'executeGuestCanonicalCommand',
  { ...GUEST_SECRET_CALLABLE_OPTIONS, guestAttempts: true },
  async (request) =>
    createExecuteGuestCanonicalCommandHandler(
      getAdminFirestore(),
      GUEST_RESERVATION_ACTIVE_LIMITS
    )(request)
);

export const queryLessonBookingReadModels = onCall(
  'queryLessonBookingReadModels',
  GUEST_SECRET_CALLABLE_OPTIONS,
  async (request) => createQueryLessonBookingReadModelsHandler(getAdminFirestore())(request)
);

export const queryManagedParticipantPickerReadModels = onCall(
  'queryManagedParticipantPickerReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryManagedParticipantPickerReadModelsHandler(getAdminFirestore())(request)
);

export const queryBookingProposalReadModels = onCall(
  'queryBookingProposalReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryBookingProposalReadModelsHandler(getAdminFirestore())(request)
);

export const queryBookingChangeRequestReadModels = onCall(
  'queryBookingChangeRequestReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryBookingChangeRequestReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantInstructorAccessReadModels = onCall(
  'queryParticipantInstructorAccessReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantInstructorAccessReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseEnrollmentReadModels = onCall(
  'queryCourseEnrollmentReadModels',
  GUEST_SECRET_CALLABLE_OPTIONS,
  async (request) => createQueryCourseEnrollmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseCatalogReadModels = onCall(
  'queryCourseCatalogReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryCourseCatalogReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseAttendanceReadModels = onCall(
  'queryCourseAttendanceReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryCourseAttendanceReadModelsHandler(getAdminFirestore())(request)
);

export const queryInstructorCourseAssignmentReadModels = onCall(
  'queryInstructorCourseAssignmentReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryInstructorCourseAssignmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminIssueReadModels = onCall(
  'queryAdminIssueReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminIssueReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminFinanceReadModels = onCall(
  'queryAdminFinanceReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminFinanceReadModelsHandler(getAdminFirestore())(request)
);

export const queryAccountWalletHistory = onCall(
  'queryAccountWalletHistory',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAccountWalletHistoryHandler(getAdminFirestore())(request)
);

export const resolveInstructorLessonRevenue = onCall(
  'resolveInstructorLessonRevenue',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createResolveInstructorLessonRevenueHandler(getAdminFirestore())(request)
);

export const queryAdminCourseReadModels = onCall(
  'queryAdminCourseReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminCourseReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminCourseEnrollmentReadModels = onCall(
  'queryAdminCourseEnrollmentReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminCourseEnrollmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminIdentityReadModels = onCall(
  'queryAdminIdentityReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminIdentityReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminPlannerReadModels = onCall(
  'queryAdminPlannerReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminPlannerReadModelsHandler(getAdminFirestore())(request)
);

export const queryInstructorOccupancyReadModels = onCall(
  'queryInstructorOccupancyReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryInstructorOccupancyReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantOccupancyReadModels = onCall(
  'queryParticipantOccupancyReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryParticipantOccupancyReadModelsHandler(getAdminFirestore())(request)
);

export const queryBookingInstructorCatalogueReadModels = onCall(
  'queryBookingInstructorCatalogueReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryBookingInstructorCatalogueReadModelsHandler(getAdminFirestore())(request)
);

export const queryLessonPricingSettingsReadModel = onCall(
  'queryLessonPricingSettingsReadModel',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryLessonPricingSettingsReadModelHandler(getAdminFirestore())(request)
);

export const queryEmailDeliverySettingsReadModel = onCall(
  'queryEmailDeliverySettingsReadModel',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryEmailDeliverySettingsReadModelHandler(getAdminFirestore())(request)
);

export const queryOutboxDeadLetterReadModel = onCall(
  'queryOutboxDeadLetterReadModel',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryOutboxDeadLetterReadModelHandler(getAdminFirestore())(request)
);

export const queryInstructorReviewReadModels = onCall(
  'queryInstructorReviewReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryInstructorReviewReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantProgressReadModels = onCall(
  'queryParticipantProgressReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryParticipantProgressReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantAchievementsReadModels = onCall(
  'queryParticipantAchievementsReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantAchievementsReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantLessonFeedbackReadModels = onCall(
  'queryParticipantLessonFeedbackReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantLessonFeedbackReadModelsHandler(getAdminFirestore())(request)
);

export const queryTestSessionReadModels = onCall(
  'queryTestSessionReadModels',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryTestSessionReadModelsHandler(getAdminFirestore())(request)
);

export const executeTestSessionLifecycle = onCall(
  'executeTestSessionLifecycle',
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createExecuteTestSessionLifecycleHandler(getAdminFirestore())(request)
);

export const deliverDomainOutboxOnCreate = onDocumentCreated(
  {
    document: 'domain_outbox/{outboxId}',
    region: 'us-central1',
    cpu: 1,
    memory: '256MiB',
    maxInstances: 10,
    retry: true,
  },
  async (event) => {
    const outboxId = event.params.outboxId;
    if (!outboxId) return;
    await deliverCreatedDomainOutbox(getAdminFirestore(), outboxId);
  }
);

export const scheduledDeliverDomainOutbox = onSchedule(
  {
    schedule: `every ${OUTBOX_RECOVERY_INTERVAL_MINUTES} minutes`,
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await deliverDueDomainOutbox(getAdminFirestore());
    console.log(
      JSON.stringify({
        job: 'scheduledDeliverDomainOutbox',
        role: 'recovery',
        scanned: result.scanned,
        claimed: result.claimed,
        sent: result.sent,
        retryScheduled: result.retryScheduled,
        deadLetter: result.deadLetter,
        notConfigured: result.notConfigured,
        skipped: result.skipped,
        failed: result.failed,
      })
    );
  }
);

export const scheduledPurgeExpiredNotifications = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Asia/Almaty',
    maxInstances: 20,
  },
  async () => {
    const firestore = getAdminFirestore();
    const deletedCount = await purgeExpiredNotifications(firestore);
    const outbox = await purgeTerminalDomainOutbox(firestore);
    console.log(
      JSON.stringify({
        job: 'scheduledPurgeExpiredNotifications',
        notificationsDeleted: deletedCount,
        deliveredOutboxDeleted: outbox.deliveredDeleted,
        deadLetterOutboxDeleted: outbox.deadLetterDeleted,
      })
    );
  }
);

export const scheduledReconcileGuestConfirmationMismatches = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await runScheduledGuestConfirmationReconciliation(getAdminFirestore());
    console.log(
      JSON.stringify({
        job: 'scheduledReconcileGuestConfirmationMismatches',
        ...result,
      })
    );
  }
);

const GUEST_RECONCILIATION_TRIGGER_OPTIONS = {
  region: 'us-central1',
  cpu: 1,
  memory: '256MiB' as const,
  maxInstances: 10,
  retry: true,
};

export const syncInstructorLessonRevenueBooking = onDocumentWritten(
  { ...GUEST_RECONCILIATION_TRIGGER_OPTIONS, document: 'bookings/{bookingId}' },
  async (event) => {
    await syncInstructorLessonRevenue(getAdminFirestore(), event.params.bookingId);
  }
);

export const syncInstructorLessonRevenuePayment = onDocumentWritten(
  { ...GUEST_RECONCILIATION_TRIGGER_OPTIONS, document: 'payments/{paymentId}' },
  async (event) => {
    await syncInstructorLessonRevenuePaymentWrite(
      getAdminFirestore(),
      event.data?.before.data(),
      event.data?.after.data()
    );
  }
);
export const syncGuestBookingConfirmationWork = onDocumentWritten(
  { ...GUEST_RECONCILIATION_TRIGGER_OPTIONS, document: 'bookings/{bookingId}' },
  async (event) => {
    await syncGuestConfirmationWrite(
      getAdminFirestore(),
      'bookings',
      event.params.bookingId,
      event.data?.before.data(),
      event.data?.after.data()
    );
  }
);
export const syncGuestEnrollmentConfirmationWork = onDocumentWritten(
  { ...GUEST_RECONCILIATION_TRIGGER_OPTIONS, document: 'course_enrollments/{enrollmentId}' },
  async (event) => {
    await syncGuestConfirmationWrite(
      getAdminFirestore(),
      'course_enrollments',
      event.params.enrollmentId,
      event.data?.before.data(),
      event.data?.after.data()
    );
  }
);
export const syncGuestPaymentConfirmationWork = onDocumentWritten(
  { ...GUEST_RECONCILIATION_TRIGGER_OPTIONS, document: 'payments/{paymentId}' },
  async (event) => {
    await syncGuestConfirmationWrite(
      getAdminFirestore(),
      'payments',
      event.params.paymentId,
      event.data?.before.data(),
      event.data?.after.data()
    );
  }
);

export const scheduledExpireGuestLessonReservations = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await sweepExpiredGuestLessonReservations(getAdminFirestore());
    console.log(
      `Expired guest lesson reservations scanned ${result.scannedCandidates} candidate(s).`
    );
  }
);

export const scheduledExpireGuestCourseReservations = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await sweepExpiredGuestCourseReservations(getAdminFirestore());
    console.log(
      JSON.stringify({
        job: 'scheduledExpireGuestCourseReservations',
        scannedCandidates: result.scannedCandidates,
        expired: result.expired,
        fullyFunded: result.fullyFunded,
        alreadyTerminal: result.alreadyTerminal,
        alreadyIneligible: result.alreadyIneligible,
        stale: result.stale,
        invalidIntegrity: result.invalidIntegrity,
        failed: result.failed,
        pages: result.pages,
        truncated: result.truncated,
      })
    );
  }
);

export const scheduledResolveLessonBookingAttendanceOutcomes = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await sweepLessonBookingAttendanceOutcomes(getAdminFirestore());
    console.log('Lesson booking attendance outcome sweep completed.', {
      candidateSource: result.candidateSource,
      candidateDocsRead: result.candidateDocsRead,
      workCandidatesSelected: result.workCandidatesSelected,
      idempotencyHits: result.idempotencyHits,
      idempotencyMisses: result.idempotencyMisses,
      outcomeDeadlineCandidates: result.outcomeDeadlineCandidates,
      instructorWindowCandidates: result.instructorWindowCandidates,
      resolved: result.resolved,
      issuesOpened: result.issuesOpened,
      futureCandidatesSkipped: result.futureCandidatesSkipped,
      pages: result.pages,
      truncated: result.truncated,
    });
  }
);

export const scheduledResolveCourseEnrollmentOutcomes = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const result = await sweepCourseEnrollmentOutcomes(getAdminFirestore());
    console.log('CourseEnrollment outcome sweep completed.', result);
  }
);

export const syncLessonBookingAttendanceOutcomeWork = onDocumentWritten(
  {
    document: 'bookings/{bookingId}',
    region: 'us-central1',
    cpu: 1,
    memory: '256MiB',
    maxInstances: 10,
    retry: true,
  },
  async (event) => {
    const beforeData = event.data?.before.exists
      ? (event.data.before.data() as Record<string, unknown>)
      : undefined;
    const afterData = event.data?.after.exists
      ? (event.data.after.data() as Record<string, unknown>)
      : undefined;
    const outcome = await syncLessonBookingAttendanceOutcomeWorkForBookingWrite(
      getAdminFirestore(),
      {
        rawBookingId: event.params.bookingId,
        beforeData,
        afterData,
      }
    );
    console.log('Lesson booking attendance outcome work synchronized.', { outcome });
  }
);

export const syncCourseEnrollmentOutcomeWork = onDocumentWritten(
  {
    document: 'course_enrollments/{enrollmentId}',
    region: 'us-central1',
    cpu: 1,
    memory: '256MiB',
    maxInstances: 10,
    retry: true,
  },
  async (event) => {
    const afterData = event.data?.after.exists
      ? (event.data.after.data() as Record<string, unknown>)
      : undefined;
    const outcome = await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(getAdminFirestore(), {
      rawEnrollmentId: event.params.enrollmentId,
      afterData,
    });
    console.log('CourseEnrollment outcome work synchronized.', { outcome });
  }
);
