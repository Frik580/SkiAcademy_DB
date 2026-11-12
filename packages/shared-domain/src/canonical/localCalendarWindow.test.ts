import { describe, expect, it } from 'vitest';
import { localCalendarWindow } from './localCalendarWindow';

describe('localCalendarWindow', () => {
  it.each([
    ['Europe/Paris', '2026-03-29', 1, '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 23],
    ['Europe/Paris', '2026-10-25', 1, '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 25],
    ['America/New_York', '2026-03-08', 1, '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['America/New_York', '2026-11-01', 1, '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
    ['Asia/Almaty', '2026-09-10', 1, '2026-09-09T19:00:00Z', '2026-09-10T19:00:00Z', 24],
    ['Europe/Paris', '2026-03-23', 7, '2026-03-22T23:00:00Z', '2026-03-29T22:00:00Z', 167],
    ['Europe/Paris', '2026-10-19', 7, '2026-10-18T22:00:00Z', '2026-10-25T23:00:00Z', 169],
    ['Asia/Almaty', '2026-09-07', 7, '2026-09-06T19:00:00Z', '2026-09-13T19:00:00Z', 168],
    ['Europe/Paris', '2026-12-31', 1, '2026-12-30T23:00:00Z', '2026-12-31T23:00:00Z', 24],
    ['Europe/Paris', '2026-12-28', 7, '2026-12-27T23:00:00Z', '2027-01-03T23:00:00Z', 168],
  ] as const)('%s %s / %i calendar days', (zone, date, days, start, end, hours) => {
    const window = localCalendarWindow(date, zone, days);
    expect(window.startsAt).toEqual({ seconds: Date.parse(start) / 1_000, nanoseconds: 0 });
    expect(window.endsAt).toEqual({ seconds: Date.parse(end) / 1_000, nanoseconds: 0 });
    expect(window.endsAt.seconds - window.startsAt.seconds).toBe(hours * 3_600);
  });

  it.each(['2026-03-23', '2026-10-19', '2026-12-28'])(
    'covers seven adjacent days and joins the next week: %s',
    (date) => {
      const week = localCalendarWindow(date, 'Europe/Paris', 7);
      let boundary = week.startsAt;
      const calendar = new Date(`${date}T00:00:00Z`);
      for (let index = 0; index < 7; index += 1) {
        const day = localCalendarWindow(calendar.toISOString().slice(0, 10), 'Europe/Paris');
        expect(day.startsAt).toEqual(boundary);
        boundary = day.endsAt;
        calendar.setUTCDate(calendar.getUTCDate() + 1);
      }
      expect(boundary).toEqual(week.endsAt);
      expect(
        localCalendarWindow(calendar.toISOString().slice(0, 10), 'Europe/Paris', 7).startsAt
      ).toEqual(week.endsAt);
    }
  );

  it.each(['2018-11-04', '2018-11-03'])(
    'rejects a skipped Sao Paulo midnight at either boundary: %s',
    (date) => {
      expect(() => localCalendarWindow(date, 'America/Sao_Paulo')).toThrow(
        'Unrepresentable local midnight: 2018-11-04 in America/Sao_Paulo'
      );
    }
  );

  it('retains the existing converter choice for a repeated Havana midnight', () => {
    const window = localCalendarWindow('2026-11-01', 'America/Havana');
    expect(window.startsAt.seconds).toBe(Date.parse('2026-11-01T04:00:00Z') / 1_000);
    expect(window.endsAt.seconds).toBe(Date.parse('2026-11-02T05:00:00Z') / 1_000);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid day count %s', (days) => {
    expect(() => localCalendarWindow('2026-09-10', 'Asia/Almaty', days)).toThrow();
  });
  it.each(['2026-02-30', 'invalid', '2026-9-1'])('rejects invalid date %s', (date) => {
    expect(() => localCalendarWindow(date, 'Asia/Almaty')).toThrow('Invalid calendar date');
  });
});
