import { describe, expect, it } from 'vitest';
import {
  buildHourLockIds,
  hasOverlappingAvailabilitySlot,
  slotsOverlap,
} from '../../src/domain/booking/slotOverlap';
import type { AvailabilitySlot } from '../../src/types';

const slot = (overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot => ({
  bookingId: 'booking-1',
  instructorId: 'instructor-1',
  date: '2026-12-15',
  time: '09:00',
  durationHours: 2,
  slotType: 'lesson',
  ...overrides,
});

describe('slotsOverlap', () => {
  it('detects partial overlap', () => {
    expect(
      slotsOverlap({ time: '10:00', durationHours: 2 }, { time: '09:00', durationHours: 2 })
    ).toBe(true);
  });

  it('allows adjacent slots that touch at the boundary', () => {
    expect(
      slotsOverlap({ time: '10:00', durationHours: 1 }, { time: '09:00', durationHours: 1 })
    ).toBe(false);
  });
});

describe('hasOverlappingAvailabilitySlot', () => {
  it('detects overlap with an existing availability slot', () => {
    expect(
      hasOverlappingAvailabilitySlot({ time: '10:00', durationHours: 2 }, [
        slot({ time: '09:00', durationHours: 2 }),
      ])
    ).toBe(true);
  });

  it('can exclude the booking being updated', () => {
    expect(
      hasOverlappingAvailabilitySlot(
        { time: '10:00', durationHours: 2 },
        [slot({ bookingId: 'booking-1', time: '10:00', durationHours: 2 })],
        'booking-1'
      )
    ).toBe(false);
  });
});

describe('buildHourLockIds', () => {
  it('creates one lock per booked hour', () => {
    expect(
      buildHourLockIds({
        instructorId: 'instructor-1',
        date: '2026-12-15',
        time: '10:00',
        durationHours: 2,
      })
    ).toEqual(['instructor-1__2026-12-15__10:00', 'instructor-1__2026-12-15__11:00']);
  });
});
