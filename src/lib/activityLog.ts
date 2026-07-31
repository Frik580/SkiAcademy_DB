import { ActivityLogMetadata, ActivityLogType, Booking, Course } from '../types';
import { db, doc, setDoc } from './firebase';
import { logger } from './logger';

export const ACTIVITY_LOGS_COLLECTION = 'activity_logs';

export const activityLogId = {
  bookingCompleted: (bookingId: string) => `act_booking_${bookingId}_completed`,
  reviewCreated: (reviewId: string) => `act_review_${reviewId}`,
  levelUp: (userId: string, newLevel: number) => `act_level_${userId}_${newLevel}`,
  recommendationCompleted: (bookingId: string, recommendationId: string) =>
    `act_rec_${bookingId}_${recommendationId}`,
  recommendationsAllCompleted: (bookingId: string) => `act_rec_all_${bookingId}`,
  achievementEarned: (userId: string, achievementId: string) =>
    `act_ach_${userId}_${achievementId}`,
};

export const buildBookingCompletedMetadata = (
  booking: Booking,
  courses: Course[]
): ActivityLogMetadata => {
  const isCourse = booking.instructorId.startsWith('course_');
  let lessonTitle = booking.instructorName;

  if (isCourse) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((item) => item.id === courseId);
    if (course) {
      lessonTitle = course.titleRu?.trim() || course.title;
    }
  }

  return {
    bookingId: booking.id,
    instructorId: booking.instructorId,
    instructorName: booking.instructorName,
    lessonTitle,
    difficulty: booking.difficulty,
    durationHours: booking.durationHours,
  };
};

export const logActivityForUser = async (
  userId: string,
  actorId: string,
  type: ActivityLogType,
  metadata?: ActivityLogMetadata,
  logId?: string,
  timestamp?: string
): Promise<void> => {
  if (userId.startsWith('system_block_')) return;

  const id = logId ?? `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const entry = {
    userId,
    actorId,
    type,
    timestamp: timestamp ?? new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };

  try {
    await setDoc(doc(db, ACTIVITY_LOGS_COLLECTION, id), entry);
  } catch (error) {
    logger.error('Failed to create activity log:', error);
  }
};
