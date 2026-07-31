import { describe, expect, it } from 'vitest';
import {
  getAvailableCourses,
  getEnrolledCourses,
  getMyInstructors,
} from '../../src/components/personal_cabinet/student/studentCabinetUtils';
import { Booking, Course, Instructor } from '../../src/types';

const userId = 'user-1';

const courses: Course[] = [
  {
    id: 'course-a',
    title: 'Course A',
    level: 'beginner',
    dates: '2026-08-01',
    price: 100,
    maxStudents: 10,
    isHidden: false,
  },
  {
    id: 'course-b',
    title: 'Course B',
    level: 'intermediate',
    dates: '2026-09-01',
    price: 120,
    maxStudents: 8,
    isHidden: false,
  },
];

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
  it('returns enrolled courses for the current user only', () => {
    const enrolled = getEnrolledCourses(bookings, courses, userId);
    expect(enrolled.map((c) => c.id)).toEqual(['course-a']);
  });

  it('returns available courses excluding enrolled ones', () => {
    const available = getAvailableCourses(bookings, courses, userId);
    expect(available.map((c) => c.id)).toEqual(['course-b']);
  });

  it('returns instructors the student trained with, most recent first', () => {
    const mine = getMyInstructors(bookings, instructors, userId);
    expect(mine.map((i) => i.id)).toEqual(['ins-1']);
  });
});
