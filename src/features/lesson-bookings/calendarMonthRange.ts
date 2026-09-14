import { timestampFromDate, type CanonicalTimestamp } from '@ski-academy/shared-domain';

export function accountCalendarMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** Local calendar month containing `now`, normalized to day 1 (grid/month navigation). */
export function resolveInitialVisibleAccountCalendarMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function shiftVisibleAccountCalendarMonth(current: Date, deltaMonths: number): Date {
  return new Date(current.getFullYear(), current.getMonth() + deltaMonths, 1);
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
