import { describe, expect, it } from 'vitest';
import { isStudentBooking, clearCancelledBookings } from '../../src/features/admin/clearStudentBookings';

describe('clearStudentBookings helpers', () => {
  it('includes student lessons, guest bookings, and course enrollments', () => {
    expect(isStudentBooking({ userId: 'user-1' })).toBe(true);
    expect(isStudentBooking({ userId: 'guest_123' })).toBe(true);
    expect(isStudentBooking({ userId: 'client_migrated_1' })).toBe(true);
  });

  it('excludes instructor schedule blocks', () => {
    expect(isStudentBooking({ userId: 'system_block_break' })).toBe(false);
    expect(isStudentBooking({ userId: 'system_block_day_off' })).toBe(false);
  });

  it('exports clearCancelledBookings function', () => {
    expect(typeof clearCancelledBookings).toBe('function');
  });
});
