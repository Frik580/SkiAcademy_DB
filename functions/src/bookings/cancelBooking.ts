import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { buildHourLockIds, isCourseBooking } from '@ski-academy/shared-domain';
import { idempotencySpecFromRequest, withOptionalIdempotency } from '../idempotency';
import { recordWalletLedgerEntryInTransaction, walletLedgerEntryId } from '../walletLedger';

type CancelBookingInput = { bookingId: string; refundAmount?: number };

type StoredBooking = {
  userId: string;
  instructorId: string;
  instructorName: string;
  courseId?: string;
  totalPrice?: number;
  status: string;
  isDeleted?: boolean;
  date: string;
  time: string;
  durationHours: number;
};

function parseInput(data: unknown): CancelBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Cancellation payload is required.');
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.bookingId !== 'string' || !payload.bookingId.trim()) {
    throw new HttpsError('invalid-argument', 'bookingId is required.');
  }
  if (
    payload.refundAmount !== undefined &&
    (typeof payload.refundAmount !== 'number' ||
      !Number.isFinite(payload.refundAmount) ||
      payload.refundAmount < 0)
  ) {
    throw new HttpsError('invalid-argument', 'refundAmount must be a non-negative number.');
  }
  return {
    bookingId: payload.bookingId.trim(),
    ...(typeof payload.refundAmount === 'number' ? { refundAmount: payload.refundAmount } : {}),
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function cancelBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const input = parseInput(request.data);
    const requesterId = request.auth.uid;

    return withOptionalIdempotency(
      db,
      idempotencySpecFromRequest(request.data, `cancelBooking_${requesterId}`, {
        bookingId: input.bookingId,
        refundAmount: input.refundAmount ?? null,
      }),
      async (transaction, commit) => {
      const bookingRef = db.collection('bookings').doc(input.bookingId);
      const requesterRef = db.collection('users').doc(requesterId);
      const [bookingSnap, requesterSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(requesterRef),
      ]);
      if (!bookingSnap.exists) throw new HttpsError('not-found', 'Booking does not exist.');

      const booking = bookingSnap.data() as StoredBooking;
      const isOwner = booking.userId === requesterId;
      const isAdmin = isAdminProfile(requesterSnap.data());
      if (!isOwner && !isAdmin) {
        throw new HttpsError('permission-denied', 'You cannot cancel this booking.');
      }
      if (booking.status === 'cancelled') {
        const result = { refunded: 0, alreadyCancelled: true };
        commit(result);
        return result;
      }
      if (!isAdmin && input.refundAmount !== undefined) {
        throw new HttpsError('permission-denied', 'Only an administrator can set a refund amount.');
      }

      const totalPrice = typeof booking.totalPrice === 'number' ? booking.totalPrice : 0;
      const refund = booking.status === 'completed' ? 0 : (input.refundAmount ?? totalPrice);
      if (refund > totalPrice) {
        throw new HttpsError('invalid-argument', 'refundAmount cannot exceed the booking price.');
      }

      const isGuestOrSystem =
        booking.userId.startsWith('guest_') || booking.userId.startsWith('system_block_');
      const courseRef = isCourseBooking(booking)
        ? db.collection('courses').doc(booking.courseId ?? booking.instructorId.slice('course_'.length))
        : null;
      const bookingOwnerRef =
        refund > 0 && !isGuestOrSystem ? db.collection('users').doc(booking.userId) : null;
      const [courseSnap, bookingOwnerSnap] = await Promise.all([
        courseRef ? transaction.get(courseRef) : Promise.resolve(null),
        bookingOwnerRef
          ? booking.userId === requesterId
            ? Promise.resolve(requesterSnap)
            : transaction.get(bookingOwnerRef)
          : Promise.resolve(null),
      ]);

      transaction.update(bookingRef, { status: 'cancelled' });

      if (courseRef && courseSnap?.exists && booking.isDeleted !== true) {
          const course = courseSnap.data();
          const availableSeats = course?.availableSeats;
          const totalSeats = course?.totalSeats;
          if (
            typeof availableSeats === 'number' &&
            typeof totalSeats === 'number' &&
            availableSeats < totalSeats
          ) {
            transaction.update(courseRef, { availableSeats: availableSeats + 1 });
          }
      } else {
        for (const lockId of buildHourLockIds(booking)) {
          transaction.delete(db.collection('availability_hour_locks').doc(lockId));
        }
        transaction.delete(db.collection('availability_slots').doc(input.bookingId));
      }

      if (refund > 0 && bookingOwnerRef && bookingOwnerSnap) {
        if (!bookingOwnerSnap.exists) {
          throw new HttpsError('not-found', 'Booking owner profile does not exist.');
        }
        const balance = bookingOwnerSnap.data()?.balanceUSD;
        const currentBalance = typeof balance === 'number' ? balance : 0;
        const newBalance = currentBalance + refund;
        transaction.update(bookingOwnerRef, { balanceUSD: newBalance });
        recordWalletLedgerEntryInTransaction(transaction, db, {
          userId: booking.userId,
          amount: refund,
          balanceAfter: newBalance,
          type: 'refund',
          subjectName: booking.instructorName,
          bookingId: input.bookingId,
          courseId: booking.courseId,
          entryId: walletLedgerEntryId('refund', input.bookingId),
        });
      }

      const result = { refunded: refund, alreadyCancelled: false };
      commit(result);
      return result;
    }
    );
  };
}
