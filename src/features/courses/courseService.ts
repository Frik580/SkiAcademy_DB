import { db, deleteDoc, doc, setDoc, updateDoc, writeBatch } from '../../lib/firebase';
import { enrollInCourse, isActiveCourseEnrollment } from '../../lib/courseTransactions';
import { stripUndefinedFields } from '../../lib/courseClone';
import { Course, Booking } from '../../types';
import { logger } from '../../lib/logger';
import { createNotificationForUser } from '../../lib/notifications';
import { buildNotification, translateKey } from '../../lib/notificationText';

export async function addCourseService(course: Course): Promise<void> {
  await setDoc(
    doc(db, 'courses', course.id),
    stripUndefinedFields(course as unknown as Record<string, unknown>)
  );
}

export async function updateCourseService(course: Course): Promise<void> {
  await updateDoc(doc(db, 'courses', course.id), course as unknown as Record<string, unknown>);
}

export async function deleteCourseService(courseId: string): Promise<void> {
  await deleteDoc(doc(db, 'courses', courseId));
}

export async function enrollInCourseService(
  userId: string,
  courseId: string,
  language: 'en' | 'ru'
): Promise<{ courseTitle: string }> {
  return enrollInCourse(db, userId, courseId, language);
}

export async function notifyCourseModifiedService(
  course: Course,
  oldCourse: Course | undefined,
  courseBookings: Booking[]
): Promise<void> {
  const buildCourseModifiedMessage = (lang: 'en' | 'ru') => {
    let changeDetails = '';
    if (oldCourse?.title !== course.title) {
      changeDetails += `${translateKey('courseModifiedTitleLine', lang)} "${course.title}".\n`;
    }
    if (oldCourse?.dates !== course.dates) {
      changeDetails += `${translateKey('courseModifiedDatesLine', lang)} ${course.dates}.\n`;
    }
    return `${translateKey('courseModifiedHeader', lang)} "${course.title}":\n${changeDetails || translateKey('courseModifiedDefault', lang)}`;
  };

  for (const booking of courseBookings) {
    await createNotificationForUser(
      booking.userId,
      buildNotification('courseModified', buildCourseModifiedMessage),
      'warning'
    );
  }
}

export async function syncCourseSeatsService(
  courses: Course[],
  bookings: Booking[]
): Promise<number> {
  if (courses.length === 0) return 0;

  const batch = writeBatch(db);
  let pendingWrites = 0;

  for (const course of courses) {
    const activeBookingsCount = bookings.filter(
      (booking) =>
        booking.instructorId === `course_${course.id}` && isActiveCourseEnrollment(booking)
    ).length;
    const availableSeats = Math.max(0, course.totalSeats - activeBookingsCount);
    if (course.availableSeats === availableSeats) continue;

    batch.update(doc(db, 'courses', course.id), { availableSeats });
    pendingWrites++;
  }

  if (pendingWrites === 0) return 0;

  try {
    await batch.commit();
    return pendingWrites;
  } catch (error) {
    logger.error(`Failed to auto-sync seats for ${pendingWrites} course(s):`, error);
    throw error;
  }
}
