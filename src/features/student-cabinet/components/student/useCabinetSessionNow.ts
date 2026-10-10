import { useEffect, useMemo, useState } from 'react';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  isActiveSessionItem,
  resolveSessionStartDateTime,
  resolveSessionEndDateTime,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';

/** Keeps session-related UI in sync when a lesson or course day starts or the countdown ends. */
export const useCabinetSessionNow = (sessionItems: readonly CabinetSessionItem[]): Date => {
  const [boundaryRevision, setBoundaryRevision] = useState(0);
  const now = useMemo(() => new Date(), [sessionItems, boundaryRevision]);

  useEffect(() => {
    const currentTime = Date.now();
    let nextBoundary = Infinity;
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
    return () => window.clearTimeout(id);
  }, [sessionItems, now]);

  return now;
};
