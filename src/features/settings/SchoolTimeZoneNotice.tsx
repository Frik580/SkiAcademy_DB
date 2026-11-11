import { resolveBookingScheduleFromCalendarInput } from '@ski-academy/shared-domain';
import { useSchoolTimeZoneTranslations } from './useSchoolTimeZoneTranslations';

export function SchoolTimeZoneNotice({
  timeZone,
  localDate,
  localTime = '12:00',
  ready = true,
}: {
  readonly timeZone: string;
  readonly localDate: string;
  readonly localTime?: string;
  readonly ready?: boolean;
}) {
  const { t, language } = useSchoolTimeZoneTranslations();
  let offset = '';
  try {
    const schedule = resolveBookingScheduleFromCalendarInput(
      { localDate, localTime: localTime || '12:00', durationMinutes: 60 },
      timeZone
    );
    offset =
      new Intl.DateTimeFormat(language, { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(schedule.interval.startsAt.seconds * 1000))
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    /* The date picker may be empty. */
  }
  return (
    <p role="status" className="type-caption text-[var(--ink-dim)]">
      {ready
        ? `${t('schoolLessonTime')}: ${timeZone}${offset ? ` (${offset})` : ''}`
        : t('schoolTimeZoneError')}
    </p>
  );
}
