import type { ResortSeasonSettings } from '../../types';

export type ResortSeasonValidationError =
  | 'seasonDatesRequired'
  | 'seasonDatesInvalid'
  | 'seasonDatesOrderError'
  | 'highSeasonDatesPairError'
  | 'highSeasonDatesOrderError'
  | 'highSeasonOutsideSeasonError';

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 100) return false;
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return !Number.isNaN(normalized.getTime()) && normalized.toISOString().slice(0, 10) === value;
}

/** Inclusive calendar-day ranges; deliberately independent of the browser's time zone. */
export function getResortSeasonValidationError(
  season: ResortSeasonSettings
): ResortSeasonValidationError | null {
  if (!season.startDate || !season.endDate) return 'seasonDatesRequired';
  if (!isCalendarDate(season.startDate) || !isCalendarDate(season.endDate)) {
    return 'seasonDatesInvalid';
  }
  if (season.startDate > season.endDate) return 'seasonDatesOrderError';

  const high = season.highSeason;
  if (!high || (!high.startDate && !high.endDate)) return null;
  if (!high.startDate || !high.endDate) return 'highSeasonDatesPairError';
  if (!isCalendarDate(high.startDate) || !isCalendarDate(high.endDate)) {
    return 'seasonDatesInvalid';
  }
  if (high.startDate > high.endDate) return 'highSeasonDatesOrderError';
  if (high.startDate < season.startDate || high.endDate > season.endDate) {
    return 'highSeasonOutsideSeasonError';
  }
  return null;
}
