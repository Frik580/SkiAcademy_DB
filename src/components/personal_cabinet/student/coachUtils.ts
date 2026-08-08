import { ActivityLog, Booking, ChatMessage, Course, Instructor, UserProfile } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../../../lib/skillData';
import { formatBookingDayMonth, getRecentLessonTitle } from './studentCabinetUtils';
import { resolveChatId } from '../../../lib/resolveChatId';
import { isHomeworkVisibleToStudent } from '../../../lib/chatHomework';
import { translateCourse } from '../../../lib/i18n/contentTranslation';

export type InstructorMessage = ChatMessage & { bookingId: string; threadId?: string };

export const resolveInstructorUserId = (
  instructorId: string,
  usersList: UserProfile[]
): string | undefined => usersList.find((u) => u.instructorId === instructorId)?.uid;

export const resolveInstructorPhone = (
  instructorId: string,
  usersList: UserProfile[],
  instructors: Instructor[] = []
): string | undefined => {
  const fromPublicProfile = instructors.find((ins) => ins.id === instructorId)?.phoneNumber?.trim();
  if (fromPublicProfile) return fromPublicProfile;

  const fromUser = usersList.find((u) => u.instructorId === instructorId)?.phoneNumber?.trim();
  return fromUser || undefined;
};

export const resolveBookingCoachPhone = (
  booking: Booking,
  courses: Course[],
  usersList: UserProfile[],
  instructors: Instructor[] = []
): string | undefined => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    for (const instructorId of course?.instructorIds ?? []) {
      const phone = resolveInstructorPhone(instructorId, usersList, instructors);
      if (phone) return phone;
    }
    return undefined;
  }
  return resolveInstructorPhone(booking.instructorId, usersList, instructors);
};

