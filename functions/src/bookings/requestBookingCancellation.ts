import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { BookingRecord, requestBookingCancellationRecord } from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';
import { rethrowAsHttpsError } from './mapBookingHttpsError';

export interface RequestBookingCancellationInput {
  bookingId: string;
  reason?: string;
}

export interface RequestBookingCancellationResult {
  bookingId: string;
  status: 'pending_cancellation';
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected a string value.');
  }
  return value.trim();
}

function parseRequestBookingCancellationInput(
  data: unknown
): RequestBookingCancellationInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Cancellation request payload is required.');
  }
  const payload = data as Record<string, unknown>;
  return {
    bookingId: requireString(payload.bookingId, 'bookingId'),
    reason: optionalString(payload.reason),
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function requestBookingCancellationHandler(db: Firestore) {
  return async (
    request: CallableRequest<unknown>
  ): Promise<RequestBookingCancellationResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const input = parseRequestBookingCancellationInput(request.data);
    const bookingRef = db.collection('bookings').doc(input.bookingId);
    const callerRef = db.collection('users').doc(request.auth.uid);

    const [bookingSnap, callerSnap] = await Promise.all([
      bookingRef.get(),
      callerRef.get(),
    ]);

    if (!bookingSnap.exists) {
      throw new HttpsError('not-found', 'Booking does not exist.');
    }

    const booking = bookingSnap.data() as BookingRecord;
    const isOwner = booking.userId === request.auth.uid;
    const isAdmin = isAdminProfile(callerSnap.data());
    if (!isOwner && !isAdmin) {
      throw new HttpsError(
        'permission-denied',
        'You cannot request cancellation for this booking.'
      );
    }

    try {
      return await requestBookingCancellationRecord(
        db,
        input.bookingId,
        input.reason ?? '',
        idempotencySpecFromRequest(request.data, `requestBookingCancellation_${request.auth.uid}`, {
          bookingId: input.bookingId,
          reason: input.reason ?? '',
        })
      );
    } catch (error) {
      rethrowAsHttpsError(error, 'Failed to request booking cancellation.');
    }
  };
}
