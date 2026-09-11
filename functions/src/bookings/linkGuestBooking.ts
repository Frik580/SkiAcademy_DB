import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { BookingRecord } from './bookingLogic';
import { idempotencySpecFromRequest, withOptionalIdempotency } from '../idempotency';

export interface LinkGuestBookingInput {
  bookingId: string;
  targetUserId: string;
}

export interface LinkGuestBookingResult {
  newBalance: number;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function parseLinkGuestBookingInput(data: unknown): LinkGuestBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Link guest booking payload is required.');
  }

  const payload = data as Record<string, unknown>;

  return {
    bookingId: requireString(payload.bookingId, 'bookingId'),
    targetUserId: requireString(payload.targetUserId, 'targetUserId'),
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function linkGuestBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<LinkGuestBookingResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const callerRef = db.collection('users').doc(request.auth.uid);
    const callerSnap = await callerRef.get();
    if (!callerSnap.exists || !isAdminProfile(callerSnap.data())) {
      throw new HttpsError('permission-denied', 'Only administrators can link guest bookings.');
    }

    const { bookingId, targetUserId } = parseLinkGuestBookingInput(request.data);

    const result = await withOptionalIdempotency<LinkGuestBookingResult>(
      db,
      idempotencySpecFromRequest(request.data, `linkGuestBooking_${request.auth.uid}`, {
        bookingId,
        targetUserId,
      }),
      async (transaction, commit) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const targetUserRef = db.collection('users').doc(targetUserId);

      const [bookingSnap, targetUserSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(targetUserRef),
      ]);

      if (!bookingSnap.exists) {
        throw new HttpsError('not-found', 'Booking does not exist.');
      }
      if (!targetUserSnap.exists) {
        throw new HttpsError('not-found', 'Target user profile does not exist.');
      }

      const booking = bookingSnap.data() as BookingRecord;
      const oldUserId = booking.userId;
      const isGuestBooking = booking.isGuest === true || oldUserId.startsWith('guest_');

      const targetUserData = targetUserSnap.data() as Record<string, unknown>;
      const currentBalance = typeof targetUserData.balanceUSD === 'number' ? targetUserData.balanceUSD : 0;

      if (oldUserId === targetUserId) {
        if (booking.isGuest === true) {
          transaction.update(bookingRef, { isGuest: false });
        }
        const result = { newBalance: currentBalance };
        commit(result);
        return result;
      }

      if (!isGuestBooking) {
        throw new HttpsError(
          'failed-precondition',
          'Only guest bookings can be linked to a user account.'
        );
      }

      transaction.update(bookingRef, {
        userId: targetUserId,
        isGuest: false,
      });

      const result = { newBalance: currentBalance };
      commit(result);
      return result;
    }
    );

    return result;
  };
}
