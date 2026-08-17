import { httpsCallable } from 'firebase/functions';
import { functions } from '../../infrastructure/firebase';

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

const createGuestCourseEnrollment = httpsCallable<
  GuestCourseEnrollmentInput,
  GuestCourseEnrollmentResult
>(functions, 'createGuestCourseEnrollment');

export async function createGuestCourseEnrollmentViaCallable(
  input: GuestCourseEnrollmentInput
): Promise<GuestCourseEnrollmentResult> {
  const { data } = await createGuestCourseEnrollment(input);
  return data;
}
