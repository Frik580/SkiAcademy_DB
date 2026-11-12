import { localCalendarInputToUtcDate } from '@ski-academy/shared-domain/canonical/bookingCreation';
import {
  IanaTimeZoneSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain/canonical/primitives';
import { type CanonicalTimestamp } from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from './mapCalendarInput';

export type AccountCalendarMonth = { readonly year: number; readonly monthIndex: number };

export function accountCalendarMonthKey(
  year: number,
  monthIndex: number,
  timeZone: string
): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}@${timeZone}`;
}

export function resolveInitialVisibleAccountCalendarMonth(
  timeZone: string,
  now: Date = new Date()
): AccountCalendarMonth {
  const { date } = canonicalTimestampToLocalParts(now.getTime() / 1000, 0, timeZone);
  const [year, month] = date.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

export function shiftVisibleAccountCalendarMonth(
  current: AccountCalendarMonth,
  deltaMonths: number
): AccountCalendarMonth {
  const index = current.year * 12 + current.monthIndex + deltaMonths;
  const year = Math.floor(index / 12);
  return { year, monthIndex: index - year * 12 };
}

/** Half-open month: independently convert both school-local midnights (including DST). */
export function buildAccountCalendarMonthRange(
  year: number,
  monthIndex: number,
  timeZone: string
): {
  readonly monthKey: string;
  readonly rangeStart: CanonicalTimestamp;
  readonly rangeEnd: CanonicalTimestamp;
} {
  const zone = IanaTimeZoneSchema.parse(timeZone);
  const boundary = (month: AccountCalendarMonth) =>
    timestampFromDate(
      localCalendarInputToUtcDate(
        {
          localDate: `${month.year}-${String(month.monthIndex + 1).padStart(2, '0')}-01`,
          localTime: '00:00',
          durationMinutes: 60,
        },
        zone
      )
    );
  return {
    monthKey: accountCalendarMonthKey(year, monthIndex, timeZone),
    rangeStart: boundary({ year, monthIndex }),
    rangeEnd: boundary(shiftVisibleAccountCalendarMonth({ year, monthIndex }, 1)),
  };
}

/**
 * Booking labels retain their occurrence timezone after school settings change.
 * IANA civil offsets span UTC-12 to UTC+14: 26h on either side covers those
 * labels without changing stored instants or loading unbounded history.
 * The grid still filters by each Booking's projected date.
 */
export function buildAccountCalendarMonthSearchRange(
  year: number,
  monthIndex: number,
  timeZone: string
) {
  const range = buildAccountCalendarMonthRange(year, monthIndex, timeZone);
  const marginSeconds = 26 * 60 * 60;
  return {
    ...range,
    rangeStart: { ...range.rangeStart, seconds: range.rangeStart.seconds - marginSeconds },
    rangeEnd: { ...range.rangeEnd, seconds: range.rangeEnd.seconds + marginSeconds },
  };
}
