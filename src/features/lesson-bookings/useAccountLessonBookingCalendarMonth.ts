import { useCallback, useEffect } from 'react';
import { useAuthStore } from '../auth/authStore';
import {
  accountCalendarMonthKey,
  buildAccountCalendarMonthRange,
} from './calendarMonthRange';
import {
  selectCalendarMonthStatus,
  useLessonBookingStore,
} from './lessonBookingStore';
import { ensureAccountCalendarMonthLoaded } from './syncAccountLessonBookings';

export function useAccountLessonBookingCalendarMonth(input: {
  readonly enabled: boolean;
  readonly year: number;
  readonly monthIndex: number;
}) {
  const accountId = useAuthStore((state) => state.firebaseUser?.uid);
  const monthKey = accountCalendarMonthKey(input.year, input.monthIndex);
  const status = useLessonBookingStore((state) => selectCalendarMonthStatus(state, monthKey));
  const error = useLessonBookingStore((state) =>
    state.calendarMonthError?.monthKey === monthKey ? state.calendarMonthError.message : undefined
  );

  const load = useCallback(async () => {
    if (!input.enabled || !accountId) {
      return;
    }
    const range = buildAccountCalendarMonthRange(input.year, input.monthIndex);
    await ensureAccountCalendarMonthLoaded({
      accountId,
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      getCurrentAccountId: () => useAuthStore.getState().firebaseUser?.uid,
    });
  }, [accountId, input.enabled, input.monthIndex, input.year]);

  useEffect(() => {
    if (!input.enabled || !accountId) {
      return;
    }
    void load().catch(() => undefined);
  }, [accountId, input.enabled, load]);

  return {
    monthKey,
    status,
    error,
    retry: () => {
      void load().catch(() => undefined);
    },
  };
}
