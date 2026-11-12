import { useCallback, useEffect } from 'react';
import {
  requireSchoolTimeZone,
  retrySchoolTimeZone,
  useSchoolTimeZone,
} from '../settings/schoolTimeZone';
import { useAuthStore } from '../auth/authStore';
import {
  accountCalendarMonthKey,
  buildAccountCalendarMonthSearchRange,
} from './calendarMonthRange';
import { selectCalendarMonthStatus, useLessonBookingStore } from './lessonBookingStore';
import { ensureAccountCalendarMonthLoaded } from './syncAccountLessonBookings';

export function useAccountLessonBookingCalendarMonth(input: {
  readonly enabled: boolean;
  readonly year: number;
  readonly monthIndex: number;
}) {
  const school = useSchoolTimeZone();
  const accountId = useAuthStore((state) => state.firebaseUser?.uid);
  const monthKey = accountCalendarMonthKey(input.year, input.monthIndex, school.timeZone);
  const status = useLessonBookingStore((state) => selectCalendarMonthStatus(state, monthKey));
  const error = useLessonBookingStore((state) =>
    state.calendarMonthError?.monthKey === monthKey ? state.calendarMonthError.message : undefined
  );

  const load = useCallback(async () => {
    if (!input.enabled || !accountId || !school.ready || school.error) {
      return;
    }
    const range = buildAccountCalendarMonthSearchRange(
      input.year,
      input.monthIndex,
      school.timeZone
    );
    await ensureAccountCalendarMonthLoaded({
      accountId,
      timeZone: school.timeZone,
      getCurrentTimeZone: () => {
        try {
          return requireSchoolTimeZone();
        } catch {
          return undefined;
        }
      },
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      getCurrentAccountId: () => useAuthStore.getState().firebaseUser?.uid,
    });
  }, [
    accountId,
    input.enabled,
    input.monthIndex,
    input.year,
    school.timeZone,
    school.ready,
    school.error,
  ]);

  useEffect(() => {
    if (!input.enabled || !accountId || !school.ready || school.error) {
      return;
    }
    void load().catch(() => undefined);
  }, [accountId, input.enabled, load, school.ready, school.error]);

  return {
    monthKey,
    status: !school.ready && !school.error ? 'loading' : status,
    error: school.error?.message ?? error,
    retry: () => {
      if (!school.ready || school.error) {
        retrySchoolTimeZone();
        return;
      }
      void load().catch(() => undefined);
    },
  };
}
