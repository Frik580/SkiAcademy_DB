import { schoolCalendarDate } from '../../../course-enrollments/schoolCalendar';
import { useEffect, useMemo, useState } from 'react';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  isActiveSessionItem,
  resolveSessionStartDateTime,
  resolveSessionEndDateTime,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';

/** Keeps session-related UI in sync when a lesson or course day starts or the countdown ends. */
export const useCabinetSessionNow = (
  sessionItems: readonly CabinetSessionItem[],
  timeZone?: string
): Date => {
  const [boundaryRevision, setBoundaryRevision] = useState(0);
  // These inputs intentionally invalidate the captured clock at data and calendar boundaries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [sessionItems, boundaryRevision, timeZone]);

  useEffect(() => {
    const currentTime = Date.now();
    let nextBoundary = Infinity;
    if (timeZone) {
      // Find the first instant of the next school date, including DST transitions.
      const today = schoolCalendarDate(now, timeZone);
      let low = now.getTime();
      let high = low + 48 * 60 * 60 * 1000;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (schoolCalendarDate(new Date(middle), timeZone) === today) low = middle;
        else high = middle;
      }
      nextBoundary = high;
    }
    for (const item of sessionItems) {
      if (!isActiveSessionItem(item)) continue;
      for (const date of [resolveSessionStartDateTime(item), resolveSessionEndDateTime(item)]) {
        const boundary = date?.getTime() ?? NaN;
        if (boundary > now.getTime()) nextBoundary = Math.min(nextBoundary, boundary);
      }
    }
    if (!Number.isFinite(nextBoundary)) return;
    // Browser timers cap their delay at a signed 32-bit integer. Re-evaluate long waits.
    const id = window.setTimeout(
      () => setBoundaryRevision((revision) => revision + 1),
      Math.max(0, Math.min(nextBoundary - currentTime, 2_147_483_647))
    );
    const refresh = () => setBoundaryRevision((revision) => revision + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [sessionItems, now, timeZone]);

  return now;
};
