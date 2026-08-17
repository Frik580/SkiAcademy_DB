import { create } from 'zustand';
import { Booking, Instructor, Review } from '../../types';
import { QUERY_LIMITS } from '../../shared/queryLimits';

export interface DeletedCompletedStats {
  revenue: number;
  count: number;
}

/** Cached booking-domain data. Feature use-cases live in useBookingActions. */
export interface BookingsState {
  bookings: Booking[];
  bookingsLoaded: boolean;
  bookingsHasMore: boolean;
  bookingsPageSize: number;
  deletedCompletedStats: DeletedCompletedStats;
  instructors: Instructor[];
  reviews: Review[];

  setBookings: (bookings: Booking[]) => void;
  setBookingsLoaded: (loaded: boolean) => void;
  setBookingsHasMore: (hasMore: boolean) => void;
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
  bookingsPageSize: QUERY_LIMITS.bookings,
  deletedCompletedStats: { revenue: 0, count: 0 },
  instructors: [],
  reviews: [],

  setBookings: (bookings) => set({ bookings }),
  setBookingsLoaded: (bookingsLoaded) => set({ bookingsLoaded }),
  setBookingsHasMore: (bookingsHasMore) => set({ bookingsHasMore }),
  loadMoreBookings: () =>
    set((state) => ({
      bookingsPageSize: state.bookingsPageSize + QUERY_LIMITS.bookingsPageIncrement,
      bookingsHasMore: false,
    })),
  resetBookingsPagination: () =>
    set({ bookingsPageSize: QUERY_LIMITS.bookings, bookingsHasMore: false }),
  setDeletedCompletedStats: (deletedCompletedStats) => set({ deletedCompletedStats }),
  setInstructors: (instructors) => set({ instructors }),
  setReviews: (reviews) => set({ reviews }),
}));

// Backward compatibility alias
export const useBookingStore = useBookingsStore;
