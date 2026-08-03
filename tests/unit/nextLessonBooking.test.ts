import { describe, expect, it } from 'vitest';
import { resolveNextLessonBookingTarget } from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { Booking, Course, Instructor, UserProfile } from '../../src/types';

const userProfile: UserProfile = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Student',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  level: 2,
};

const instructors: Instructor[] = [
  {
    id: 'ins-1',
    name: 'Maria',
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
  {
    id: 'ins-2',
    name: 'Ivan',
    specialty: 'ski',
    rating: 4,
    reviewsCount: 2,
    languages: ['Russian'],
    experienceYears: 5,
    bio: '',
    avatarUrl: '',
    pricePerHour: 50,
    isAvailable: true,
  },
];

describe('resolveNextLessonBookingTarget', () => {
  it('prefers the most recent available instructor', () => {
    const bookings: Booking[] = [
      {
        id: 'b1',
        userId: 'user-1',
        instructorId: 'ins-1',
        instructorName: 'Maria',
        instructorAvatar: '',
        date: '2026-07-20',
        time: '10:00',
        durationHours: 2,
        totalPrice: 100,
        status: 'completed',
        difficulty: 'intermediate',
      },
    ];

    const target = resolveNextLessonBookingTarget(userProfile, bookings, [], instructors);
    expect(target.kind).toBe('instructor');
    if (target.kind === 'instructor') expect(target.instructor.id).toBe('ins-1');
  });

  it('falls back to a recommended course when no instructors are available', () => {
    const unavailable = instructors.map((i) => ({ ...i, isAvailable: false }));
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Course',
        level: 'intermediate',
        dates: 'August 10, 2026',
        duration: '1 day',
        description: '',
        totalSeats: 10,
        availableSeats: 3,
        price: 100,
        bgImageUrl: '',
      },
    ];

    const target = resolveNextLessonBookingTarget(userProfile, [], courses, unavailable);
    expect(target.kind).toBe('course');
    if (target.kind === 'course') expect(target.course.id).toBe('c1');
  });
});
