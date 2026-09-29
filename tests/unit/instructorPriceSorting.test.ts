import { describe, expect, it } from 'vitest';
import { compareInstructorPriceKzt } from '../../src/hooks/useInstructorFilters';
import type { Instructor } from '../../src/types';

describe('instructor price sorting', () => {
  const canonicalCheap = { pricePerHour: 90, pricePerHourKZT: 25_000 } as Instructor;
  const canonicalExpensive = { pricePerHour: 60, pricePerHourKZT: 30_000 } as Instructor;
  const missingKzt = { pricePerHour: 1, pricePerHourKZT: undefined } as Instructor;

  it('sorts by KZT even when legacy hourly rates conflict', () => {
    expect(compareInstructorPriceKzt(canonicalCheap, canonicalExpensive, 'priceAsc')).toBeLessThan(
      0
    );
    expect(
      compareInstructorPriceKzt(canonicalCheap, canonicalExpensive, 'priceDesc')
    ).toBeGreaterThan(0);
  });

  it('places missing KZT rates last instead of sorting by legacy values', () => {
    expect(compareInstructorPriceKzt(canonicalCheap, missingKzt, 'priceAsc')).toBeLessThan(0);
    expect(compareInstructorPriceKzt(missingKzt, canonicalCheap, 'priceDesc')).toBeGreaterThan(0);
  });
});
