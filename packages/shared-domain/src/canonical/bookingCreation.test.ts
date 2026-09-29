import { describe, expect, it } from 'vitest';
import { resolveInstructorHourlyRateKzt } from './bookingCreation';

describe('resolveInstructorHourlyRateKzt', () => {
  it('uses pricePerHourKZT when it conflicts with the historical rate', () => {
    expect(resolveInstructorHourlyRateKzt({ pricePerHour: 60, pricePerHourKZT: 30_000 })).toBe(
      30_000
    );
  });

  it('rejects historical rates when no canonical KZT rate exists', () => {
    expect(() => resolveInstructorHourlyRateKzt({ pricePerHour: 60 })).toThrow(
      'Invalid instructor hourly rate'
    );
  });
});
