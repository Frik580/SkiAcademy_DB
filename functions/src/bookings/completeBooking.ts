import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { BookingRecord, finalizeBookingCompletionRecord } from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';

export interface CompleteBookingInput {
  bookingId: string;
}

export interface CompleteBookingResult {
  bookingId: string;
  status: 'completed';
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function parseCompleteBookingInput(data: unknown): CompleteBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Complete booking payload is required.');
  }

  const payload = data as Record<string, unknown>;

  return {
    bookingId: requireString(payload.bookingId, 'bookingId'),
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function completeBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<CompleteBookingResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const { bookingId } = parseCompleteBookingInput(request.data);

    const bookingRef = db.collection('bookings').doc(bookingId);
    const callerRef = db.collection('users').doc(request.auth.uid);

    const [bookingSnap, callerSnap] = await Promise.all([
      bookingRef.get(),
      callerRef.get(),
    ]);

    if (!bookingSnap.exists) {
      throw new HttpsError('not-found', 'Booking does not exist.');
    }

    const booking = bookingSnap.data() as BookingRecord;
    const callerProfile = callerSnap.data();
    const isAdmin = isAdminProfile(callerProfile);
    const isAssignedInstructor =
      typeof callerProfile?.instructorId === 'string' &&
      callerProfile.instructorId === booking.instructorId;

    if (!isAdmin && !isAssignedInstructor) {
      throw new HttpsError(
        'permission-denied',
        'You are not authorized to complete this booking.'
      );
    }

    const result = await finalizeBookingCompletionRecord(
      db,
      bookingId,
      idempotencySpecFromRequest(request.data, `completeBooking_${request.auth.uid}`, { bookingId })
    );
    if (!result) {
      throw new HttpsError('not-found', 'Booking does not exist.');
    }

    if (!booking.userId.startsWith('system_block_')) {
      try {
        await db
          .collection('activity_logs')
          .doc(`act_booking_${bookingId}_completed`)
          .set(
            {
              userId: booking.userId,
              actorId: request.auth.uid,
              type: 'booking_completed',
              metadata: {
                bookingId: booking.id,
                instructorName: booking.instructorName,
                date: booking.date,
                time: booking.time,
              },
              timestamp: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch (err) {
        console.error('Error logging activity for completed booking:', err);
      }
    }

    return result;
  };
}
