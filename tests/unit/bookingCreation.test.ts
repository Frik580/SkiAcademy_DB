import { describe, expect, it } from 'vitest';
import {
  calculateIndividualBookingPriceKzt,
  localCalendarInputToUtcDate,
  resolveBookingScheduleFromCalendarInput,
  resolveInstructorHourlyRateKzt,
} from '@ski-academy/shared-domain';
import {
  initialBookingOccurrenceIdFromBookingId,
  paymentIdFromBookingId,
} from '../../packages/shared-domain/src/canonical/deterministicIdentity';
import { BookingIdSchema } from '../../packages/shared-domain/src/canonical/identifiers';

describe('booking creation helpers', () => {
  it('derives deterministic payment and occurrence identities from bookingId', () => {
    const bookingId = BookingIdSchema.parse('booking_creation_test_01');
    expect(paymentIdFromBookingId(bookingId)).toMatch(/^[0-9a-f]{64}$/);
    expect(initialBookingOccurrenceIdFromBookingId(bookingId)).toMatch(/^[0-9a-f]{64}$/);
    expect(paymentIdFromBookingId(bookingId)).not.toBe(
      initialBookingOccurrenceIdFromBookingId(bookingId)
    );
  });

  it('resolves hourly tariff and individual booking price from duration', () => {
    const hourlyRate = resolveInstructorHourlyRateKzt({ pricePerHourKZT: 12_000 });
    expect(calculateIndividualBookingPriceKzt(hourlyRate, 60)).toBe(12_000);
    expect(calculateIndividualBookingPriceKzt(hourlyRate, 90)).toBe(18_000);
  });

  it('converts calendar input in Asia/Almaty to a UTC half-open interval', () => {
    const schedule = resolveBookingScheduleFromCalendarInput(
      {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      'Asia/Almaty'
    );
    expect(schedule.interval.startsAt.seconds).toBe(
      localCalendarInputToUtcDate(
        { localDate: '2026-01-15', localTime: '09:00', durationMinutes: 60 },
        'Asia/Almaty'
      ).getTime() / 1000
    );
    expect(schedule.interval.endsAt.seconds - schedule.interval.startsAt.seconds).toBe(3_600);
  });

  it('converts local midnight in Kazakhstan zones to that morning, not the previous day', () => {
    for (const timeZone of ['Asia/Almaty', 'Asia/Qyzylorda'] as const) {
      const midnight = localCalendarInputToUtcDate(
        { localDate: '2026-09-03', localTime: '00:00', durationMinutes: 60 },
        timeZone
      );
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(midnight);
      const values = Object.fromEntries(local.map((part) => [part.type, part.value]));
      expect(`${values.year}-${values.month}-${values.day}`).toBe('2026-09-03');
      expect(`${values.hour}:${values.minute}`).toBe('00:00');
      expect(midnight.toISOString()).toBe('2026-09-02T19:00:00.000Z');
    }
  });

  it('allows adjacent intervals that share an end/start boundary', () => {
    const first = resolveBookingScheduleFromCalendarInput(
      { localDate: '2026-01-15', localTime: '09:00', durationMinutes: 60 },
      'Asia/Almaty'
    );
    const second = resolveBookingScheduleFromCalendarInput(
      { localDate: '2026-01-15', localTime: '10:00', durationMinutes: 60 },
      'Asia/Almaty'
    );
    expect(first.interval.endsAt.seconds).toBe(second.interval.startsAt.seconds);
  });
});
