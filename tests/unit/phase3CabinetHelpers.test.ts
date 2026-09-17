import { describe, expect, it } from 'vitest';
import {
  filterBookingsByScope,
  getRecommendedInstructors,
} from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import { Booking, Instructor, UserProfile } from '../../src/types';

const userProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 2,
};

describe('phase 3 cabinet helpers', () => {
  it('recommends instructors not yet trained with', () => {
    const instructors: Instructor[] = [
      {
        id: 'i1',
        name: 'A',
        specialty: 'ski',
        rating: 4,
        reviewsCount: 1,
        languages: ['English'],
        experienceYears: 5,
        bio: '',
        avatarUrl: '',
        pricePerHour: 50,
        isAvailable: true,
      },
      {
        id: 'i2',
        name: 'B',
        specialty: 'ski',
        rating: 5,
        reviewsCount: 10,
        languages: ['English'],
        experienceYears: 8,
        bio: '',
        avatarUrl: '',
        pricePerHour: 60,
        isAvailable: true,
      },
    ];
    const bookings: Booking[] = [
      {
        id: 'b1',
        userId: 'user-1',
        instructorId: 'i1',
        instructorName: 'A',
        instructorAvatar: '',
        date: '2026-07-01',
        time: '10:00',
        durationHours: 2,
        totalPrice: 100,
        status: 'completed',
        difficulty: 'intermediate',
      },
    ];
    const recommended = getRecommendedInstructors(userProfile, instructors, bookings, 1);
    expect(recommended[0]?.id).toBe('i2');
  });

  it('filters bookings by upcoming and past scope', () => {
    const now = new Date('2026-07-15T12:00:00');
    const bookings: Booking[] = [
      {
        id: 'b1',
        userId: 'user-1',
        instructorId: 'i1',
        instructorName: 'A',
        instructorAvatar: '',
        date: '2026-08-01',
        time: '10:00',
        durationHours: 2,
        totalPrice: 100,
        status: 'confirmed',
        difficulty: 'intermediate',
      },
      {
        id: 'b2',
        userId: 'user-1',
        instructorId: 'i1',
        instructorName: 'A',
        instructorAvatar: '',
        date: '2026-07-01',
        time: '10:00',
        durationHours: 2,
        totalPrice: 100,
        status: 'completed',
        difficulty: 'intermediate',
      },
    ];
    expect(filterBookingsByScope(bookings, 'upcoming', [], now)).toHaveLength(1);
    expect(filterBookingsByScope(bookings, 'past', [], now)).toHaveLength(1);
  });
});
