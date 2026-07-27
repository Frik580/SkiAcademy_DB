import { Booking, LessonRecommendation } from '../types';

export const createRecommendationId = () =>
  `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const isActiveBookingForRecommendations = (b: Booking) =>
  !b.isDeleted && b.status !== 'cancelled' && !b.userId?.startsWith('system_block_');

export const canInstructorEditRecommendations = (status: Booking['status']) =>
  status === 'pending' ||
  status === 'confirmed' ||
  status === 'completed' ||
  status === 'pending_cancellation';

export interface RecommendationTask {
  id: string;
  label: string;
  done: boolean;
  bookingId: string;
  recommendationId: string;
}

export const getRecommendationTasks = (bookings: Booking[]): RecommendationTask[] => {
  const tasks: RecommendationTask[] = [];

  bookings
    .filter(isActiveBookingForRecommendations)
    .filter((b) => (b.recommendations?.length ?? 0) > 0)
    .forEach((booking) => {
      const completed = new Set(booking.completedRecommendationIds ?? []);
      (booking.recommendations ?? []).forEach((rec) => {
        tasks.push({
          id: `${booking.id}_${rec.id}`,
          label: rec.text,
          done: completed.has(rec.id),
          bookingId: booking.id,
          recommendationId: rec.id,
        });
      });
    });

  return tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return 0;
  });
};

export const toggleCompletedRecommendationIds = (
  current: string[] | undefined,
  itemId: string,
  checked: boolean
): string[] => {
  const set = new Set(current ?? []);
  if (checked) set.add(itemId);
  else set.delete(itemId);
  return Array.from(set);
};

export const sanitizeRecommendations = (items: LessonRecommendation[]): LessonRecommendation[] =>
  items
    .map((item) => ({ id: item.id, text: item.text.trim() }))
    .filter((item) => item.text.length > 0);

export const hasBookingRecommendations = (booking?: Booking | null) =>
  (booking?.recommendations?.length ?? 0) > 0;

export const hasPendingRecommendations = (booking?: Booking | null) => {
  if (!hasBookingRecommendations(booking)) return false;
  const completed = new Set(booking!.completedRecommendationIds ?? []);
  return (booking!.recommendations ?? []).some((rec) => !completed.has(rec.id));
};

export const getCourseEnrollmentBooking = (
  bookings: Booking[],
  userId: string | undefined,
  courseId: string
) =>
  bookings.find(
    (b) =>
      b.userId === userId &&
      b.instructorId === `course_${courseId}` &&
      b.status !== 'cancelled' &&
      !b.isDeleted
  );
