import { callFunction } from '../../lib/functions/functionsClient';

export interface GuestCourseEnrollmentInput {
  courseId: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  guestNotes?: string;
  language: 'en' | 'ru';
  idempotencyKey?: string;
}

export interface GuestCourseEnrollmentResult {
  bookingId: string;
  availableSeats: number;
}

export async function createGuestCourseEnrollmentViaCallable(
  input: GuestCourseEnrollmentInput
): Promise<GuestCourseEnrollmentResult> {
  if (!input.idempotencyKey) {
    throw new Error('Guest course enrollment requires an idempotency key.');
  }
  return callFunction<GuestCourseEnrollmentInput, GuestCourseEnrollmentResult>(
    'createGuestCourseEnrollment',
    input,
    { idempotencyKey: input.idempotencyKey }
  );
}
