import { describe, expect, it } from 'vitest';
import { InstructorIdSchema } from '@ski-academy/shared-domain';
import { toBookingCatalogueInstructor } from '../../src/features/bookings/sync/bookingInstructorCatalogue';

describe('booking instructor catalogue pricing', () => {
  it('maps conflicting rates to the canonical KZT value for current consumers', () => {
    const instructor = toBookingCatalogueInstructor({
      instructorId: InstructorIdSchema.parse('instructor_catalogue_kzt'),
      name: 'Coach KZT',
      pricePerHour: 60,
      pricePerHourKZT: 30_000,
      isAvailable: true,
    });

    expect(instructor.pricePerHourKZT).toBe(30_000);
    expect(instructor.pricePerHour).toBe(30_000);
  });

  it('keeps legacy-only rates unavailable to current price consumers', () => {
    const instructor = toBookingCatalogueInstructor({
      instructorId: InstructorIdSchema.parse('instructor_catalogue_legacy'),
      name: 'Legacy Coach',
      pricePerHour: 60,
      isAvailable: true,
    });

    expect(instructor.pricePerHour).toBe(0);
    expect(instructor.pricePerHourKZT).toBeUndefined();
  });
});
