import { describe, expect, it } from 'vitest';
import { resolveBookingScheduleFromCalendarInput } from './canonical/bookingCreation';
import { timestampFromDate } from './canonical/primitives';
import {
  isLessonBookingDateInSeason,
  isLessonBookingIntervalInSeason,
  resolveLessonBookingSeason,
} from './lessonBookingSeason';

const season = resolveLessonBookingSeason({ startDate: '2026-12-01', endDate: '2027-04-15' });
const interval = (
  localDate: string,
  localTime = '10:00',
  durationMinutes = 60,
  zone = 'Asia/Almaty'
) =>
  resolveBookingScheduleFromCalendarInput({ localDate, localTime, durationMinutes }, zone).interval;

describe('lesson booking main season', () => {
  it.each([
    ['2026-11-30', false],
    ['2026-12-01', true],
    ['2027-01-15', true],
    ['2027-04-15', true],
    ['2027-04-16', false],
  ])('checks inclusive school date %s across New Year', (date, allowed) => {
    expect(isLessonBookingDateInSeason(season, date)).toBe(allowed);
    expect(isLessonBookingIntervalInSeason(season, interval(date), 'Asia/Almaty')).toBe(allowed);
  });

  it('checks the actual end, including midnight on the next day', () => {
    expect(
      isLessonBookingIntervalInSeason(season, interval('2027-04-15', '22:59'), 'Asia/Almaty')
    ).toBe(true);
    expect(
      isLessonBookingIntervalInSeason(season, interval('2027-04-15', '23:00'), 'Asia/Almaty')
    ).toBe(false);
    expect(
      isLessonBookingIntervalInSeason(season, interval('2027-04-15', '23:30', 120), 'Asia/Almaty')
    ).toBe(false);
  });

  it.each(['Asia/Almaty', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Paris'])(
    'uses local school calendar boundaries in %s, independent of UTC day',
    (zone) => {
      expect(
        isLessonBookingIntervalInSeason(season, interval('2026-12-01', '00:00', 60, zone), zone)
      ).toBe(true);
      expect(
        isLessonBookingIntervalInSeason(season, interval('2027-04-15', '23:30', 60, zone), zone)
      ).toBe(false);
    }
  );

  it.each([
    ['2027-03-28', '2027-03-27T23:30:00Z', '2027-03-28T01:30:00Z'],
    ['2027-10-31', '2027-10-30T22:30:00Z', '2027-10-31T02:30:00Z'],
  ])('checks actual endpoints across DST on %s', (date, start, end) => {
    const oneDay = resolveLessonBookingSeason({ startDate: date, endDate: date });
    expect(
      isLessonBookingIntervalInSeason(
        oneDay,
        {
          startsAt: timestampFromDate(new Date(start)),
          endsAt: timestampFromDate(new Date(end)),
        },
        'Europe/Paris'
      )
    ).toBe(true);
  });

  it('preserves booking with no season and ignores high season', () => {
    expect(
      isLessonBookingIntervalInSeason(
        resolveLessonBookingSeason(undefined),
        interval('2026-06-01'),
        'Asia/Almaty'
      )
    ).toBe(true);
    expect(
      resolveLessonBookingSeason({
        startDate: '2026-12-01',
        endDate: '2027-04-15',
        highSeason: 'broken',
      })
    ).toEqual(season);
  });

  it.each([
    null,
    {},
    '',
    { startDate: '2026-12-01' },
    { startDate: '2027-02-29', endDate: '2027-04-15' },
    { startDate: '2027-13-01', endDate: '2027-04-15' },
    { startDate: '2027-04-16', endDate: '2026-12-01' },
  ])('fails closed for malformed configured season %j', (value) => {
    const invalid = resolveLessonBookingSeason(value);
    expect(invalid.kind).toBe('invalid');
    expect(isLessonBookingIntervalInSeason(invalid, interval('2027-01-15'), 'Asia/Almaty')).toBe(
      false
    );
  });
});
