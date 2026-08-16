import { doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore';
import {
  getGroupCourseEnrollmentNote,
  getGroupCourseLabel,
  getGroupScheduleLabel,
  parseDurationHours,
  splitCourseDates,
  translateCourse,
  type Language,
} from './LanguageContext';
import { withBookingCreatedAt } from './bookingCreatedAt';
import { isCourseBooking } from './availabilitySlots';
import { recordWalletLedgerEntryInTransaction, walletLedgerBookingEntryId } from './walletLedger';
import { Booking, Course, UserProfile } from '../types';

export class CourseEnrollmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseEnrollmentError';
  }
}

export const isActiveCourseEnrollment = (
  booking: Pick<Booking, 'instructorId' | 'status' | 'isDeleted'>
): boolean =>
  isCourseBooking(booking) &&
  !booking.isDeleted &&
  (booking.status === 'pending' ||
    booking.status === 'confirmed' ||
    booking.status === 'pending_cancellation');

export const resolveCourseIdFromBooking = (
  booking: Pick<Booking, 'courseId' | 'instructorId'>
): string | null => {
  if (booking.courseId) return booking.courseId;
  if (!isCourseBooking(booking)) return null;
  return booking.instructorId.slice('course_'.length);
};

export async function releaseCourseSeatInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  booking: Pick<Booking, 'courseId' | 'instructorId'>
): Promise<void> {
  const courseId = resolveCourseIdFromBooking(booking);
  if (!courseId) return;

  const courseRef = doc(firestore, 'courses', courseId);
  const courseSnap = await transaction.get(courseRef);
  if (!courseSnap.exists()) return;

  const courseData = courseSnap.data() as Course;
  if (courseData.availableSeats < courseData.totalSeats) {
    transaction.update(courseRef, { availableSeats: courseData.availableSeats + 1 });
  }
}

/**
 * Reserves a course seat in the same transaction that creates the booking.
 * This is the write-side invariant; listeners must never repair seat counts.
 */
export async function reserveCourseSeatInTransaction(
  transaction: Transaction,
  firestore: Firestore,
  booking: Pick<Booking, 'courseId' | 'instructorId' | 'status' | 'isDeleted'>
): Promise<void> {
  if (!isActiveCourseEnrollment(booking)) return;

  const courseId = resolveCourseIdFromBooking(booking);
  if (!courseId) return;

  const courseRef = doc(firestore, 'courses', courseId);
  const courseSnap = await transaction.get(courseRef);
  if (!courseSnap.exists()) throw new CourseEnrollmentError('Course does not exist.');

  const courseData = courseSnap.data() as Course;
  if (courseData.availableSeats <= 0) throw new CourseEnrollmentError('COURSE_FULL');

  transaction.update(courseRef, { availableSeats: courseData.availableSeats - 1 });
}

export async function enrollInCourse(
  firestore: Firestore,
  userId: string,
  courseId: string,
  language: Language
): Promise<{ newBalance: number; bookingId: string; courseTitle: string }> {
  const courseDocRef = doc(firestore, 'courses', courseId);
  const userDocRef = doc(firestore, 'users', userId);
  const bookingId = `booking_course_${userId}_${courseId}`;
  const bookingDocRef = doc(firestore, 'bookings', bookingId);

  return runTransaction(firestore, async (transaction) => {
    const courseSnap = await transaction.get(courseDocRef);
    const userSnap = await transaction.get(userDocRef);
    const bookingSnap = await transaction.get(bookingDocRef);

    if (!courseSnap.exists()) throw new CourseEnrollmentError('Course does not exist.');
    if (!userSnap.exists()) throw new CourseEnrollmentError('User profile does not exist.');

    const courseData = courseSnap.data() as Course;
    const userData = userSnap.data() as UserProfile;
    const localizedCourse = translateCourse(courseData, language);

    const userBalance = userData.balanceUSD ?? 0;

    if (bookingSnap.exists()) {
      const bookingData = bookingSnap.data();
      if (bookingData.status !== 'cancelled' && !bookingData.isDeleted) {
        throw new CourseEnrollmentError('ALREADY_ENROLLED');
      }
    }
    if (courseData.availableSeats <= 0) throw new CourseEnrollmentError('COURSE_FULL');
    if (userBalance < courseData.price) throw new CourseEnrollmentError('INSUFFICIENT_FUNDS');

    const { datePart, timePart } = splitCourseDates(courseData.dates, language);
    const newBooking: Booking = {
      id: bookingId,
      userId: userData.uid,
      courseId,
      instructorId: `course_${courseId}`,
      instructorName: getGroupCourseLabel(localizedCourse.title, language),
      instructorAvatar: courseData.bgImageUrl ?? '',
      date: datePart || courseData.dates,
      time: timePart || getGroupScheduleLabel(language),
      durationHours: parseDurationHours(courseData.duration, 10),
      totalPrice: courseData.price,
      status: 'confirmed',
      difficulty: 'intermediate',
      notes: getGroupCourseEnrollmentNote(localizedCourse.description, language),
    };
    const bookingToWrite = withBookingCreatedAt(newBooking);

    const newBalance = userBalance - courseData.price;

    transaction.update(userDocRef, { balanceUSD: newBalance });
    transaction.set(bookingDocRef, bookingToWrite);
    transaction.update(courseDocRef, { availableSeats: courseData.availableSeats - 1 });
    recordWalletLedgerEntryInTransaction(transaction, firestore, {
      userId,
      amount: -courseData.price,
      balanceAfter: newBalance,
      type: 'course_payment',
      subjectName: localizedCourse.title,
      bookingId,
      courseId,
      entryId: walletLedgerBookingEntryId('course_payment', bookingToWrite),
    });

    return { newBalance, bookingId, courseTitle: localizedCourse.title };
  });
}
