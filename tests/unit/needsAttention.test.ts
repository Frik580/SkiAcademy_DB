import { describe, expect, it } from 'vitest';
import { getNeedsAttentionBookings } from '../../src/features/profile/components/personal_cabinet/student/studentCabinetUtils';
import { Booking, Review } from '../../src/types';

const userId = 'user-1';

const baseBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  userId,
  instructorId: 'instructor-1',
  instructorName: 'Maria',
  instructorAvatar: '',
  date: '2026-07-20',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'completed',
  difficulty: 'intermediate',
  ...overrides,
});

describe('getNeedsAttentionBookings', () => {
  it('returns completed lessons without a review', () => {
    const bookings = [baseBooking({ id: 'b1' })];
    const result = getNeedsAttentionBookings(bookings, [], [], userId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });

  it('excludes lessons that already have a review', () => {
    const bookings = [baseBooking({ id: 'b1' })];
    const reviews: Review[] = [
      {
        id: 'r1',
        userId,
        instructorId: 'instructor-1',
        bookingId: 'b1',
        date: '2026-07-20',
        rating: 5,
        comment: 'Great',
      },
    ];
    const result = getNeedsAttentionBookings(bookings, reviews, [], userId);
    expect(result).toHaveLength(0);
  });

  it('includes lessons with pending recommendations even when reviewed', () => {
    const bookings = [
      baseBooking({
        id: 'b1',
        recommendations: [{ id: 'rec-1', text: 'Practice turns' }],
        completedRecommendationIds: [],
      }),
    ];
    const reviews: Review[] = [
      {
        id: 'r1',
        userId,
        instructorId: 'instructor-1',
        bookingId: 'b1',
        date: '2026-07-20',
        rating: 5,
        comment: 'Great',
      },
    ];
    const result = getNeedsAttentionBookings(bookings, reviews, [], userId);
    expect(result).toHaveLength(1);
  });

  it('excludes dismissed review prompts', () => {
    const bookings = [baseBooking({ id: 'b1' })];
    const result = getNeedsAttentionBookings(bookings, [], ['b1'], userId);
    expect(result).toHaveLength(0);
  });

  it('sorts by date descending and respects limit', () => {
    const bookings = [
      baseBooking({ id: 'old', date: '2026-07-01' }),
      baseBooking({ id: 'mid', date: '2026-07-15' }),
      baseBooking({ id: 'new', date: '2026-07-28' }),
    ];
    const result = getNeedsAttentionBookings(bookings, [], [], userId, 2);
    expect(result.map((b) => b.id)).toEqual(['new', 'mid']);
  });

  it('ignores non-completed and other users bookings', () => {
    const bookings = [
      baseBooking({ id: 'b1', status: 'confirmed' }),
      baseBooking({ id: 'b2', userId: 'other-user' }),
      baseBooking({ id: 'b3', isDeleted: true }),
    ];
    const result = getNeedsAttentionBookings(bookings, [], [], userId);
    expect(result).toHaveLength(0);
  });
});
