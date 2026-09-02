import { Booking, Course, Instructor, UserProfile } from '../../types';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore, type DeletedCompletedStats } from '../bookings/bookingsStore';
import { useCoursesStore } from '../courses/coursesStore';

export const selectUsersList = (): UserProfile[] => useProfileStore.getState().usersList;

/** T32.9B leftover: historical revenue accumulator. FinancialOverview no longer uses this. */
export const selectDeletedCompletedStats = (): DeletedCompletedStats =>
  useBookingsStore.getState().deletedCompletedStats;

export const selectIsAdmin = (userProfile: UserProfile | null): boolean =>
  userProfile?.role === 'admin';

export const selectAdminBookings = (): Booking[] => useBookingsStore.getState().bookings;

export const selectAdminInstructors = (): Instructor[] => useBookingsStore.getState().instructors;

export const selectAdminCourses = (): Course[] => useCoursesStore.getState().courses;
