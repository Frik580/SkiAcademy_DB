import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';

/** An instant projected onto the confirmed school calendar, independent of host timezone. */
export function schoolCalendarDate(instant: Date, timeZone: string): string {
  return canonicalTimestampToLocalParts(instant.getTime() / 1000, 0, timeZone).date;
}

/** UTC is only a carrier for date-only arithmetic, never a session instant. */
export function addCalendarDays(date: string, days: number): string {
  const carrier = new Date(`${date}T12:00:00Z`);
  carrier.setUTCDate(carrier.getUTCDate() + days);
  return carrier.toISOString().slice(0, 10);
}

export function schoolCalendarDays(now: Date, timeZone: string): string[] {
  const today = schoolCalendarDate(now, timeZone);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(today, index));
}

export function formatCalendarDate(date: string, language: 'en' | 'ru'): string {
  const carrier = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(carrier.getTime())) return date;
  return carrier.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
