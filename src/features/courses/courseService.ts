import {
  db,
  deleteDoc,
  doc,
  handleFirestoreError,
  OperationType,
  setDoc,
  updateDoc,
} from '../../infrastructure/firebase/firebase';
import { enrollInCourseViaCallable } from '../../lib/enrollInCourseCallable';
import { stripUndefinedFields } from '../../domain/course/courseClone';
import { Course, Booking } from '../../types';
import { createNotificationForUser } from '../../domain/notifications/notifications';
import { buildNotification, translateKey } from '../../domain/notifications/notificationText';

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
  courseId: string,
  language: 'en' | 'ru'
): Promise<{ courseTitle: string }> {
  try {
    return await enrollInCourseViaCallable(courseId, language);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!['ALREADY_ENROLLED', 'COURSE_FULL', 'INSUFFICIENT_FUNDS'].includes(message)) {
      handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}/enroll`);
    }
    throw error;
  }
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
