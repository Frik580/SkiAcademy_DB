import { describe, expect, it } from 'vitest';
import {
  toBooking,
  toCourse,
  toNotification,
  toUserProfile,
} from '../../src/infrastructure/firebase';

const validBooking = {
  userId: 'user-1',
  instructorId: 'instructor-1',
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: '2026-08-18',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed' as const,
  difficulty: 'beginner' as const,
};

const validCourse = {
  title: 'Carving basics',
  duration: '2 hours',
  description: 'Course description',
  dates: '2026-08-18',
  totalSeats: 10,
  availableSeats: 4,
  price: 100,
  bgImageUrl: '',
};

describe('Firestore mappers', () => {
  it('attaches the Firestore document id to booking and course domain models', () => {
    expect(toBooking('booking-1', validBooking)?.id).toBe('booking-1');
    expect(toCourse('course-1', validCourse)?.id).toBe('course-1');
  });

  it('keeps the Firestore document id separate from notification fields', () => {
    const notification = toNotification('notification-1', {
      userId: 'user-1',
      isRead: false,
      timestamp: '2026-08-17T00:00:00.000Z',
    });

    expect(notification.id).toBe('notification-1');
    expect(notification.userId).toBe('user-1');
  });

  it('skips incomplete or malformed booking, course, and user documents', () => {
    expect(toBooking('booking-invalid', { ...validBooking, durationHours: 0 })).toBeNull();
    expect(toCourse('course-invalid', { ...validCourse, availableSeats: '4' })).toBeNull();
    expect(
      toUserProfile(
        {
          uid: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          role: 'user',
          avatarUrl: '',
          balanceUSD: '100',
        },
        'user-1'
      )
    ).toBeNull();
  });

  it('preserves a valid user profile', () => {
    expect(
      toUserProfile(
        {
          uid: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          role: 'user',
          avatarUrl: '',
          balanceUSD: 100,
          dismissedReviewIds: ['booking-1'],
        },
        'user-1'
      )
    ).toMatchObject({ uid: 'user-1', balanceUSD: 100 });
  });
});