export const normalizeTelHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export const getStudentBookingsWithInstructor = (
  bookings: Booking[],
  instructorId: string,
  userId?: string
): Booking[] =>
  bookings
    .filter(
      (b) =>
        (!userId || b.userId === userId) &&
        !b.isDeleted &&
        b.instructorId === instructorId &&
        !b.instructorId.startsWith('course_') &&
        b.status !== 'cancelled'
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

export const isMessageFromInstructor = (
  message: ChatMessage,
  instructor: Instructor,
  instructorUserId?: string
) => {
  if (message.senderRole === 'instructor' && message.senderInstructorId === instructor.id) {
    return true;
  }
  if (message.senderInstructorId === instructor.id) return true;
  if (instructorUserId) return message.senderId === instructorUserId;
  return message.senderName.trim().toLowerCase() === instructor.name.trim().toLowerCase();
};

export const getInstructorVideoMessages = (
  messages: InstructorMessage[],
  instructor: Instructor,
  instructorUserId?: string
) =>
  messages.filter(
    (msg) =>
      isMessageFromInstructor(msg, instructor, instructorUserId) &&
      msg.attachmentType === 'video' &&
      Boolean(msg.attachmentUrl) &&
      !msg.isHomework
  );

export const getInstructorHomeworkMessages = (
  messages: InstructorMessage[],
  instructor: Instructor,
  instructorUserId?: string,
  studentUid?: string
) =>
  messages.filter((msg) => {
    if (!msg.isHomework) return false;
    if (!isMessageFromInstructor(msg, instructor, instructorUserId)) return false;
    return isHomeworkVisibleToStudent(msg, studentUid);
  });

export type InstructorSkillComment = {
  skillId: string;
  title: string;
  comment: string;
  score: number;
  maxPoints: number;
};

export const isSkillFeedbackLogFromInstructor = (
  log: ActivityLog,
  instructorId: string,
  usersList: UserProfile[]
): boolean => {
  if (log.type !== 'skill_scores_updated' && log.type !== 'level_up') return false;
  if (log.metadata?.instructorId === instructorId) return true;

  const instructorUid = resolveInstructorUserId(instructorId, usersList);
  if (instructorUid && log.actorId === instructorUid) return true;

  const actor = usersList.find((u) => u.uid === log.actorId);
  return actor?.instructorId === instructorId;
};

export const getInstructorEvaluatedSkillIds = (
  instructorId: string,
  usersList: UserProfile[],
  activityLogs: ActivityLog[]
): Set<string> => {
  const ids = new Set<string>();

  for (const log of activityLogs) {
    if (!isSkillFeedbackLogFromInstructor(log, instructorId, usersList)) continue;
    for (const delta of log.metadata?.skillDeltas ?? []) {
      ids.add(delta.itemId);
    }
    for (const skillId of log.metadata?.commentedSkillIds ?? []) {
      ids.add(skillId);
    }
  }

  return ids;
};

export const instructorHasSkillFeedback = (
  instructorId: string,
  usersList: UserProfile[],
  activityLogs: ActivityLog[]
) => activityLogs.some((log) => isSkillFeedbackLogFromInstructor(log, instructorId, usersList));

export const getInstructorSkillComments = (
  userProfile: UserProfile,
  skillConfig: SkillConfig | undefined,
  language: 'en' | 'ru',
  instructorId: string,
  usersList: UserProfile[],
  activityLogs: ActivityLog[]
): InstructorSkillComment[] => {
  if (!instructorHasSkillFeedback(instructorId, usersList, activityLogs)) return [];

  const evaluatedSkillIds = getInstructorEvaluatedSkillIds(instructorId, usersList, activityLogs);
  const filterByInstructorSkills = evaluatedSkillIds.size > 0;

  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const comments = userProfile.skillComments ?? {};
  const scores = userProfile.skillScores ?? {};

  return items
    .map((item) => {
      if (filterByInstructorSkills && !evaluatedSkillIds.has(item.id)) return null;
      const comment = comments[item.id]?.trim();
      if (!comment) return null;
      const score = scores[item.id] ?? 0;
      return {
        skillId: item.id,
        title: getSkillItemTitle(item, language),
        comment,
        score: Math.min(item.maxPoints, Math.max(0, score)),
        maxPoints: item.maxPoints,
      };
    })
    .filter((row): row is InstructorSkillComment => row != null);
};

export type InstructorRecommendationRow = {
  booking: Booking;
  recommendationId: string;
  text: string;
  done: boolean;
  dateLabel: string;
};

export const getInstructorRecommendations = (
  bookings: Booking[],
  courses: Course[],
  instructorId: string,
  userId: string | undefined,
  language: 'en' | 'ru'
): InstructorRecommendationRow[] => {
  const rows: InstructorRecommendationRow[] = [];

  getStudentBookingsWithInstructor(bookings, instructorId, userId).forEach((booking) => {
    const completed = new Set(booking.completedRecommendationIds ?? []);
    const dateLabel = formatBookingDayMonth(booking, courses, language);
    (booking.recommendations ?? []).forEach((rec) => {
      rows.push({
        booking,
        recommendationId: rec.id,
        text: rec.text,
        done: completed.has(rec.id),
        dateLabel,
      });
    });
  });

  return rows.sort((a, b) => b.booking.date.localeCompare(a.booking.date));
};

export const getInstructorLessonCount = (
  bookings: Booking[],
  instructorId: string,
  userId?: string
) =>
  getStudentBookingsWithInstructor(bookings, instructorId, userId).filter(
    (b) => b.status === 'completed'
  ).length;

/** Firestore thread ids for chat messages with a given instructor (lessons + course enrollments). */
export const getInstructorMessageThreadIds = (
  bookings: Booking[],
  courses: Course[],
  instructorId: string,
  userId?: string
): string[] => {
  const ids = new Set<string>();

  getStudentBookingsWithInstructor(bookings, instructorId, userId).forEach((b) => ids.add(b.id));

  bookings.forEach((b) => {
    if (userId && b.userId !== userId) return;
    if (b.isDeleted || b.status === 'cancelled') return;
    if (!b.instructorId.startsWith('course_')) return;

    const courseId = b.instructorId.replace('course_', '');
    const course = courses.find((c) => c.id === courseId);
    if (!course?.instructorIds?.includes(instructorId)) return;

    ids.add(resolveChatId(b));
    ids.add(b.id);
  });

  return [...ids];
};

export const getInstructorLastLessonDate = (
  bookings: Booking[],
  courses: Course[],
  instructorId: string,
  userId: string | undefined,
  language: 'en' | 'ru'
) => {
  const latest = getStudentBookingsWithInstructor(bookings, instructorId, userId).find(
    (b) => b.status === 'completed'
  );
  if (!latest) return null;
  return formatBookingDayMonth(latest, courses, language);
};

export const getPreferredChatBooking = (
  bookings: Booking[],
  instructorId: string,
  userId?: string
) => {
  const list = getStudentBookingsWithInstructor(bookings, instructorId, userId);
  const active = list.find((b) => b.status === 'confirmed' || b.status === 'pending');
  return active ?? list[0] ?? null;
};

export const formatMessageTimestamp = (timestamp: string, language: 'en' | 'ru') => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const findBookingForMessage = (
  bookingId: string,
  bookings: Booking[],
  userId?: string
): Booking | undefined => {
  const direct = bookings.find((b) => b.id === bookingId);
  if (direct) return direct;

  if (!userId) return undefined;

  return bookings.find(
    (b) =>
      b.userId === userId &&
      !b.isDeleted &&
      b.status !== 'cancelled' &&
      (b.id === bookingId || resolveChatId(b) === bookingId)
  );
};

export const resolveMessageLessonDate = (
  bookingId: string,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  userId?: string
) => {
  const booking = findBookingForMessage(bookingId, bookings, userId);
  if (booking) return formatBookingDayMonth(booking, courses, language);
  return '';
};

/** Course title when homework message belongs to a group course thread. */
export const resolveMessageCourseTitle = (
  bookingId: string,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  userId?: string
): string | null => {
  const booking = findBookingForMessage(bookingId, bookings, userId);
  if (booking?.instructorId.startsWith('course_')) {
    return getRecentLessonTitle(booking, courses, language);
  }

  const course = courses.find((c) => c.id === bookingId);
  if (course) return translateCourse(course, language).title;

  return null;
};
