import type { Booking } from '../../types';

/** Minimal booking shape for chat thread resolution (individual lessons and course groups). */
export type CourseChatBooking = {
  id: string;
  instructorId: string;
  status?: Booking['status'];
  userId?: string;
  chatId?: string;
  participantBookingIds?: string[];
  isCourse?: boolean;
  courseId?: string;
};

export function isCourseGroupBooking(booking: CourseChatBooking): boolean {
  if (booking.isCourse) return true;
  if (booking.courseId) return true;
  if (booking.instructorId?.startsWith('course_')) return true;
  if (booking.chatId && booking.id === booking.chatId) return true;
  return false;
}

/** Shared group thread for course enrollments uses courseId; 1-on-1 lessons use booking.id. */
export function resolveChatId(booking: CourseChatBooking): string {
  if (booking.chatId) return booking.chatId;
  if (booking.courseId) return booking.courseId;
  if (booking.instructorId?.startsWith('course_')) {
    return booking.instructorId.replace('course_', '');
  }
  if (booking.isCourse && booking.id) return booking.id;
  return booking.id;
}

/** All Firestore thread ids to subscribe for a course group chat (shared + per-enrollment legacy). */
export function getCourseChatThreadIds(booking: CourseChatBooking): string[] {
  if (!isCourseGroupBooking(booking)) {
    return [resolveChatId(booking)];
  }

  const primary = resolveChatId(booking);
  const threads = new Set<string>([primary]);

  if (booking.id !== primary) {
    threads.add(booking.id);
  }

  for (const id of booking.participantBookingIds ?? []) {
    if (id && id !== primary) {
      threads.add(id);
    }
  }

  return [...threads];
}
