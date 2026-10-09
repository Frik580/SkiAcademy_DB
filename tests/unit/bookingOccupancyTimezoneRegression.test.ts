import { describe, expect, it } from 'vitest';
import type { AdminPlannerOccupancyItem } from '@ski-academy/shared-domain';
import { resolveBookingScheduleFromCalendarInput } from '@ski-academy/shared-domain/canonical/bookingCreation';
import { IanaTimeZoneSchema } from '@ski-academy/shared-domain/canonical/primitives';
import { canonicalTimestampToLocalParts } from '../../src/features/lesson-bookings/mapCalendarInput';
import {
  getAvailableLessonStartTimes,
  mapInstructorOccupancyReadModelForBookingModal,
} from '../../src/features/bookings/instructorOccupancyForBookingModal';

const date = '2026-10-14';
const instructorId = 'instructor_timezone';
const now = new Date('2026-10-09T00:00:00Z');

function item(
  start = '2026-10-14T07:00:00Z',
  end = '2026-10-14T09:00:00Z',
  overrides: Partial<AdminPlannerOccupancyItem> = {}
): AdminPlannerOccupancyItem {
  const seconds = Date.parse(start) / 1000;
  const local = canonicalTimestampToLocalParts(seconds, 0, 'Asia/Almaty');
  return {
    occupancyKind: 'lesson_booking',
    occupancyId: 'booking_timezone',
    bookingId: 'booking_timezone',
    instructorId,
    timeZone: 'Asia/Almaty',
    localDate: local.date,
    localTime: local.time,
    durationMinutes: (Date.parse(end) - Date.parse(start)) / 60_000,
    displayTitle: 'Booked',
    lifecycleStatus: 'confirmed',
    revision: 1,
    interval: {
      startsAt: { seconds, nanoseconds: 0 },
      endsAt: { seconds: Date.parse(end) / 1000, nanoseconds: 0 },
    },
    ...overrides,
  } as AdminPlannerOccupancyItem;
}

function available(
  occupancy: AdminPlannerOccupancyItem[],
  timeZone: string,
  durationHours = 2,
  localDate = date,
  candidateStarts = ['08:00', '10:00', '12:00']
) {
  const mapped = mapInstructorOccupancyReadModelForBookingModal({
    instructorId,
    localDate,
    timeZone,
    occupancy,
    truncated: false,
    window: resolveBookingScheduleFromCalendarInput(
      { localDate, localTime: '00:00', durationMinutes: 1440 },
      IanaTimeZoneSchema.parse(timeZone)
    ).interval,
  });
  return {
    mapped,
    starts: getAvailableLessonStartTimes({
      candidateStarts,
      durationHours,
      localDate,
      instructorId,
      occupancySlots: mapped.slots,
      occupancyCourses: mapped.courses,
      occupancyItems: occupancy,
      timeZone,
      now,
    }),
  };
}

describe('confirmed mixed-timezone occupancy defect', () => {
  it('retains the original diagnostic: free UTC 12:00 beside Almaty 12:00–14:00', () => {
    const occupancy = [item()];
    const canonicalOnly = getAvailableLessonStartTimes({
      candidateStarts: ['08:00', '10:00', '12:00'],
      durationHours: 2,
      localDate: date,
      instructorId,
      occupancySlots: [],
      occupancyCourses: [],
      occupancyItems: occupancy,
      timeZone: 'UTC',
      now,
    });
    expect(canonicalOnly).toEqual(['10:00', '12:00']);
    expect(available(occupancy, 'UTC').starts).toEqual(['10:00', '12:00']);
  });

  it.each(['UTC', 'America/New_York'])(
    'keeps original 10:00 and 12:00 booking options free in %s',
    (zone) => {
      expect(available([item()], zone).starts).toContain('10:00');
      expect(available([item()], zone).starts).toContain('12:00');
    }
  );
});

