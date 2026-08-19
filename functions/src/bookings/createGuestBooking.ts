import { randomUUID } from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import {
  BookingIdConflictError,
  BookingRecord,
  BookingSlotOverlapError,
  createGuestBookingRecord,
  LessonDifficulty,
} from './bookingLogic';
import { idempotencySpecFromRequest, parseIdempotencyKey } from '../idempotency';

const VALID_DIFFICULTIES: LessonDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'freeride',
  'freestyle',
];

export interface CreateGuestBookingInput {
  id?: string;
  userId?: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar?: string;
  date: string;
  time: string;
  durationHours: number;
  difficulty: LessonDifficulty;
  notes?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestNotes?: string;
}

export interface CreateGuestBookingResult {
  bookingId: string;
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

function parseCreateGuestBookingInput(data: unknown): CreateGuestBookingInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Guest booking payload is required.');
  }

  const payload = data as Record<string, unknown>;

  if (payload.status !== undefined && payload.status !== null && payload.status !== '') {
    if (payload.status !== 'pending') {
      throw new HttpsError(
        'invalid-argument',
        'Guest bookings must be created with pending status.'
      );
    }
  }

  const difficulty = requireString(payload.difficulty, 'difficulty') as LessonDifficulty;
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new HttpsError('invalid-argument', 'Invalid lesson difficulty.');
  }

  const userId = payload.userId ? requireString(payload.userId, 'userId') : undefined;
  if (userId && !userId.startsWith('guest_')) {
    throw new HttpsError('invalid-argument', 'Guest bookings must use a guest user id.');
  }

  return {
    id: payload.id ? requireString(payload.id, 'id') : undefined,
    userId,
    instructorId: requireString(payload.instructorId, 'instructorId'),
    instructorName: requireString(payload.instructorName, 'instructorName'),
    instructorAvatar: optionalString(payload.instructorAvatar),
    date: requireString(payload.date, 'date'),
    time: requireString(payload.time, 'time'),
    durationHours: requirePositiveNumber(payload.durationHours, 'durationHours'),
    difficulty,
    notes: payload.notes !== undefined ? optionalString(payload.notes) : undefined,
    guestName: payload.guestName !== undefined ? optionalString(payload.guestName) : undefined,
    guestPhone: payload.guestPhone !== undefined ? optionalString(payload.guestPhone) : undefined,
    guestEmail: payload.guestEmail !== undefined ? optionalString(payload.guestEmail) : undefined,
    guestNotes: payload.guestNotes !== undefined ? optionalString(payload.guestNotes) : undefined,
  };
}

export function createGuestBookingHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>): Promise<CreateGuestBookingResult> => {
    const input = parseCreateGuestBookingInput(request.data);
    const idempotencyKey = parseIdempotencyKey(request.data);
    const bookingId = input.id || (idempotencyKey ? `booking_guest_${idempotencyKey}` : `booking_guest_${randomUUID()}`);
    const guestUserId =
      input.userId || (idempotencyKey ? `guest_${idempotencyKey}` : `guest_${randomUUID()}`);

    const bookingRecord: BookingRecord = {
      id: bookingId,
      userId: guestUserId,
      instructorId: input.instructorId,
      instructorName: input.instructorName,
      instructorAvatar: input.instructorAvatar || '',
      date: input.date,
      time: input.time,
      durationHours: input.durationHours,
      status: 'pending',
      difficulty: input.difficulty,
      totalPrice: 0,
      isGuest: true,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.guestName !== undefined ? { guestName: input.guestName } : {}),
      ...(input.guestPhone !== undefined ? { guestPhone: input.guestPhone } : {}),
      ...(input.guestEmail !== undefined ? { guestEmail: input.guestEmail } : {}),
      ...(input.guestNotes !== undefined ? { guestNotes: input.guestNotes } : {}),
    };

    try {
      const result = await createGuestBookingRecord(
        db,
        bookingRecord,
        idempotencySpecFromRequest(request.data, 'createGuestBooking_public', {
          ...bookingRecord,
        })
      );
      return result;
    } catch (error) {
      if (error instanceof BookingSlotOverlapError) {
        throw new HttpsError(
          'aborted',
          'The requested time slot overlaps with an existing booking.'
        );
      }
      if (error instanceof BookingIdConflictError) {
        throw new HttpsError('already-exists', 'A booking with this ID already exists.');
      }
      if (error instanceof HttpsError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Failed to create guest booking.';
      throw new HttpsError('internal', message);
    }
  };
}
