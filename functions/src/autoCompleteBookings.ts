import { Firestore } from 'firebase-admin/firestore';

const BOOKINGS_COLLECTION = 'bookings';
const AVAILABILITY_SLOTS_COLLECTION = 'availability_slots';
const ACTIVITY_LOGS_COLLECTION = 'activity_logs';
export const SYSTEM_AUTO_COMPLETE_ACTOR_ID = 'system_auto_complete';

type BookingRecord = {
  userId: string;
  instructorId: string;
  instructorName: string;
  status: string;
  date: string;
  time?: string;
  durationHours?: number;
  endsAt?: string;
  difficulty?: string;
};

function isCourseBooking(booking: Pick<BookingRecord, 'instructorId'>): boolean {
  return booking.instructorId.startsWith('course_');
}

function isEligibleForAutoComplete(booking: BookingRecord, now: Date): boolean {
  if (booking.status !== 'confirmed' && booking.status !== 'pending_cancellation') {
    return false;
  }

  if (!booking.endsAt) {
    return false;
  }

  const endsAt = new Date(booking.endsAt);
  return !isNaN(endsAt.getTime()) && now >= endsAt;
}

async function completeBooking(
  db: Firestore,
  bookingId: string,
  booking: BookingRecord
): Promise<void> {
  const batch = db.batch();
  batch.update(db.collection(BOOKINGS_COLLECTION).doc(bookingId), { status: 'completed' });

  if (!isCourseBooking(booking)) {
    batch.delete(db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId));
  }

  await batch.commit();

  if (booking.userId.startsWith('system_block_')) {
    return;
  }

  await db
    .collection(ACTIVITY_LOGS_COLLECTION)
    .doc(`act_booking_${bookingId}_completed`)
    .set(
      {
        userId: booking.userId,
        actorId: SYSTEM_AUTO_COMPLETE_ACTOR_ID,
        type: 'booking_completed',
        timestamp: new Date().toISOString(),
        metadata: {
          bookingId,
          instructorId: booking.instructorId,
          instructorName: booking.instructorName,
          lessonTitle: booking.instructorName,
          difficulty: booking.difficulty,
          durationHours: booking.durationHours,
          time: booking.time,
        },
      },
      { merge: true }
    );
}

export async function autoCompletePastBookings(db: Firestore, maxResults = 200): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const snapshot = await db
    .collection(BOOKINGS_COLLECTION)
    .where('endsAt', '<=', nowIso)
    .limit(maxResults)
    .get();

  let completedCount = 0;

  for (const bookingDoc of snapshot.docs) {
    const booking = bookingDoc.data() as BookingRecord;
    if (!isEligibleForAutoComplete(booking, now)) {
      continue;
    }

    try {
      await completeBooking(db, bookingDoc.id, booking);
      completedCount += 1;
    } catch (error) {
      console.error(`Failed to auto-complete booking ${bookingDoc.id}:`, error);
    }
  }

  return completedCount;
}
