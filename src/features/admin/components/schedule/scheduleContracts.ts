import type { Booking, Course, Instructor, UserProfile } from '../../../../types';

/**
 * Read-only shapes consumed by schedule presentation components.
 *
 * Keeping these projections here prevents cell components from depending on
 * the application-wide domain models and their unrelated fields.
 */
export type ScheduleBooking = Pick<
  Booking,
  | 'id'
  | 'userId'
  | 'date'
  | 'time'
  | 'durationHours'
  | 'status'
  | 'difficulty'
  | 'notes'
  | 'guestName'
  | 'isGuest'
  | 'instructorId'
  | 'isDeleted'
>;

export type ScheduleClient = Pick<UserProfile, 'uid' | 'displayName' | 'avatarUrl' | 'email'>;

export type ScheduleInstructor = Pick<
  Instructor,
  'id' | 'name' | 'avatarUrl' | 'isAvailable' | 'pricePerHour'
>;

export type ScheduleCourse = Pick<
  Course,
  'id' | 'title' | 'dates' | 'instructorIds' | 'availableSeats' | 'totalSeats'
>;
