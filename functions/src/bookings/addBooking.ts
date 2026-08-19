import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import {
  BookingRecord,
  BookingStatus,
  createBookingWithPayment,
  LessonDifficulty,
} from './bookingLogic';
import { idempotencySpecFromRequest } from '../idempotency';
import { rethrowAsHttpsError } from './mapBookingHttpsError';

const VALID_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'pending_cancellation',
];

const VALID_DIFFICULTIES: LessonDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'freeride',
  'freestyle',
];

export interface AddBookingInput {
  userId: string;
  booking: {
    id: string;
    instructorId: string;
    instructorName: string;
    instructorAvatar?: string;
    date: string;
    time: string;
    durationHours: number;
    status: BookingStatus;
    difficulty: LessonDifficulty;
    notes?: string;
    totalPrice?: number;
    isGuest?: boolean;
    guestName?: string;
    guestPhone?: string;
    guestEmail?: string;
    guestNotes?: string;
  };
}

export interface AddBookingResult {
  bookingId: string;
  totalPrice: number;
  newBalance: number;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected a string value.');
  }
  return value.trim();
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new HttpsError('invalid-argument', `${field} must be a positive number.`);
  }
  return value;
}

function parseAddBookingInput(data: unknown): AddBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Booking payload is required.');
  }

  const payload = data as Record<string, unknown>;
  const rawBooking = (payload.booking && typeof payload.booking === 'object' ? payload.booking : payload) as Record<string, unknown>;

  const userId = requireString(payload.userId || rawBooking.userId, 'userId');

  const status = requireString(rawBooking.status, 'status') as BookingStatus;
  if (!VALID_STATUSES.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid booking status.');
  }

  const difficulty = requireString(rawBooking.difficulty, 'difficulty') as LessonDifficulty;
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new HttpsError('invalid-argument', 'Invalid lesson difficulty.');
  }

  return {
    userId,
    booking: {
      id: requireString(rawBooking.id, 'id'),
      instructorId: requireString(rawBooking.instructorId, 'instructorId'),
      instructorName: requireString(rawBooking.instructorName, 'instructorName'),
      instructorAvatar: optionalString(rawBooking.instructorAvatar),
      date: requireString(rawBooking.date, 'date'),
      time: requireString(rawBooking.time, 'time'),
      durationHours: requirePositiveNumber(rawBooking.durationHours, 'durationHours'),
      status,
      difficulty,
      ...(rawBooking.notes !== undefined ? { notes: optionalString(rawBooking.notes) } : {}),
      ...(typeof rawBooking.totalPrice === 'number' ? { totalPrice: rawBooking.totalPrice } : {}),
      ...(typeof rawBooking.isGuest === 'boolean' ? { isGuest: rawBooking.isGuest } : {}),
      ...(rawBooking.guestName !== undefined ? { guestName: optionalString(rawBooking.guestName) } : {}),
      ...(rawBooking.guestPhone !== undefined ? { guestPhone: optionalString(rawBooking.guestPhone) } : {}),
      ...(rawBooking.guestEmail !== undefined ? { guestEmail: optionalString(rawBooking.guestEmail) } : {}),
      ...(rawBooking.guestNotes !== undefined ? { guestNotes: optionalString(rawBooking.guestNotes) } : {}),
    },
  };
}

function isAdminProfile(profile: Record<string, unknown> | undefined): boolean {
  return profile?.role === 'admin' || profile?.systemRole === 'owner';
}

export function addBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<AddBookingResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const callerRef = db.collection('users').doc(request.auth.uid);
    const callerSnap = await callerRef.get();
    if (!callerSnap.exists || !isAdminProfile(callerSnap.data())) {
      throw new HttpsError('permission-denied', 'Only administrators can add bookings.');
    }

    const { userId, booking } = parseAddBookingInput(request.data);

    const bookingRecord: BookingRecord = {
      id: booking.id,
      userId,
      instructorId: booking.instructorId,
      instructorName: booking.instructorName,
      instructorAvatar: booking.instructorAvatar || '',
      date: booking.date,
      time: booking.time,
      durationHours: booking.durationHours,
      status: booking.status,
      difficulty: booking.difficulty,
      totalPrice: booking.totalPrice ?? 0,
      ...(booking.notes !== undefined ? { notes: booking.notes } : {}),
      ...(booking.isGuest !== undefined ? { isGuest: booking.isGuest } : {}),
      ...(booking.guestName !== undefined ? { guestName: booking.guestName } : {}),
      ...(booking.guestPhone !== undefined ? { guestPhone: booking.guestPhone } : {}),
      ...(booking.guestEmail !== undefined ? { guestEmail: booking.guestEmail } : {}),
      ...(booking.guestNotes !== undefined ? { guestNotes: booking.guestNotes } : {}),
    };

    try {
      const result = await createBookingWithPayment(
        db,
        userId,
        bookingRecord,
        idempotencySpecFromRequest(request.data, `addBooking_${request.auth.uid}`, {
          userId,
          booking,
        })
      );
      return {
        bookingId: result.bookingId,
        totalPrice: result.totalPrice,
        newBalance: result.newBalance,
      };
    } catch (error) {
      rethrowAsHttpsError(error, 'Failed to create booking.', {
        insufficientFundsMessage: 'Insufficient funds on target user account.',
        overlapMessage: 'The requested time slot overlaps with an existing booking.',
      });
    }
  };
}
