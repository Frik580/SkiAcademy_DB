import { CONVERSION_GATE_COPY } from './conversionGateCopy';

export type StartingPriceSource =
  | { kind: 'instructor_hourly'; amountKzt: number }
  | { kind: 'course_package'; amountKzt: number }
  | { kind: 'unavailable' };

function minPositiveKzt(values: readonly (number | null | undefined)[]): number | null {
  let min: number | null = null;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    if (min === null || value < min) min = value;
  }
  return min;
}

/**
 * Lowest verified KZT amount already on the catalogue.
 * Instructor hourly rates win over course package prices so the line is not
 * labeled per hour when the only figure is a course total.
 */
export function selectStartingPrice(input: {
  instructorHourlyKzt: readonly (number | null | undefined)[];
  coursePackageKzt: readonly (number | null | undefined)[];
}): StartingPriceSource {
  const hourly = minPositiveKzt(input.instructorHourlyKzt);
  if (hourly != null) return { kind: 'instructor_hourly', amountKzt: hourly };
  const course = minPositiveKzt(input.coursePackageKzt);
  if (course != null) return { kind: 'course_package', amountKzt: course };
  return { kind: 'unavailable' };
}

export function formatStartingPriceLine(
  source: StartingPriceSource,
  formatAmount: (amountKzt: number) => string,
  perHourLabel: string
): string {
  if (source.kind === 'unavailable') return CONVERSION_GATE_COPY.startingPriceFallback;
  const amount = formatAmount(source.amountKzt);
  const prefix = CONVERSION_GATE_COPY.startingPricePrefix;
  if (source.kind === 'instructor_hourly') return `${prefix} ${amount} / ${perHourLabel}`;
  return `${prefix} ${amount}`;
}

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
