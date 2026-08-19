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

export const scheduledAutoCompleteBookings = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Almaty',
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
