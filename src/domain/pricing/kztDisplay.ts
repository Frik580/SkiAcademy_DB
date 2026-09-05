/**
 * Display helpers for KZT cutover.
 * Legacy `price` / `pricePerHour` may still hold pre-cutover USD values —
 * never treat them as ₸ when an explicit KZT field is absent.
 */

export function resolveInstructorHourlyRateKztForDisplay(instructor: {
  pricePerHourKZT?: number | null;
}): number | undefined {
  const rate = instructor.pricePerHourKZT;
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return rate;
  return undefined;
}

export function resolveCoursePriceKztForDisplay(course: {
  priceKZT?: number | null;
}): number | undefined {
  const price = course.priceKZT;
  if (typeof price === 'number' && Number.isFinite(price) && price >= 0) return price;
  return undefined;
}
