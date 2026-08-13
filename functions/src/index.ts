import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getAdminFirestore } from './adminFirestore';
import { autoCompletePastBookings } from './bookings/autoComplete';
import { createCreateBookingHandler } from './bookings/createBooking';
import { purgeExpiredNotifications } from './purgeExpiredNotifications';

export const createBooking = onCall({ region: 'us-central1' }, async (request) =>
  createCreateBookingHandler(getAdminFirestore())(request)
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
