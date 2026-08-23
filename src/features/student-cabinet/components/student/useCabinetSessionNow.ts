import { useEffect, useMemo, useState } from 'react';
import type { Booking, Course } from '../../../../types';
import { hasTrainingToday } from './studentBookingOverview';

/** Keeps session-related UI in sync when a lesson starts or the countdown ends. */
export const useCabinetSessionNow = (
  bookings: Booking[],
  courses: Course[],
  userId?: string
): Date => {
  const shouldTick = useMemo(
    () => hasTrainingToday(bookings, courses, userId),
    [bookings, courses, userId]
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
