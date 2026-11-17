import { useMemo } from 'react';
import {
  isLessonBookingDateInSeason,
  isLessonBookingIntervalInSeason,
  resolveBookingScheduleFromCalendarInput,
  resolveLessonBookingSeason,
  schoolCalendarDateAt,
} from '@ski-academy/shared-domain';
import { useSchoolTimeZone } from '../settings/schoolTimeZone';
import { useLanguage } from '../../app/providers/LanguageContext';

const unconfigured = resolveLessonBookingSeason(undefined);

/** Uses the existing shared resort-config subscription; no polling or extra listener. */
export function useLessonBookingSeason(
  inputTimeZone?: string,
  options: { readonly allowPastDates?: boolean } = {}
) {
  const school = useSchoolTimeZone();
  const { t } = useLanguage();
  const season = school.season ?? unconfigured;
  const today = schoolCalendarDateAt(new Date(), school.timeZone);
  return useMemo(() => {
    const minimumSchoolDate = options.allowPastDates
      ? season.kind === 'configured'
        ? season.startDate
        : ''
      : season.kind === 'configured' && season.startDate > today
        ? season.startDate
        : today;
    const maximumSchoolDate = season.kind === 'configured' ? season.endDate : undefined;
    // Existing bookings retain their occurrence zone after a school-zone change. Project
    // calendar bounds into that input zone; exact slot checks still use current school dates.
    const projectDate = (date: string, end: boolean) => {
      if (!inputTimeZone || inputTimeZone === school.timeZone) return date;
      const { interval } = resolveBookingScheduleFromCalendarInput(
        {
          localDate: date,
          localTime: end ? '23:59' : '00:00',
          durationMinutes: 1,
        },
        school.timeZone
      );
      const stamp = end ? interval.endsAt : interval.startsAt;
      return schoolCalendarDateAt(
        new Date(stamp.seconds * 1000 + stamp.nanoseconds / 1_000_000 - (end ? 1 : 0)),
        inputTimeZone
      );
    };
    const minDate = minimumSchoolDate ? projectDate(minimumSchoolDate, false) : '';
    const maxDate = maximumSchoolDate ? projectDate(maximumSchoolDate, true) : undefined;
    const disabled =
      !school.ready ||
      season.kind === 'invalid' ||
      Boolean(maximumSchoolDate && maximumSchoolDate < minimumSchoolDate);
    const message =
      season.kind === 'configured'
        ? t('bookingSeasonRange')
            .replace('{start}', season.startDate)
            .replace('{end}', season.endDate)
        : season.kind === 'invalid'
          ? t('bookingSeasonInvalid')
          : '';
    return {
      minDate,
      maxDate,
      disabled,
      message,
      dateAllowed: (date: string) =>
        !disabled &&
        date >= minDate &&
        (inputTimeZone && inputTimeZone !== school.timeZone
          ? !maxDate || date <= maxDate
          : isLessonBookingDateInSeason(season, date)),
      allows: (
        date: string,
        time: string,
        durationMinutes: number,
        inputTimeZone = school.timeZone
      ) => {
        if (disabled || !date || !time) return false;
        try {
          const { interval } = resolveBookingScheduleFromCalendarInput(
            { localDate: date, localTime: time, durationMinutes },
            inputTimeZone
          );
          return isLessonBookingIntervalInSeason(season, interval, school.timeZone);
        } catch {
          return false;
        }
      },
    };
  }, [school.ready, school.timeZone, season, t, today, inputTimeZone, options.allowPastDates]);
}
