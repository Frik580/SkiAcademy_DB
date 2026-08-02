import { ActivityLog, Booking, ChatMessage, Course, Instructor, UserProfile } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../../../lib/skillData';
import { formatBookingDayMonth } from './studentCabinetUtils';

export type InstructorMessage = ChatMessage & { bookingId: string };

export const resolveInstructorUserId = (
  instructorId: string,
  usersList: UserProfile[]
): string | undefined => usersList.find((u) => u.instructorId === instructorId)?.uid;

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
      Boolean(msg.attachmentUrl)
  );

export const getInstructorHomeworkMessages = (
  messages: InstructorMessage[],
  instructor: Instructor,
  instructorUserId?: string
) =>
  messages.filter((msg) => {
    if (!isMessageFromInstructor(msg, instructor, instructorUserId)) return false;
    if (msg.attachmentType === 'video') return false;
    if (msg.attachmentType === 'link' && msg.attachmentUrl) return true;
    if (msg.attachmentType === 'image') return true;
    return Boolean(msg.text?.trim());
  });

export type InstructorSkillComment = {
  skillId: string;
  title: string;
  comment: string;
};

export const instructorHasSkillFeedback = (
  instructorId: string,
  usersList: UserProfile[],
  activityLogs: ActivityLog[]
) => {
  const instructorUid = resolveInstructorUserId(instructorId, usersList);
  if (!instructorUid) return false;
  return activityLogs.some(
    (log) => log.type === 'skill_scores_updated' && log.actorId === instructorUid
  );
};

export const getInstructorSkillComments = (
  userProfile: UserProfile,
  skillConfig: SkillConfig | undefined,
  language: 'en' | 'ru',
  instructorId: string,
  usersList: UserProfile[],
  activityLogs: ActivityLog[]
): InstructorSkillComment[] => {
  if (!instructorHasSkillFeedback(instructorId, usersList, activityLogs)) return [];

  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const comments = userProfile.skillComments ?? {};

  return items
    .map((item) => {
      const comment = comments[item.id]?.trim();
      if (!comment) return null;
      return {
        skillId: item.id,
        title: getSkillItemTitle(item, language),
        comment,
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

export const getPreferredChatBooking = (bookings: Booking[], instructorId: string, userId?: string) => {
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

export const resolveMessageLessonDate = (
  bookingId: string,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru'
) => {
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return '';
  return formatBookingDayMonth(booking, courses, language);
};
