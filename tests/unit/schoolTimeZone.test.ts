import { describe, expect, it } from 'vitest';
import {
  resolveSchoolTimeZone,
  resolveBookingScheduleFromCalendarInput,
} from '@ski-academy/shared-domain';
import { translations } from '../../src/lib/i18n/translations';

describe('school time zone contract', () => {
  it('defaults only missing settings', () => {
    expect(resolveSchoolTimeZone(undefined)).toBe('Asia/Almaty');
    expect(resolveSchoolTimeZone({})).toBe('Asia/Almaty');
    for (const timeZone of ['', null, 42, 'bad/zone', '+05:00']) {
      expect(() => resolveSchoolTimeZone({ timeZone })).toThrow();
    }
  });
  it.each([
    ['Asia/Almaty', '2026-12-15', '2026-12-15T04:00:00Z'],
    ['UTC', '2026-12-15', '2026-12-15T09:00:00Z'],
    ['America/New_York', '2026-01-15', '2026-01-15T14:00:00Z'],
    ['America/New_York', '2026-07-15', '2026-07-15T13:00:00Z'],
    ['Europe/Paris', '2026-01-15', '2026-01-15T08:00:00Z'],
    ['Europe/Paris', '2026-07-15', '2026-07-15T07:00:00Z'],
  ])('resolves %s on %s independently of browser time zone', (timeZone, localDate, utc) => {
    const school = resolveSchoolTimeZone({ timeZone });
    expect(school).toBe(timeZone);
    const schedule = resolveBookingScheduleFromCalendarInput(
      { localDate, localTime: '09:00', durationMinutes: 60 },
      school
    );
    expect(schedule.interval.startsAt.seconds).toBe(Date.parse(utc) / 1000);
  });
  it('provides RU/EN setting copy', () => {
    expect(translations.ru.schoolTimeZoneLabel).toBe('Часовой пояс школы');
    expect(translations.en.schoolTimeZoneLabel).toBe('School time zone');
    expect(translations.en.schoolTimeZoneHelp).toContain('existing bookings');
    expect(translations.ru.schoolTimeZoneHelp).toContain('существующие бронирования');
  });
});
