import { beforeEach, describe, expect, it } from 'vitest';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { toInstructor } from '../../src/infrastructure/firebase/firestoreMappers';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';
import { getRecommendedInstructors } from '../../src/features/student-cabinet/components/student/studentRecommendations';
import { isBookingReviewed } from '../../src/features/student-cabinet/components/student/studentHistory';
import { isReviewEligibleLessonStatus } from '../../src/domain/booking/lessonOutcomes';
import type { Booking, Instructor, Review, UserProfile } from '../../src/types';
import { readRepoFile } from '../helpers/readRepoFile';
import { resetUserScopedStores } from '../../src/store/resetDataStores';

const instructor = (id: string, rating: number | null, reviewsCount: number): Instructor =>
  ({
    id,
    name: id,
    specialty: 'ski',
    rating,
    reviewsCount,
    languages: ['English'],
    experienceYears: 5,
    bio: '',
    avatarUrl: '',
    pricePerHour: 100,
    pricePerHourKZT: 50_000,
    isAvailable: true,
  }) as Instructor;

const profile = { uid: 'account-review-ui', level: 1 } as UserProfile;

beforeEach(() => {
  useBookingsStore.setState({
    instructors: [],
    reviews: [],
    reviewBookingStates: [],
    ratingSummaries: {},
    reviewPaginationByInstructor: {},
  });
});

