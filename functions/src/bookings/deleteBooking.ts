import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { deleteBookingRecord, DeleteBookingResult } from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';

export interface DeleteBookingInput {
  bookingId: string;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function parseDeleteBookingInput(data: unknown): DeleteBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Delete booking payload is required.');
  }
  const payload = data as Record<string, unknown>;
  return { bookingId: requireString(payload.bookingId, 'bookingId') };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function deleteBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<DeleteBookingResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!callerSnap.exists || !isAdminProfile(callerSnap.data())) {
      throw new HttpsError('permission-denied', 'Only administrators can delete bookings.');
    }

    const { bookingId } = parseDeleteBookingInput(request.data);

    try {
      return await deleteBookingRecord(
        db,
        bookingId,
        idempotencySpecFromRequest(request.data, `deleteBooking_${request.auth.uid}`, { bookingId })
      );
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      if (error instanceof Error && error.message === 'Booking does not exist.') {
        throw new HttpsError('not-found', 'Booking does not exist.');
      }
      throw new HttpsError('internal', 'Failed to delete booking.');
    }
  };
}
