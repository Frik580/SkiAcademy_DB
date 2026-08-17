import { create } from 'zustand';
import { Booking, Instructor, Review } from '../../types';

export interface DeletedCompletedStats {
  revenue: number;
  count: number;
}

/** Cached booking-domain data. Feature use-cases live in useBookingActions. */
export interface BookingsState {
  bookings: Booking[];
  bookingsLoaded: boolean;
  bookingsHasMore: boolean;
  bookingHistoryRequest: number;
  bookingHistoryLoading: boolean;
  deletedCompletedStats: DeletedCompletedStats;
  instructors: Instructor[];
  reviews: Review[];

  setBookings: (bookings: Booking[]) => void;
  setBookingsLoaded: (loaded: boolean) => void;
  setBookingsHasMore: (hasMore: boolean) => void;
  setBookingHistoryLoading: (loading: boolean) => void;
  loadMoreBookings: () => void;
  resetBookingsPagination: () => void;
  setDeletedCompletedStats: (stats: DeletedCompletedStats) => void;
  setInstructors: (instructors: Instructor[]) => void;
  setReviews: (reviews: Review[]) => void;
}

export const useBookingsStore = create<BookingsState>((set) => ({
  bookings: [],
  bookingsLoaded: false,
  bookingsHasMore: false,
  bookingHistoryRequest: 0,
  bookingHistoryLoading: false,
  deletedCompletedStats: { revenue: 0, count: 0 },
  instructors: [],
  reviews: [],

  setBookings: (bookings) => set({ bookings }),
  setBookingsLoaded: (bookingsLoaded) => set({ bookingsLoaded }),
  setBookingsHasMore: (bookingsHasMore) => set({ bookingsHasMore }),
  setBookingHistoryLoading: (bookingHistoryLoading) => set({ bookingHistoryLoading }),
  loadMoreBookings: () =>
    set((state) =>
      state.bookingHistoryLoading || !state.bookingsHasMore
        ? state
        : { bookingHistoryRequest: state.bookingHistoryRequest + 1 }
    ),
  resetBookingsPagination: () =>
    set({
      bookings: [],
      bookingsHasMore: false,
      bookingHistoryRequest: 0,
      bookingHistoryLoading: false,
    }),
  setDeletedCompletedStats: (deletedCompletedStats) => set({ deletedCompletedStats }),
  setInstructors: (instructors) => set({ instructors }),
  setReviews: (reviews) => set({ reviews }),
}));

// Backward compatibility alias
export const useBookingStore = useBookingsStore;
