import { Firestore } from 'firebase-admin/firestore';
import {
  AVAILABILITY_HOUR_LOCKS_COLLECTION,
  buildHourLockIds,
} from '@ski-academy/shared-domain';

const BOOKINGS_COLLECTION = 'bookings';
const AVAILABILITY_SLOTS_COLLECTION = 'availability_slots';
const COURSES_COLLECTION = 'courses';
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
  courseId?: string;
  isDeleted?: boolean;
};

function isActiveCourseEnrollment(booking: BookingRecord): boolean {
  return (
    booking.instructorId.startsWith('course_') &&
    booking.isDeleted !== true &&
    (booking.status === 'pending' ||
      booking.status === 'confirmed' ||
      booking.status === 'pending_cancellation')
  );
}

function resolveCourseId(booking: BookingRecord): string | null {
  if (booking.courseId) return booking.courseId;
  if (!booking.instructorId.startsWith('course_')) return null;
  return booking.instructorId.slice('course_'.length);
}

function isCourseBooking(booking: Pick<BookingRecord, 'instructorId'>): boolean {
  return booking.instructorId.startsWith('course_');
}

function isEligibleForAutoComplete(booking: BookingRecord, now: Date): boolean {
  if (booking.isDeleted === true) {
    return false;
  }

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
  if (booking.status === 'completed') {
    return;
  }

  const shouldReleaseCourseSeat = isActiveCourseEnrollment(booking);
  const batch = db.batch();
  batch.update(db.collection(BOOKINGS_COLLECTION).doc(bookingId), { status: 'completed' });

  if (!isCourseBooking(booking)) {
    for (const lockId of buildHourLockIds({
      instructorId: booking.instructorId,
      date: booking.date,
      time: booking.time || '00:00',
      durationHours: booking.durationHours || 1,
    })) {
      batch.delete(db.collection(AVAILABILITY_HOUR_LOCKS_COLLECTION).doc(lockId));
    }
    batch.delete(db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId));
  } else if (shouldReleaseCourseSeat) {
    const courseId = resolveCourseId(booking);
    if (courseId) {
      const courseRef = db.collection(COURSES_COLLECTION).doc(courseId);
      const courseSnap = await courseRef.get();
      if (courseSnap.exists) {
        const courseData = courseSnap.data() as { availableSeats?: number; totalSeats?: number };
        const availableSeats = courseData.availableSeats ?? 0;
        const totalSeats = courseData.totalSeats ?? availableSeats;
        if (availableSeats < totalSeats) {
          batch.update(courseRef, { availableSeats: availableSeats + 1 });
        }
      }
    }
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
    .where('status', 'in', ['confirmed', 'pending_cancellation'])
    .where('endsAt', '<=', nowIso)
    .orderBy('endsAt', 'asc')
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
