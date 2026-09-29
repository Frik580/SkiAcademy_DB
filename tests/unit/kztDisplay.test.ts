import { describe, expect, it } from 'vitest';
import {
  resolveCoursePriceKztForDisplay,
  resolveInstructorHourlyRateKztForDisplay,
} from '../../src/domain/pricing';

describe('KZT display pricing', () => {
  it('uses the explicit KZT instructor rate and ignores a conflicting legacy value', () => {
    const instructor = { pricePerHour: 60, pricePerHourKZT: 30_000 };
    expect(resolveInstructorHourlyRateKztForDisplay(instructor)).toBe(30_000);
  });

  it('does not fall back to a legacy-only instructor rate', () => {
    const legacyOnlyInstructor = { pricePerHour: 60 };
    expect(resolveInstructorHourlyRateKztForDisplay(legacyOnlyInstructor)).toBeUndefined();
    expect(resolveInstructorHourlyRateKztForDisplay({ pricePerHourKZT: 30_000.5 })).toBeUndefined();
  });

  it('resolves current course price only from the explicit KZT field', () => {
    expect(resolveCoursePriceKztForDisplay({ priceKZT: 50_000 })).toBe(50_000);
    const legacyOnlyCourse = { price: 60 };
    expect(resolveCoursePriceKztForDisplay(legacyOnlyCourse)).toBeUndefined();
  });
});
