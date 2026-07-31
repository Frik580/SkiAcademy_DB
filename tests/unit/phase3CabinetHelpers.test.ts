import { describe, expect, it } from 'vitest';
import {
  filterBookingsByScope,
  getRecommendedCourses,
  getRecommendedInstructors,
  getTrainingStreakWeeks,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { ActivityLog, Booking, Course, Instructor, UserProfile } from '../../src/types';

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
  it('counts consecutive training weeks', () => {
    const logs: ActivityLog[] = [
      {
        id: 'a1',
        userId: 'user-1',
        actorId: 'ins',
        type: 'booking_completed',
        timestamp: new Date().toISOString(),
      },
    ];
    expect(getTrainingStreakWeeks([], logs)).toBeGreaterThanOrEqual(1);
  });

  it('recommends courses for user level excluding enrolled', () => {
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Beginner',
        level: 'beginner',
        dates: '2026-08-01',
        duration: '3 days',
        description: '',
        totalSeats: 10,
        availableSeats: 5,
        price: 100,
        bgImageUrl: '',
      },
      {
        id: 'c2',
        title: 'Intermediate',
        level: 'intermediate',
        dates: '2026-09-01',
        duration: '3 days',
        description: '',
        totalSeats: 10,
        availableSeats: 3,
        price: 120,
        bgImageUrl: '',
      },
    ];
    const bookings: Booking[] = [];
    const recommended = getRecommendedCourses(userProfile, courses, bookings, 1);
    expect(recommended[0]?.level).toBe('intermediate');
  });

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
    expect(filterBookingsByScope(bookings, 'upcoming')).toHaveLength(1);
    expect(filterBookingsByScope(bookings, 'past')).toHaveLength(1);
  });
});
