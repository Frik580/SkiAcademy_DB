import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getAdminFirestore } from './adminFirestore';
import { addBookingHandler } from './bookings/addBooking';
import { autoCompletePastBookings } from './bookings/autoComplete';
import { cancelBookingHandler } from './bookings/cancelBooking';
import { completeBookingHandler } from './bookings/completeBooking';
import { confirmBookingHandler } from './bookings/confirmBooking';
import { createCreateBookingHandler } from './bookings/createBooking';
import { createGuestBookingHandler } from './bookings/createGuestBooking';
import { deleteBookingHandler } from './bookings/deleteBooking';
import { linkGuestBookingHandler } from './bookings/linkGuestBooking';
import { requestBookingCancellationHandler } from './bookings/requestBookingCancellation';
import { updateBookingScheduleHandler } from './bookings/updateBookingSchedule';
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

export { optimizeImage } from './images/optimizeImageHttp';

/** Browser callables need public Cloud Run invoker; auth is enforced inside the handler. */
const CANONICAL_CALLABLE_OPTIONS = { region: 'us-central1', invoker: 'public' as const };

export const createBooking = onCall({ region: 'us-central1' }, async (request) =>
  createCreateBookingHandler(getAdminFirestore())(request)
);

export const addBooking = onCall({ region: 'us-central1' }, async (request) =>
  addBookingHandler(getAdminFirestore())(request)
);

export const createGuestBooking = onCall({ region: 'us-central1' }, async (request) =>
  createGuestBookingHandler(getAdminFirestore())(request)
);

export const updateBookingSchedule = onCall({ region: 'us-central1' }, async (request) =>
  updateBookingScheduleHandler(getAdminFirestore())(request)
);

export const linkGuestBooking = onCall({ region: 'us-central1' }, async (request) =>
  linkGuestBookingHandler(getAdminFirestore())(request)
);

export const completeBooking = onCall({ region: 'us-central1' }, async (request) =>
  completeBookingHandler(getAdminFirestore())(request)
);

export const cancelBooking = onCall({ region: 'us-central1' }, async (request) =>
  cancelBookingHandler(getAdminFirestore())(request)
);

export const confirmBooking = onCall({ region: 'us-central1' }, async (request) =>
  confirmBookingHandler(getAdminFirestore())(request)
);

export const deleteBooking = onCall({ region: 'us-central1' }, async (request) =>
  deleteBookingHandler(getAdminFirestore())(request)
);

export const requestBookingCancellation = onCall({ region: 'us-central1' }, async (request) =>
  requestBookingCancellationHandler(getAdminFirestore())(request)
);

export const createGuestCourseEnrollment = onCall({ region: 'us-central1' }, async (request) =>
  createGuestCourseEnrollmentHandler(getAdminFirestore())(request)
);

export const enrollInCourse = onCall({ region: 'us-central1' }, async (request) =>
  enrollInCourseHandler(getAdminFirestore())(request)
);

export const executeCanonicalCommand = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createExecuteCanonicalCommandHandler(getAdminFirestore())(request)
);

export const executeGuestCanonicalCommand = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createExecuteGuestCanonicalCommandHandler(getAdminFirestore())(request)
);

export const queryLessonBookingReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
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
  async (request) =>
    createQueryBookingChangeRequestReadModelsHandler(getAdminFirestore())(request)
);

export const queryParticipantInstructorAccessReadModels = onCall(
  CANONICAL_CALLABLE_OPTIONS,
  async (request) =>
    createQueryParticipantInstructorAccessReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseEnrollmentReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryCourseEnrollmentReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseCatalogReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryCourseCatalogReadModelsHandler(getAdminFirestore())(request)
);

export const queryCourseAttendanceReadModels = onCall(CANONICAL_CALLABLE_OPTIONS, async (request) =>
  createQueryCourseAttendanceReadModelsHandler(getAdminFirestore())(request)
);

export const scheduledAutoCompleteBookings = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Almaty',
    cpu: 'gcf_gen1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    const completedCount = await autoCompletePastBookings(getAdminFirestore());
    console.log(`Auto-completed ${completedCount} booking(s).`);
  }
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
