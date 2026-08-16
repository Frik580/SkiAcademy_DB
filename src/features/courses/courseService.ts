import { db, deleteDoc, doc, setDoc, updateDoc } from '../../lib/firebase';
import { enrollInCourseViaCallable } from '../../lib/enrollInCourseCallable';
import { stripUndefinedFields } from '../../lib/courseClone';
import { Course, Booking } from '../../types';
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
  courseId: string,
  language: 'en' | 'ru'
): Promise<{ courseTitle: string }> {
  return enrollInCourseViaCallable(courseId, language);
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
