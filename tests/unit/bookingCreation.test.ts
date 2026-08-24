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
