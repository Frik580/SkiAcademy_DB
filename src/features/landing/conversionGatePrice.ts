import { PUBLIC_STOREFRONT_REVIEW_MIN } from './conversionGateCopy';

/** Canonical instructor rating summaries only. Never invents a count. */
export function countVerifiedInstructorReviews(
  instructors: readonly { reviewsCount?: number | null }[]
): number {
  return instructors.reduce((sum, instructor) => {
    const count = instructor.reviewsCount;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return sum;
    return sum + Math.floor(count);
  }, 0);
}

/** Public storefront shows a rating block only after enough verified reviews exist. */
export function isPublicStorefrontReviewVisible(count: number | null | undefined): boolean {
  return (
    typeof count === 'number' &&
    Number.isFinite(count) &&
    Math.floor(count) >= PUBLIC_STOREFRONT_REVIEW_MIN
  );
}
