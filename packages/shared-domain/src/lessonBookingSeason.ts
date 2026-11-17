import type { TimeInterval } from './canonical/primitives';

export type LessonBookingSeason =
  | { readonly kind: 'unconfigured' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'configured'; readonly startDate: string; readonly endDate: string };

/** Calendar validation only: these strings are school dates, never UTC instants. */
export function isSchoolCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 100 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}

/** Only an absent main season preserves unrestricted booking; corrupt settings fail closed. */
export function resolveLessonBookingSeason(value: unknown): LessonBookingSeason {
  if (value === undefined) return { kind: 'unconfigured' };
  if (!value || typeof value !== 'object') return { kind: 'invalid' };
  const { startDate, endDate } = value as Record<string, unknown>;
  if (!isSchoolCalendarDate(startDate) || !isSchoolCalendarDate(endDate) || startDate > endDate) {
    return { kind: 'invalid' };
  }
  return { kind: 'configured', startDate, endDate };
}

export function isLessonBookingDateInSeason(season: LessonBookingSeason, date: string): boolean {
  if (!isSchoolCalendarDate(date) || season.kind === 'invalid') return false;
  return season.kind === 'unconfigured' || (date >= season.startDate && date <= season.endDate);
}

export function schoolCalendarDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Check both actual endpoints in the school's zone, including the lesson's ending instant. */
export function isLessonBookingIntervalInSeason(
  season: LessonBookingSeason,
  interval: TimeInterval,
  timeZone: string
): boolean {
  if (season.kind === 'unconfigured') return true;
  if (season.kind === 'invalid') return false;
  const toDate = (stamp: TimeInterval['startsAt']) =>
    new Date(stamp.seconds * 1000 + stamp.nanoseconds / 1_000_000);
  return (
    isLessonBookingDateInSeason(
      season,
      schoolCalendarDateAt(toDate(interval.startsAt), timeZone)
    ) &&
    isLessonBookingDateInSeason(season, schoolCalendarDateAt(toDate(interval.endsAt), timeZone))
  );
}
