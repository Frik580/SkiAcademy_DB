import { describe, expect, it } from 'vitest';
import {
  normalizeTelHref,
  resolveBookingCoachPhone,
  resolveInstructorPhone,
} from '../../src/features/profile/components/personal_cabinet/student/coachUtils';
import { Booking, Course, UserProfile } from '../../src/types';

const usersList: UserProfile[] = [
  {
    uid: 'coach-user',
    email: 'coach@example.com',
    displayName: 'Coach',
    role: 'user',
    avatarUrl: '',
    balanceUSD: 0,
    instructorId: 'ins-1',
    phoneNumber: '+7 999 111-22-33',
  },
  {
    uid: 'coach-2',
    email: 'coach2@example.com',
    displayName: 'Coach Two',
    role: 'user',
    avatarUrl: '',
    balanceUSD: 0,
    instructorId: 'ins-2',
    phoneNumber: '+7 999 444-55-66',
  },
];

const lesson = (overrides: Partial<Booking>): Booking => ({
  id: 'b1',
  userId: 'user-1',
  instructorId: 'ins-1',
  instructorName: 'Coach',
  instructorAvatar: '',
  date: '2026-08-03',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'intermediate',
  ...overrides,
});

describe('coach phone helpers', () => {
  it('resolves instructor phone from linked user profile', () => {
    expect(resolveInstructorPhone('ins-1', usersList)).toBe('+7 999 111-22-33');
  });

  it('resolves course coach phone from course instructor ids', () => {
    const courses: Course[] = [
      {
        id: 'c1',
        title: 'Course',
        level: 'beginner',
        dates: 'August 1, 2026',
        duration: '1 day',
        description: '',
        totalSeats: 10,
        availableSeats: 5,
        price: 100,
        bgImageUrl: '',
        instructorIds: ['ins-2', 'ins-1'],
      },
    ];
    const booking = lesson({ instructorId: 'course_c1' });

    expect(resolveBookingCoachPhone(booking, courses, usersList)).toBe('+7 999 444-55-66');
  });

  it('builds tel href without spaces', () => {
    expect(normalizeTelHref('+7 999 111-22-33')).toBe('tel:+79991112233');
  });
});
