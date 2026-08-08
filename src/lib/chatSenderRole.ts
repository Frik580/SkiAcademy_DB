import type { ChatMessage, Course, Instructor, UserProfile } from '../types';
import type { Language } from './i18n/translations';
import { translateInstructor } from './i18n/contentTranslation';
import { isCourseGroupBooking, type CourseChatBooking } from './resolveChatId';

export type ChatSenderRole = 'client' | 'instructor' | 'admin';

export function resolveProfileSenderRole(profile: UserProfile): ChatSenderRole {
  if (profile.role === 'admin') return 'admin';
  if (profile.isInstructor || profile.instructorId) return 'instructor';
  return 'client';
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function namesMatch(senderName: string, instructorName: string): boolean {
  const a = normalizeName(senderName);
  const b = normalizeName(instructorName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  const aInB = aTokens.every((token) => b.includes(token));
  const bInA = bTokens.every((token) => a.includes(token));
  return aInB || bInA;
}

function getCourseInstructorIds(booking: CourseChatBooking, courses?: Course[]): string[] {
  if (booking.courseId) {
    return courses?.find((c) => c.id === booking.courseId)?.instructorIds ?? [];
  }
  if (booking.instructorId?.startsWith('course_')) {
    const courseId = booking.instructorId.replace('course_', '');
    return courses?.find((c) => c.id === courseId)?.instructorIds ?? [];
  }
  return [];
}

function getLessonInstructorId(booking: CourseChatBooking): string | undefined {
  if (!booking.instructorId || booking.instructorId.startsWith('course_')) return undefined;
  return booking.instructorId;
}

function matchesInstructorProfiles(
  senderName: string,
  instructorProfiles: Instructor[],
  language: Language
): boolean {
  return instructorProfiles.some((ins) => {
    const translated = translateInstructor(ins, language);
    return namesMatch(senderName, ins.name) || namesMatch(senderName, translated.name);
  });
}

export function resolveChatSenderRole(
  msg: ChatMessage & { senderRole?: ChatSenderRole; senderInstructorId?: string },
  booking: CourseChatBooking,
  usersList: UserProfile[],
  instructors: Instructor[],
  courses?: Course[],
  language: Language = 'en'
): ChatSenderRole {
  if (msg.senderRole) return msg.senderRole;

  if (msg.senderInstructorId) return 'instructor';

  const senderUser = usersList.find((u) => u.uid === msg.senderId);

  if (
    msg.senderId === 'admin' ||
    msg.senderId.includes('admin') ||
    normalizeName(msg.senderName).includes('admin') ||
    senderUser?.role === 'admin'
  ) {
    return 'admin';
  }

  if (senderUser?.isInstructor || senderUser?.instructorId) return 'instructor';

  const courseInstructorIds = getCourseInstructorIds(booking, courses);
  if (senderUser?.instructorId && courseInstructorIds.includes(senderUser.instructorId)) {
    return 'instructor';
  }

  const lessonInstructorId = getLessonInstructorId(booking);
  if (
    senderUser?.instructorId &&
    lessonInstructorId &&
    senderUser.instructorId === lessonInstructorId
  ) {
    return 'instructor';
  }

  const relatedInstructorIds = isCourseGroupBooking(booking)
    ? courseInstructorIds
    : lessonInstructorId
      ? [lessonInstructorId]
      : [];

  const relatedInstructors = instructors.filter((ins) => relatedInstructorIds.includes(ins.id));
  if (matchesInstructorProfiles(msg.senderName, relatedInstructors, language)) {
    return 'instructor';
  }

  // Individual lessons only include the student and assigned instructor.
  if (lessonInstructorId && msg.senderId !== booking.userId) {
    return 'instructor';
  }

  return 'client';
}
