import { timestampFromDate, type CanonicalTimestamp } from '@ski-academy/shared-domain';

export function accountCalendarMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * Half-open local calendar month `[monthStart, nextMonthStart)`.
 * Matches Student Calendar grid month math (`new Date(year, month, 1)`).
 */
export function buildAccountCalendarMonthRange(
  year: number,
  monthIndex: number
): {
  readonly monthKey: string;
  readonly rangeStart: CanonicalTimestamp;
  readonly rangeEnd: CanonicalTimestamp;
} {
  return {
    monthKey: accountCalendarMonthKey(year, monthIndex),
    rangeStart: timestampFromDate(new Date(year, monthIndex, 1)),
    rangeEnd: timestampFromDate(new Date(year, monthIndex + 1, 1)),
  };
}
