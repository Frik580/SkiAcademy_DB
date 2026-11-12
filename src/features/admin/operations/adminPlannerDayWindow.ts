import {
  intervalsOverlap,
  localCalendarWindow,
  type AdminPlannerOccupancyItem,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import { formatDateLocalYMD, getWeekRange } from '../components/schedule/scheduleUtils';
import { parsePlannerLocalDateInput } from '../components/schedule/scheduleDateInput';
import type { ScheduleViewMode } from '../components/schedule/ScheduleToolbar';

export function plannerDayWindow(localDate: string, timeZone: string): TimeInterval {
  return localCalendarWindow(localDate, timeZone);
}

export function filterOccupancyForLocalDate(
  occupancy: readonly AdminPlannerOccupancyItem[],
  localDate: string,
  timeZone: string
): AdminPlannerOccupancyItem[] {
  const window = plannerDayWindow(localDate, timeZone);
  return occupancy.filter((item) => intervalsOverlap(item.interval, window));
}

/**
 * Both day and week UI render a Monday–Sunday grid (day view filters client-side).
 * Always fetch from that Monday so week columns and day navigation stay populated
 * and toggling day↔week does not shift the backend window mid-week.
 */
export function plannerFetchWindow(
  localDate: string,
  _view: ScheduleViewMode
): { readonly localDate: string; readonly view: ScheduleViewMode } {
  const { start } = getWeekRange(parsePlannerLocalDateInput(localDate));
  return { localDate: formatDateLocalYMD(start), view: 'week' };
}
