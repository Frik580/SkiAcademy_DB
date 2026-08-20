import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { BookingRecord, confirmBookingRecord } from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';
import { rethrowAsHttpsError } from './mapBookingHttpsError';

export interface ConfirmBookingInput {
  bookingId: string;
}

export interface ConfirmBookingResult {
  bookingId: string;
  status: 'confirmed';
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function parseConfirmBookingInput(data: unknown): ConfirmBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Confirm booking payload is required.');
  }
  const payload = data as Record<string, unknown>;
  return { bookingId: requireString(payload.bookingId, 'bookingId') };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function confirmBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<ConfirmBookingResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const { bookingId } = parseConfirmBookingInput(request.data);
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
        'You are not authorized to confirm this booking.'
      );
    }

    try {
      return await confirmBookingRecord(
        db,
        bookingId,
        idempotencySpecFromRequest(request.data, `confirmBooking_${request.auth.uid}`, { bookingId })
      );
    } catch (error) {
      rethrowAsHttpsError(error, 'Failed to confirm booking.', {
        insufficientFundsMessage:
          'Недостаточно средств на счету клиента для подтверждения этого занятия.',
      });
    }
  };
}