describe('canonical review frontend cutover', () => {
  it('never exposes legacy instructor rating fields before canonical summary sync', () => {
    const mapped = toInstructor('instructor-legacy', {
      ...instructor('instructor-legacy', 4.9, 900),
      rating: 4.9,
      reviewsCount: 900,
    });
    expect(mapped.rating).toBeNull();
    expect(mapped.reviewsCount).toBe(0);
  });

  it('applies only canonical summaries and preserves null zero-review semantics', () => {
    useBookingsStore
      .getState()
      .setInstructors([
        instructor('instructor-rated', null, 0),
        instructor('instructor-unrated', null, 0),
      ]);
    useBookingsStore.getState().setCanonicalReviewData({
      reviews: [],
      bookingStates: [],
      summaries: [
        {
          instructorId: 'instructor-rated' as never,
          rating: 4.5,
          reviewsCount: 2,
          ratingCounts: [0, 0, 0, 1, 1],
          revision: 2 as never,
          updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        },
      ],
    });
    expect(useBookingsStore.getState().instructors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'instructor-rated', rating: 4.5, reviewsCount: 2 }),
        expect.objectContaining({ id: 'instructor-unrated', rating: null, reviewsCount: 0 }),
      ])
    );
  });

  it('sorts recommendations by canonical rating while unrated instructors remain unrated', () => {
    const result = getRecommendedInstructors(
      profile,
      [instructor('unrated', null, 0), instructor('rated', 4.2, 1)],
      [],
      2
    );
    expect(result.map((item) => item.id)).toEqual(['rated', 'unrated']);
  });

  it('uses booking identity only for canonical already-reviewed state', () => {
    const booking = {
      id: 'booking-canonical-review',
      userId: profile.uid,
      instructorId: 'instructor-rated',
      date: '2026-01-01',
    } as Booking;
    const legacyCoincidence = {
      id: 'legacy-review',
      userId: profile.uid,
      instructorId: booking.instructorId,
      date: booking.date,
      rating: 5,
    } as Review;
    expect(isBookingReviewed(booking, [legacyCoincidence], [])).toBe(false);
    expect(
      isBookingReviewed(booking, [{ ...legacyCoincidence, bookingId: booking.id } as Review], [])
    ).toBe(true);
  });

  it('binds the accepted comment limit into the review textarea', () => {
    const source = readRepoFile('src/features/student-cabinet/components/ReviewModal.tsx');
    expect(source).toContain('maxLength={INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH}');
    expect(source).not.toMatch(/<textarea[\s\S]*?\brequired\b[\s\S]*?\/>/);
  });

  it('shows a review CTA only for eligible completed lessons and hides it after a canonical review', () => {
    const completed = { id: 'booking-completed', status: 'completed' } as Booking;
    const noShow = { id: 'booking-no-show', status: 'no_show' } as Booking;
    const canonicalReview = {
      id: 'review-completed',
      bookingId: completed.id,
      userId: profile.uid,
      instructorId: 'instructor-rated',
      rating: 5,
    } as Review;
    expect(isReviewEligibleLessonStatus(completed.status)).toBe(true);
    expect(isReviewEligibleLessonStatus(noShow.status)).toBe(false);
    expect(isBookingReviewed(completed, [], [])).toBe(false);
    expect(isBookingReviewed(completed, [canonicalReview], [])).toBe(true);
    expect(isBookingReviewed(noShow, [], [])).toBe(false);
  });

  it('keeps command success independent from a later canonical refresh failure', () => {
    const service = readRepoFile('src/features/reviews/reviewService.ts');
    expect(service).toContain('Mutation success remains success');
    expect(service).toContain('requestReviewRefresh()');
    const flow = readRepoFile('src/features/profile/components/ReviewFlow.tsx');
    expect(flow).toContain("t('reviewShared')");
    expect(flow).not.toContain('reviewEmpty');
  });

  it('renders unrated instructors as no-reviews instead of a zero-star score', () => {
    const card = readRepoFile('src/features/profile/components/InstructorCard.tsx');
    expect(card).toContain("t('instructorNoReviews')");
    expect(card).toContain('instructor.reviewsCount > 0 && instructor.rating !== null');
    const modal = readRepoFile('src/features/profile/components/InstructorReviewsModal.tsx');
    expect(modal).toContain("t('instructorNoReviews')");
    expect(modal).toContain('targetInstructor.reviewsCount');
  });

  it('clears account review authority projections on session reset', () => {
    useBookingsStore.setState({
      reviewBookingStates: [
        {
          bookingId: 'booking-session-a' as never,
          instructorId: 'instructor-session-a' as never,
          eligible: true,
          reviewed: false,
        },
      ],
      ratingSummaries: {
        'instructor-session-a': {
          instructorId: 'instructor-session-a' as never,
          rating: 5,
          reviewsCount: 1,
          ratingCounts: [0, 0, 0, 0, 1],
          revision: 1 as never,
          updatedAt: timestampFromDate(new Date()),
        },
      },
      reviewSyncRequest: 9,
      reviewPaginationByInstructor: {
        'instructor-session-a': {
          hasMore: true,
          nextCursor: 'cursor-session-a',
          loadingMore: false,
        },
      },
    });
    resetUserScopedStores();
    expect(useBookingsStore.getState()).toMatchObject({
      reviewBookingStates: [],
      ratingSummaries: {},
      reviewSyncRequest: 0,
      reviewPaginationByInstructor: {},
    });
  });

  it('loads instructor review history one page at a time and exposes explicit continuation UX', () => {
    const sync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    expect(sync).toContain('loadInstructorReviewPage');
    expect(sync).not.toContain('loadAllInstructorReviews');
    expect(sync).not.toMatch(/while\s*\(page\.hasMore/);
    expect(sync).toContain('pageSize: 25');

    const modal = readRepoFile('src/features/profile/components/InstructorReviewsModal.tsx');
    expect(modal).toContain("t('loadMoreReviews')");
    const workspace = readRepoFile(
      'src/features/instructor-workspace/components/InstructorReviews.tsx'
    );
    expect(workspace).toContain("t('loadMoreReviews')");
    expect(workspace).toContain('linkedInstructor?.reviewsCount ?? 0');
    expect(workspace).not.toContain("t('instructorFeedback')} ({instructorReviews.length})");
  });

  it('appends one review page without duplicating an overlapping boundary row', () => {
    const summary = {
      instructorId: 'instructor-page' as never,
      rating: 4.5,
      reviewsCount: 2,
      ratingCounts: [0, 0, 0, 1, 1] as [number, number, number, number, number],
      revision: 2 as never,
      updatedAt: timestampFromDate(new Date('2026-01-03T00:00:00.000Z')),
    };
    const review = (reviewId: string, day: number) => ({
      reviewId: reviewId as never,
      instructorId: summary.instructorId,
      rating: 5,
      authorDisplayName: 'Reviewer',
      createdAt: timestampFromDate(new Date(`2026-01-0${day}T00:00:00.000Z`)),
      revision: 1 as never,
    });

    useBookingsStore.getState().setCanonicalReviewData({
      reviews: [review('review-page-1', 2)],
      summaries: [summary],
      bookingStates: [],
      reviewPages: [
        {
          instructorId: summary.instructorId,
          hasMore: true,
          nextCursor: 'cursor-page-2',
        },
      ],
    });
    useBookingsStore.getState().appendCanonicalInstructorReviewPage({
      instructorId: summary.instructorId,
      reviews: [review('review-page-1', 2), review('review-page-2', 1)],
      summary,
      hasMore: false,
    });

    expect(useBookingsStore.getState().reviews.map((item) => item.id)).toEqual([
      'review-page-1',
      'review-page-2',
    ]);
    expect(useBookingsStore.getState().reviewPaginationByInstructor[summary.instructorId]).toEqual({
      hasMore: false,
      loadingMore: false,
    });
  });

  it('hydrates account review authority for any authenticated Account role', () => {
    const sync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    expect(sync).toContain('shouldSyncReviews && firebaseUserId');
    expect(sync).not.toContain("userRole === 'user'");
  });
});
