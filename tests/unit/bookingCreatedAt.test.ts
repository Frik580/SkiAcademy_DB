import { describe, expect, it } from 'vitest';
import {
  formatBookingCreatedAt,
  inferBookingCreatedAtFromId,
  resolveBookingCreatedAt,
  withBookingCreatedAt,
} from '../../src/domain/booking';

describe('bookingCreatedAt', () => {
  it('infers createdAt from guest booking ids', () => {
    const createdAt = inferBookingCreatedAtFromId('guest_book_1700000000000_abc12');
    expect(createdAt?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('prefers stored createdAt over inferred id timestamp', () => {
    const resolved = resolveBookingCreatedAt({
      id: 'guest_book_1700000000000_abc12',
      createdAt: '2026-01-15T10:00:00.000Z',
    });
    expect(resolved?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('adds createdAt when writing new bookings', () => {
    const booking = withBookingCreatedAt({
      id: 'book_abc123',
      userId: 'user-1',
      instructorId: 'instructor-1',
      instructorName: 'Coach',
      instructorAvatar: '',
      date: '2026-08-10',
      time: '10:00',
      durationHours: 2,
      totalPrice: 100,
      status: 'confirmed',
      difficulty: 'beginner',
    });

    expect(booking.createdAt).toBeTruthy();
  });

  it('formats createdAt for display', () => {
    const formatted = formatBookingCreatedAt(
      { id: 'booking-1', createdAt: '2026-08-10T14:30:00.000Z' },
      'ru'
    );
    expect(formatted).toContain('2026');
  });
});
