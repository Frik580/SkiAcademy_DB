import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';
import {
  BookingRecord,
  BookingIdConflictError,
  BookingSlotOverlapError,
  BookingStatus,
  createBookingWithPayment,
  InsufficientFundsError,
  LessonDifficulty,
} from './bookingLogic';

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

export interface CreateBookingInput {
  id: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  status: BookingStatus;
  difficulty: LessonDifficulty;
  notes?: string;
  totalPrice?: number;
}

export interface CreateBookingResult {
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

function parseCreateBookingInput(data: unknown): CreateBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Booking payload is required.');
  }

  const payload = data as Record<string, unknown>;

  const status = requireString(payload.status, 'status') as BookingStatus;
  if (!VALID_STATUSES.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid booking status.');
  }

  const difficulty = requireString(payload.difficulty, 'difficulty') as LessonDifficulty;
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new HttpsError('invalid-argument', 'Invalid lesson difficulty.');
  }

  const input: CreateBookingInput = {
    id: requireString(payload.id, 'id'),
    instructorId: requireString(payload.instructorId, 'instructorId'),
    instructorName: requireString(payload.instructorName, 'instructorName'),
    instructorAvatar: optionalString(payload.instructorAvatar),
    date: requireString(payload.date, 'date'),
    time: requireString(payload.time, 'time'),
    durationHours: requirePositiveNumber(payload.durationHours, 'durationHours'),
    status,
    difficulty,
  };

  if (payload.notes !== undefined) {
    if (typeof payload.notes !== 'string') {
      throw new HttpsError('invalid-argument', 'notes must be a string.');
    }
    input.notes = payload.notes;
  }

  if (input.instructorId.startsWith('course_')) {
    throw new HttpsError(
      'invalid-argument',
      'Course enrollments must use the enrollInCourse function.'
    );
  }

  return input;
}

async function handleCreateBooking(
  db: Firestore,
  request: CallableRequest<unknown>
): Promise<CreateBookingResult> {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const input = parseCreateBookingInput(request.data);
  const userId = request.auth.uid;

  const booking: BookingRecord = {
    ...input,
    userId,
    totalPrice: 0,
  };

  try {
    return await createBookingWithPayment(db, userId, booking);
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new HttpsError('failed-precondition', 'Insufficient funds.');
    }
    if (error instanceof BookingSlotOverlapError) {
      throw new HttpsError('aborted', 'Instructor slot is no longer available.');
    }
    if (error instanceof BookingIdConflictError) {
      throw new HttpsError('already-exists', error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.message === 'Instructor does not exist.') {
        throw new HttpsError('not-found', error.message);
      }
      if (error.message === 'User profile does not exist.') {
        throw new HttpsError('not-found', error.message);
      }
      if (error.message.includes('Invalid') || error.message.includes('does not exist')) {
        throw new HttpsError('invalid-argument', error.message);
      }
    }
    console.error('createBooking failed:', error);
    const message =
      error instanceof Error ? error.message : 'Booking creation failed unexpectedly.';
    throw new HttpsError('internal', message);
  }
}

export function createCreateBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<CreateBookingResult> =>
    handleCreateBooking(db, request);
}
