import { db, deleteDoc, doc, getDoc, setDoc, updateDoc } from '../../infrastructure/firebase';
import { enrollInCourseViaCallable } from '../../features/courses/enrollInCourseCallable';
import { stripUndefinedFields } from '../../domain/course';
import { Course, Booking } from '../../types';
import { createNotificationForUser } from '../../domain/notifications';
import { buildNotification, translateKey } from '../../domain/notifications';
import { isCanonicalCourseProtectedFromLegacyAdminWrites } from '@ski-academy/shared-domain';

export class CanonicalCourseAdminWriteBlockedError extends Error {
  readonly courseId: string;

  constructor(courseId: string) {
    super(`Canonical course ${courseId} cannot be modified via legacy admin writes`);
    this.name = 'CanonicalCourseAdminWriteBlockedError';
    this.courseId = courseId;
  }
}

export async function addCourseService(course: Course): Promise<void> {
  await setDoc(
    doc(db, 'courses', course.id),
    stripUndefinedFields(course as unknown as Record<string, unknown>)
  );
}

export async function updateCourseService(course: Course): Promise<void> {
  const courseRef = doc(db, 'courses', course.id);
  const existing = await getDoc(courseRef);
  if (
    existing.exists() &&
    isCanonicalCourseProtectedFromLegacyAdminWrites(existing.data() as Record<string, unknown>)
  ) {
    throw new CanonicalCourseAdminWriteBlockedError(course.id);
  }
  await updateDoc(courseRef, course as unknown as Record<string, unknown>);
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
