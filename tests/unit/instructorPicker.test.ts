import { describe, expect, it } from 'vitest';
import { getInstructorPickerGroups } from '../../src/features/profile/components/personal_cabinet/student/studentCabinetUtils';
import { Booking, Instructor, UserProfile } from '../../src/types';

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

describe('getInstructorPickerGroups', () => {
  it('groups my instructors separately from others', () => {
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

    const groups = getInstructorPickerGroups(userProfile, bookings, instructors);
    expect(groups[0]?.id).toBe('my');
    expect(groups[0]?.instructors[0]?.id).toBe('ins-1');
    expect(groups.some((g) => g.instructors.some((i) => i.id === 'ins-2'))).toBe(true);
  });
});
