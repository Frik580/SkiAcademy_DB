import { defineSecret } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getAdminFirestore } from './adminFirestore';
import { createGuestCourseEnrollmentHandler } from './courses/createGuestCourseEnrollment';
import { enrollInCourseHandler } from './courses/enrollInCourse';
import { purgeExpiredNotifications } from './purgeExpiredNotifications';
import { createExecuteCanonicalCommandHandler } from './canonical/commands/executeCanonicalCommandCallable';
import { createExecuteGuestCanonicalCommandHandler } from './canonical/commands/executeGuestCanonicalCommandCallable';
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
import { createQueryLessonPricingSettingsReadModelHandler } from './canonical/readModels/queryLessonPricingSettingsReadModelCallable';
import { createQueryInstructorReviewReadModelsHandler } from './canonical/readModels/queryInstructorReviewReadModelsCallable';
import { createQueryParticipantProgressReadModelsHandler } from './canonical/readModels/queryParticipantProgressReadModelsCallable';
import { createQueryParticipantAchievementsReadModelsHandler } from './canonical/readModels/queryParticipantAchievementsReadModelsCallable';
import { createQueryParticipantLessonFeedbackReadModelsHandler } from './canonical/readModels/queryParticipantLessonFeedbackReadModelsCallable';
import { sweepGuestConfirmationLifecycleMismatches } from './canonical/guestConfirmation/guestConfirmationReconciliationSweep';
import { sweepExpiredGuestLessonReservations } from './canonical/bookings/guestLessonReservationExpirySweep';
import { sweepLessonBookingAttendanceOutcomes } from './canonical/bookings/bookingAttendanceOutcomeSweep';

export { optimizeImage } from './images/optimizeImageHttp';

/** Browser callables need public Cloud Run invoker; auth is enforced inside the handler. */
const CANONICAL_CALLABLE_OPTIONS = { region: 'us-central1', invoker: 'public' as const };

/** Guest action credential signing/verification — only bound to callables that read it. */
const guestActionTokenSecret = defineSecret('GUEST_ACTION_TOKEN_SECRET');

const GUEST_SECRET_CALLABLE_OPTIONS = {
  ...CANONICAL_CALLABLE_OPTIONS,
  secrets: [guestActionTokenSecret],
};

export const createGuestCourseEnrollment = onCall({ region: 'us-central1' }, async (request) =>
  createGuestCourseEnrollmentHandler(getAdminFirestore())(request)
);

export const enrollInCourse = onCall({ region: 'us-central1' }, async (request) =>
  enrollInCourseHandler(getAdminFirestore())(request)
);

export const executeCanonicalCommand = onCall(GUEST_SECRET_CALLABLE_OPTIONS, async (request) =>
  createExecuteCanonicalCommandHandler(getAdminFirestore())(request)
);

export const executeGuestCanonicalCommand = onCall(GUEST_SECRET_CALLABLE_OPTIONS, async (request) =>
  createExecuteGuestCanonicalCommandHandler(getAdminFirestore())(request)
);

export const queryLessonBookingReadModels = onCall(GUEST_SECRET_CALLABLE_OPTIONS, async (request) =>
  createQueryLessonBookingReadModelsHandler(getAdminFirestore())(request)
);

export const queryManagedParticipantPickerReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryManagedParticipantPickerReadModelsHandler(getAdminFirestore())(request)
);

export const queryBookingProposalReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryBookingProposalReadModelsHandler(getAdminFirestore())(request)
);

export const queryBookingChangeRequestReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryBookingChangeRequestReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantInstructorAccessReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantInstructorAccessReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseEnrollmentReadModels = onCall(
  GUEST_SECRET_CALLABLE_OPTIONS,
  async (request) => createQueryCourseEnrollmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseCatalogReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryCourseCatalogReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseAttendanceReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryCourseAttendanceReadModelsHandler(getAdminFirestore())(request)
);

export const queryInstructorCourseAssignmentReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryInstructorCourseAssignmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminIssueReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryAdminIssueReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminFinanceReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryAdminFinanceReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminCourseReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryAdminCourseReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminCourseEnrollmentReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryAdminCourseEnrollmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminIdentityReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryAdminIdentityReadModelsHandler(getAdminFirestore())(request)
);

export const queryAdminPlannerReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryAdminPlannerReadModelsHandler(getAdminFirestore())(request)
);

export const queryInstructorOccupancyReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryInstructorOccupancyReadModelsHandler(getAdminFirestore())(request)
);

export const queryLessonPricingSettingsReadModel = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryLessonPricingSettingsReadModelHandler(getAdminFirestore())(request)
);

export const queryInstructorReviewReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryInstructorReviewReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantProgressReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) => createQueryParticipantProgressReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantAchievementsReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantAchievementsReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantLessonFeedbackReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantLessonFeedbackReadModelsHandler(getAdminFirestore())(request)
);

export const scheduledPurgeExpiredNotifications = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Asia/Almaty',
  },
  async () => {
    const deletedCount = await purgeExpiredNotifications(getAdminFirestore());
    console.log(`Purged ${deletedCount} expired notification(s).`);
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
    const result = await sweepGuestConfirmationLifecycleMismatches(getAdminFirestore());
    console.log(
      JSON.stringify({
        job: 'scheduledReconcileGuestConfirmationMismatches',
        scannedCandidates: result.scannedCandidates,
        fullyFundedCandidates: result.fullyFundedCandidates,
        alreadyOpenSkipped: result.alreadyOpenSkipped,
        workCandidatesSelected: result.workCandidatesSelected,
        reconciled: result.reconciled,
        skipped: result.skipped,
        pages: result.pages,
        truncated: result.truncated,
        subjectDocsRead: result.subjectDocsRead,
        paymentLookupReads: result.paymentLookupReads,
        issueLookupReads: result.issueLookupReads,
      })
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
    console.log(
      `Resolved lesson booking attendance outcomes scanned ${result.scannedCandidates} candidate(s).`
    );
  }
);
