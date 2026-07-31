import { Booking, Course } from '../types';
import {
  activityLogId,
  buildBookingCompletedMetadata,
  logActivityForUser,
} from './activityLog';

export const backfillCompletedBookingActivityLogs = async (
  bookings: Booking[],
  courses: Course[],
  actorId: string
): Promise<{ written: number }> => {
  const completed = bookings.filter(
    (booking) => booking.status === 'completed' && !booking.isDeleted
  );

  let written = 0;
  for (const booking of completed) {
    await logActivityForUser(
      booking.userId,
      actorId,
      'booking_completed',
      buildBookingCompletedMetadata(booking, courses),
      activityLogId.bookingCompleted(booking.id)
    );
    written += 1;
  }

  return { written };
};
