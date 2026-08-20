import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { isCourseBooking } from '@ski-academy/shared-domain';
import { BookingRecord, BookingScheduleUpdates, rescheduleBookingRecord } from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';
import { rethrowAsHttpsError } from './mapBookingHttpsError';

export interface UpdateBookingScheduleInput {
  bookingId: string;
  date?: string;
  time?: string;
  instructorId?: string;
  allowNegativeBalance?: boolean;
}

export interface UpdateBookingScheduleResult {
  success: boolean;
  bookingId: string;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected a string value.');
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected a boolean value.');
  }
  return value;
}

function parseUpdateBookingScheduleInput(data: unknown): UpdateBookingScheduleInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Update schedule payload is required.');
  }

  const payload = data as Record<string, unknown>;

  return {
    bookingId: requireString(payload.bookingId, 'bookingId'),
    date: optionalString(payload.date),
    time: optionalString(payload.time),
    instructorId: optionalString(payload.instructorId),
    allowNegativeBalance: optionalBoolean(payload.allowNegativeBalance),
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function updateBookingScheduleHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<UpdateBookingScheduleResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const input = parseUpdateBookingScheduleInput(request.data);

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
    const callerProfile = callerSnap.data();
    const isAdmin = isAdminProfile(callerProfile);
    const isOwner = booking.userId === request.auth.uid;

    if (!isAdmin && !isOwner) {
      throw new HttpsError(
        'permission-denied',
        'You are not authorized to update this booking schedule.'
      );
    }

    // Only admins can reassign instructors
    if (!isAdmin && input.instructorId && input.instructorId !== booking.instructorId) {
      throw new HttpsError(
        'permission-denied',
        'Only administrators can reassign instructors.'
      );
    }

    if (input.allowNegativeBalance && !isAdmin) {
      throw new HttpsError(
        'permission-denied',
        'Only administrators can approve a negative client balance.'
      );
    }

    if (isCourseBooking(booking)) {
      throw new HttpsError('invalid-argument', 'Course bookings cannot be rescheduled.');
    }

    const updates: BookingScheduleUpdates = {
      date: input.date,
      time: input.time,
      instructorId: input.instructorId,
      allowNegativeBalance: isAdmin ? input.allowNegativeBalance : undefined,
    };

    try {
      return await rescheduleBookingRecord(
        db,
        input.bookingId,
        updates,
        idempotencySpecFromRequest(request.data, `updateBookingSchedule_${request.auth.uid}`, {
          bookingId: input.bookingId,
          date: input.date ?? null,
          time: input.time ?? null,
          instructorId: input.instructorId ?? null,
          allowNegativeBalance: updates.allowNegativeBalance === true,
        })
      );
    } catch (error) {
      rethrowAsHttpsError(error, 'Failed to update booking schedule.', {
        insufficientFundsMessage: 'Insufficient funds to reassign this booking.',
        overlapMessage: 'The requested time slot overlaps with an existing booking.',
      });
    }
  };
}
