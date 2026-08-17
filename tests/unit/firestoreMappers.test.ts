import { describe, expect, it } from 'vitest';
import { toBooking, toCourse, toNotification } from '../../src/infrastructure/firebase/firestoreMappers';

describe('Firestore mappers', () => {
  it('attaches the Firestore document id to booking and course domain models', () => {
    expect(toBooking('booking-1', { userId: 'user-1', status: 'confirmed' }).id).toBe('booking-1');
    expect(toCourse('course-1', { title: 'Carving basics', seatsAvailable: 4 }).id).toBe(
      'course-1'
    );
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
});
