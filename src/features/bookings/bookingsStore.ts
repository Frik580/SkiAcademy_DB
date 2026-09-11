import { create } from 'zustand';
import { Booking, Instructor, Review } from '../../types';
import type {
  AccountReviewBookingState,
  InstructorRatingSummaryReadModel,
  InstructorReviewReadModel,
} from '@ski-academy/shared-domain';

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
  reviewBookingStates: AccountReviewBookingState[];
  reviewSyncRequest: number;
  ratingSummaries: Record<string, InstructorRatingSummaryReadModel>;

  setBookings: (bookings: Booking[]) => void;
  setBookingsLoaded: (loaded: boolean) => void;
  setBookingsHasMore: (hasMore: boolean) => void;
  setBookingHistoryLoading: (loading: boolean) => void;
  loadMoreBookings: () => void;
  resetBookingsPagination: () => void;
  setDeletedCompletedStats: (stats: DeletedCompletedStats) => void;
  setInstructors: (instructors: Instructor[]) => void;
  setReviews: (reviews: Review[]) => void;
  setCanonicalReviewData: (data: {
    reviews: InstructorReviewReadModel[];
    summaries: InstructorRatingSummaryReadModel[];
    bookingStates: AccountReviewBookingState[];
  }) => void;
  requestReviewRefresh: () => void;
}

function applyCanonicalRatings(
  instructors: Instructor[],
  summaries: Record<string, InstructorRatingSummaryReadModel>
): Instructor[] {
  return instructors.map((instructor) => {
    const summary = summaries[instructor.id];
    return {
      ...instructor,
      rating: summary?.rating ?? null,
      reviewsCount: summary?.reviewsCount ?? 0,
      ratingCounts: summary?.ratingCounts ?? [0, 0, 0, 0, 0],
    };
  });
}

function toLegacyReview(review: InstructorReviewReadModel): Review {
  return {
    id: review.reviewId,
    instructorId: review.instructorId,
    userId: review.managingAccountId ?? '',
    userName: review.authorDisplayName,
    userAvatar: review.authorAvatarUrl ?? '',
    rating: review.rating,
    ...(review.comment ? { comment: review.comment } : {}),
    date: new Date(review.createdAt.seconds * 1_000).toISOString().slice(0, 10),
    bookingId: review.bookingId,
  };
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
  reviewBookingStates: [],
  reviewSyncRequest: 0,
  ratingSummaries: {},

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
  setInstructors: (instructors) =>
    set((state) => ({
      instructors: applyCanonicalRatings(instructors, state.ratingSummaries),
      reviewSyncRequest: state.reviewSyncRequest + 1,
    })),
  setReviews: (reviews) => set({ reviews }),
  setCanonicalReviewData: ({ reviews, summaries, bookingStates }) =>
    set((state) => {
      const ratingSummaries = Object.fromEntries(
        summaries.map((summary) => [summary.instructorId, summary])
      );
      return {
        reviews: reviews.map(toLegacyReview),
        reviewBookingStates: bookingStates,
        ratingSummaries,
        instructors: applyCanonicalRatings(state.instructors, ratingSummaries),
      };
    }),
  requestReviewRefresh: () => set((state) => ({ reviewSyncRequest: state.reviewSyncRequest + 1 })),
}));

// Backward compatibility alias
export const useBookingStore = useBookingsStore;
