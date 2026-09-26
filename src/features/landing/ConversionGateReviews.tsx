interface ConversionGateReviewsProps {
  heading: string;
  emptyLabel: string;
  verifiedCount: number;
  totalLabel: string;
}

/**
 * Public gate reviews.
 * Count comes from canonical instructor rating summaries.
 * Zero reviews render text only — no stars, ratings, or testimonials.
 */
export function ConversionGateReviews({
  heading,
  emptyLabel,
  verifiedCount,
  totalLabel,
}: ConversionGateReviewsProps) {
  return (
    <section
      className="conversion-gate-reviews px-6 md:px-10 lg:px-12 py-8 max-w-7xl mx-auto"
      data-testid="conversion-gate-reviews"
      aria-label={heading}
    >
      <h2 className="ui-section-title">{heading}</h2>
      {verifiedCount > 0 ? (
        <p
          className="mt-2 text-sm font-mono text-[var(--ink-dim)]"
          data-testid="conversion-gate-reviews-count"
        >
          {verifiedCount} {totalLabel}
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--ink-dim)]" data-testid="conversion-gate-reviews-empty">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}
