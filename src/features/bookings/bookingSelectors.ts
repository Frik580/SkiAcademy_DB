import type { BookingsState } from './bookingsStore';
import { Booking, Instructor, Review } from '../../types';

export const selectBookings = (state: BookingsState): Booking[] => state.bookings;

export const selectBookingsLoaded = (state: BookingsState): boolean => state.bookingsLoaded;

export const selectInstructors = (state: BookingsState): Instructor[] => state.instructors;

export const selectReviews = (state: BookingsState): Review[] => state.reviews;

export const selectDeletedCompletedStats = (state: BookingsState) => state.deletedCompletedStats;
