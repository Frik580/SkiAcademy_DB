import { describe, expect, it } from 'vitest';
import {
  resolveCoursePriceKztForDisplay,
  resolveInstructorHourlyRateKztForDisplay,
} from '../../src/domain/pricing/kztDisplay';

describe('kztDisplay helpers', () => {
  it('uses only explicit instructor KZT rates', () => {
    expect(resolveInstructorHourlyRateKztForDisplay({ pricePerHourKZT: 25_000 })).toBe(25_000);
    expect(resolveInstructorHourlyRateKztForDisplay({})).toBeUndefined();
    expect(resolveInstructorHourlyRateKztForDisplay({ pricePerHourKZT: 0 })).toBeUndefined();
  });

  it('uses only explicit course priceKZT', () => {
    expect(resolveCoursePriceKztForDisplay({ priceKZT: 90_000 })).toBe(90_000);
    expect(resolveCoursePriceKztForDisplay({})).toBeUndefined();
    expect(resolveCoursePriceKztForDisplay({ priceKZT: 0 })).toBe(0);
  });
});
