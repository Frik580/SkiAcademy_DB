import { describe, expect, it } from 'vitest';
import { getRealtimeBookingsCutoff } from '../../src/features/bookings/bookingRealtimeService';

describe('getRealtimeBookingsCutoff', () => {
  it('uses a UTC calendar boundary at midnight', () => {
    expect(getRealtimeBookingsCutoff(new Date('2026-01-08T00:00:00.001Z'))).toBe('2026-01-01');
    expect(getRealtimeBookingsCutoff(new Date('2026-01-08T23:59:59.999Z'))).toBe('2026-01-01');
  });

  it('crosses month and year boundaries without changing the seven-day window', () => {
    expect(getRealtimeBookingsCutoff(new Date('2026-01-03T12:00:00Z'))).toBe('2025-12-27');
  });
});
