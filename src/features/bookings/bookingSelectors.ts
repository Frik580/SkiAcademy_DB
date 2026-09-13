import type { BookingsState } from './bookingsStore';
import { Booking, Instructor } from '../../types';

export const selectBookings = (state: BookingsState): Booking[] => state.bookings;

export const selectBookingsLoaded = (state: BookingsState): boolean => state.bookingsLoaded;

export const selectInstructors = (state: BookingsState): Instructor[] => state.instructors;
