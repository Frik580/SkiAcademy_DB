import { localCalendarInputToUtcDate } from './bookingCreation';
import {
  IanaTimeZoneSchema,
  TimeIntervalSchema,
  timestampFromDate,
  type TimeInterval,
} from './primitives';

/** Calendar boundaries, independently converted to UTC; never a fixed elapsed duration. */
export function localCalendarWindow(
  localDate: string,
  timeZone: string,
  windowDays = 1
): TimeInterval {
  const zone = IanaTimeZoneSchema.parse(timeZone);
  if (!Number.isSafeInteger(windowDays) || windowDays < 1) {
    throw new Error('Calendar windowDays must be a positive safe integer');
  }
  const calendarDate = new Date(`${localDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== localDate
  ) {
    throw new Error('Invalid calendar date');
  }
  calendarDate.setUTCDate(calendarDate.getUTCDate() + windowDays);
  const endDate = calendarDate.toISOString().slice(0, 10);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const midnight = (date: string): Date => {
    const instant = localCalendarInputToUtcDate(
      { localDate: date, localTime: '00:00', durationMinutes: 60 },
      zone
    );
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value])
    );
    // The existing converter cannot represent skipped local midnights. Fail explicitly.
    if (
      `${parts.year}-${parts.month}-${parts.day}` !== date ||
      parts.hour !== '00' ||
      parts.minute !== '00'
    ) {
      throw new Error(`Unrepresentable local midnight: ${date} in ${zone}`);
    }
    return instant;
  };
  return TimeIntervalSchema.parse({
    startsAt: timestampFromDate(midnight(localDate)),
    endsAt: timestampFromDate(midnight(endDate)),
  });
}
