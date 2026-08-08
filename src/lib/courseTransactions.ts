import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import {
  getGroupCourseEnrollmentNote,
  getGroupCourseLabel,
  getGroupScheduleLabel,
  parseDurationHours,
  splitCourseDates,
  translateCourse,
  type Language,
} from './LanguageContext';
import { Booking, Course, UserProfile } from '../types';

export class CourseEnrollmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseEnrollmentError';
  }
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

    const newBalance = userBalance - courseData.price;

    transaction.update(userDocRef, { balanceUSD: newBalance });
    transaction.set(bookingDocRef, newBooking);
    transaction.update(courseDocRef, { availableSeats: courseData.availableSeats - 1 });

    return { newBalance, bookingId, courseTitle: localizedCourse.title };
  });
}
