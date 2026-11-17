import type { ResortSeasonSettings } from '../../types';
import { isSchoolCalendarDate as isCalendarDate } from '@ski-academy/shared-domain';

export type ResortSeasonValidationError =
  | 'seasonDatesRequired'
  | 'seasonDatesInvalid'
  | 'seasonDatesOrderError'
  | 'highSeasonDatesPairError'
  | 'highSeasonDatesOrderError'
  | 'highSeasonOutsideSeasonError';

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
