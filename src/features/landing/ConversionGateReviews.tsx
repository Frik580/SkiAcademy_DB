import { isPublicStorefrontReviewVisible } from './conversionGatePrice';

interface ConversionGateReviewsProps {
  heading: string;
  verifiedCount: number;
  totalLabel: string;
}

/**
 * Public gate reviews.
 * Hidden until the canonical count reaches the storefront minimum.
 * Never renders an empty “0 reviews” state.
 */
export function ConversionGateReviews({
  heading,
  verifiedCount,
  totalLabel,
}: ConversionGateReviewsProps) {
  if (!isPublicStorefrontReviewVisible(verifiedCount)) return null;
  return (
    <section
      className="conversion-gate-reviews px-6 md:px-10 lg:px-12 py-8 max-w-7xl mx-auto"
      data-testid="conversion-gate-reviews"
      aria-label={heading}
    >
      <h2 className="ui-section-title">{heading}</h2>
      <p
        className="mt-2 text-sm font-mono text-[var(--ink-dim)]"
        data-testid="conversion-gate-reviews-count"
      >
        {verifiedCount} {totalLabel}
      </p>
    </section>
  );
}
