import { useEffect, useMemo, useState } from 'react';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import { hasTrainingTodayFromSessions } from '../../../../features/course-enrollments/sessionScheduleHelpers';

/** Keeps session-related UI in sync when a lesson or course day starts or the countdown ends. */
export const useCabinetSessionNow = (
  sessionItems: readonly CabinetSessionItem[]
): Date => {
  const shouldTick = useMemo(
    () => hasTrainingTodayFromSessions(sessionItems),
    [sessionItems]
  );

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!shouldTick) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [shouldTick]);

  return shouldTick ? now : new Date();
};