describe.each(['Asia/Almaty', 'UTC', 'America/New_York'])(
  'absolute occupancy displayed in %s',
  (zone) => {
    function localItem(
      localTime: string,
      durationMinutes = 60,
      overrides: Partial<AdminPlannerOccupancyItem> = {}
    ) {
      const schedule = resolveBookingScheduleFromCalendarInput(
        { localDate: date, localTime, durationMinutes },
        IanaTimeZoneSchema.parse(zone)
      );
      return item(
        new Date(schedule.interval.startsAt.seconds * 1000).toISOString(),
        new Date(schedule.interval.endsAt.seconds * 1000).toISOString(),
        overrides
      );
    }

    it('blocks occupied/overlapping intervals and allows both exact adjacent boundaries', () => {
      expect(
        available([localItem('10:00', 120)], zone, 1, date, ['09:00', '10:00', '11:00', '12:00'])
          .starts
      ).toEqual(['09:00', '12:00']);
      expect(
        available([localItem('10:00', 120)], zone, 2, date, [
          '08:00',
          '09:00',
          '10:00',
          '11:00',
          '12:00',
        ]).starts
      ).toEqual(['08:00', '12:00']);
    });

    it.each(['lesson_booking', 'course_day', 'availability_block'] as const)(
      'uses canonical intervals for %s without duplicating projections',
      (kind) => {
        const occupancy = [
          localItem('10:00', 60, {
            occupancyKind: kind,
            courseId: 'course_timezone',
          } as Partial<AdminPlannerOccupancyItem>),
        ];
        const result = available(occupancy, zone, 1, date, ['09:00', '10:00', '11:00']);
        expect(result.starts).toEqual(['09:00', '11:00']);
        expect(result.mapped.slots).toHaveLength(kind === 'course_day' ? 0 : 1);
        expect(result.mapped.courses).toHaveLength(kind === 'course_day' ? 1 : 0);
        if (kind === 'course_day')
          expect(result.mapped.courses[0].dates).toBe('14.10.2026, 10:00 - 11:00');
        else expect(result.mapped.slots[0].time).toBe('10:00');
      }
    );

    it('retains one multi-participant booking and participant conflicts with another instructor', () => {
      const booking = localItem('10:00', 60, {
        participantIds: ['participant_self', 'participant_child'],
        instructorId: 'other_instructor',
      } as Partial<AdminPlannerOccupancyItem>);
      const before = JSON.stringify(booking);
      expect(
        available([booking, booking], zone, 1, date, ['09:00', '10:00', '11:00']).starts
      ).toEqual(['09:00', '11:00']);
      expect(JSON.stringify(booking)).toBe(before);
      expect(available([], zone, 1, date, ['10:00']).starts).toEqual(['10:00']);
    });

    it('blocks only the intersecting day of an overnight canonical interval', () => {
      const overnight = resolveBookingScheduleFromCalendarInput(
        { localDate: '2026-10-13', localTime: '23:00', durationMinutes: 600 },
        IanaTimeZoneSchema.parse(zone)
      ).interval;
      const booking = item(
        new Date(overnight.startsAt.seconds * 1000).toISOString(),
        new Date(overnight.endsAt.seconds * 1000).toISOString()
      );
      expect(available([booking], zone, 1, date, ['08:00', '09:00']).starts).toEqual(['09:00']);
      expect(available([booking], zone, 1, '2026-10-15', ['08:00', '09:00']).starts).toEqual([
        '08:00',
        '09:00',
      ]);
    });

    it('preserves nanosecond overlap and does not round a short booking up to an hour', () => {
      const booking = localItem('10:00', 60);
      booking.interval = {
        ...booking.interval,
        endsAt: { ...booking.interval.endsAt, nanoseconds: 1 },
      };
      expect(
        available([booking], zone, 1, date, ['09:00', '10:00', '11:00', '12:00']).starts
      ).toEqual(['09:00', '12:00']);
      expect(
        available([localItem('10:30', 30)], zone, 1, date, ['09:00', '10:00', '11:00']).starts
      ).toEqual(['09:00', '11:00']);
    });

    it('preserves the lesson working-day end constraint', () => {
      expect(available([], zone, 2, date, ['17:00', '18:00']).starts).toEqual(['17:00']);
    });

    it('evaluates same-day past options in the explicit schedule zone', () => {
      const clock = localItem('10:01').interval.startsAt;
      const starts = getAvailableLessonStartTimes({
        candidateStarts: ['09:00', '10:00', '11:00'],
        durationHours: 1,
        localDate: date,
        instructorId,
        occupancySlots: [],
        occupancyCourses: [],
        occupancyItems: [],
        timeZone: zone,
        now: new Date(clock.seconds * 1000),
      });
      expect(starts).toEqual(['11:00']);
    });
  }
);
