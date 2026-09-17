import { describe, expect, it } from 'vitest';
import { getMyInstructors } from '../../src/features/student-cabinet/components/student/studentCabinetUtils';
import { Booking, Instructor } from '../../src/types';

const userId = 'user-1';

const instructors: Instructor[] = [
  {
    id: 'ins-1',
    name: 'Maria',
    avatarUrl: '',
    specialty: 'ski',
    languages: ['English'],
    pricePerHour: 50,
    isAvailable: true,
    rating: 5,
    reviewCount: 1,
  },
  {
    id: 'ins-2',
    name: 'Ivan',
    avatarUrl: '',
    specialty: 'ski',
    languages: ['Russian'],
    pricePerHour: 60,
    isAvailable: true,
    rating: 4,
    reviewCount: 2,
  },
];

const bookings: Booking[] = [
  {
    id: 'b1',
    userId,
    instructorId: 'course_course-a',
    instructorName: 'Course A',
    instructorAvatar: '',
    date: '2026-08-01',
    time: '10:00',
    durationHours: 2,
    totalPrice: 100,
    status: 'confirmed',
    difficulty: 'beginner',
  },
  {
    id: 'b2',
    userId,
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
  {
    id: 'b3',
    userId: 'other',
    instructorId: 'ins-2',
    instructorName: 'Ivan',
    instructorAvatar: '',
    date: '2026-07-10',
    time: '10:00',
    durationHours: 2,
    totalPrice: 100,
    status: 'completed',
    difficulty: 'intermediate',
  },
];

describe('phase 2 cabinet helpers', () => {
  it('returns instructors the student trained with, most recent first', () => {
    const mine = getMyInstructors(bookings, instructors, userId);
    expect(mine.map((i) => i.id)).toEqual(['ins-1']);
  });
});
