import { create } from 'zustand';
import { Booking, Instructor, Review } from '../../types';
import type {
  AccountReviewBookingState,
  InstructorRatingSummaryReadModel,
  InstructorReviewReadModel,
} from '@ski-academy/shared-domain';

/** Cached booking-domain data. Feature use-cases live in useBookingActions. */
export interface BookingsState {
  bookings: Booking[];
  bookingsLoaded: boolean;
  bookingsHasMore: boolean;
  bookingHistoryRequest: number;
  bookingHistoryLoading: boolean;
  instructors: Instructor[];
  reviews: Review[];
  reviewBookingStates: AccountReviewBookingState[];
  reviewSyncRequest: number;
  ratingSummaries: Record<string, InstructorRatingSummaryReadModel>;
  reviewPaginationByInstructor: Record<
    string,
    { hasMore: boolean; nextCursor?: string; loadingMore: boolean }
  >;

  setBookings: (bookings: Booking[]) => void;
  setBookingsLoaded: (loaded: boolean) => void;
  setBookingsHasMore: (hasMore: boolean) => void;
  setBookingHistoryLoading: (loading: boolean) => void;
  loadMoreBookings: () => void;
  resetBookingsPagination: () => void;
  setInstructors: (instructors: Instructor[]) => void;
  setCanonicalReviewData: (data: {
    reviews: InstructorReviewReadModel[];
    summaries: InstructorRatingSummaryReadModel[];
    bookingStates: AccountReviewBookingState[];
    reviewPages?: readonly {
      instructorId: string;
      hasMore: boolean;
      nextCursor?: string;
    }[];
  }) => void;
  appendCanonicalInstructorReviewPage: (data: {
    instructorId: string;
    reviews: InstructorReviewReadModel[];
    summary: InstructorRatingSummaryReadModel;
    hasMore: boolean;
    nextCursor?: string;
  }) => void;
  setInstructorReviewPageLoading: (instructorId: string, loadingMore: boolean) => void;
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

function toReviewPresentation(review: InstructorReviewReadModel): Review {
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
  instructors: [],
  reviews: [],
  reviewBookingStates: [],
  reviewSyncRequest: 0,
  ratingSummaries: {},
  reviewPaginationByInstructor: {},

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
  setInstructors: (instructors) =>
    set((state) => ({
      instructors: applyCanonicalRatings(instructors, state.ratingSummaries),
      reviewSyncRequest: state.reviewSyncRequest + 1,
    })),
  setCanonicalReviewData: ({ reviews, summaries, bookingStates, reviewPages = [] }) =>
    set((state) => {
      const ratingSummaries = Object.fromEntries(
        summaries.map((summary) => [summary.instructorId, summary])
      );
      return {
        reviews: reviews.map(toReviewPresentation),
        reviewBookingStates: bookingStates,
        ratingSummaries,
        instructors: applyCanonicalRatings(state.instructors, ratingSummaries),
        reviewPaginationByInstructor: reviewPages.reduce(
          (pagination, page) => ({
            ...pagination,
            [page.instructorId]: {
              hasMore: page.hasMore,
              ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
              loadingMore: false,
            },
          }),
          state.reviewPaginationByInstructor
        ),
      };
    }),
  appendCanonicalInstructorReviewPage: ({ instructorId, reviews, summary, hasMore, nextCursor }) =>
    set((state) => {
      const ratingSummaries = { ...state.ratingSummaries, [instructorId]: summary };
      const nextReviews = [
        ...new Map(
          [...state.reviews, ...reviews.map(toReviewPresentation)].map((review) => [
            review.id,
            review,
          ])
        ).values(),
      ];
      return {
        reviews: nextReviews,
        ratingSummaries,
        instructors: applyCanonicalRatings(state.instructors, ratingSummaries),
        reviewPaginationByInstructor: {
          ...state.reviewPaginationByInstructor,
          [instructorId]: {
            hasMore,
            ...(nextCursor ? { nextCursor } : {}),
            loadingMore: false,
          },
        },
      };
    }),
  setInstructorReviewPageLoading: (instructorId, loadingMore) =>
    set((state) => {
      const current = state.reviewPaginationByInstructor[instructorId];
      if (!current) return state;
      return {
        reviewPaginationByInstructor: {
          ...state.reviewPaginationByInstructor,
          [instructorId]: { ...current, loadingMore },
        },
      };
    }),
  requestReviewRefresh: () => set((state) => ({ reviewSyncRequest: state.reviewSyncRequest + 1 })),
}));

// Backward compatibility alias
export const useBookingStore = useBookingsStore;
