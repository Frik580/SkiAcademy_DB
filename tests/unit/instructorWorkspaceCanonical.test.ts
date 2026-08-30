import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Booking, Course, UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/features/student-cabinet/useBookingChatUnread', () => ({
  useBookingChatUnread: () => ({
    hasUnreadChat: () => false,
    markBookingChatRead: vi.fn(),
  }),
}));

import { useInstructorWorkspace } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';

const instructorId = 'instructor_workspace_01';
const userProfile = {
  uid: 'account_workspace_01',
  instructorId,
  displayName: 'Coach',
} as UserProfile;

const individualBooking = {
  id: 'booking_individual_01',
  instructorId,
  userId: 'student_workspace_01',
  status: 'confirmed',
  date: '2026-02-01',
  time: '10:00',
  durationHours: 2,
  difficulty: 'beginner',
} as Booking;

const legacyCourseBooking = {
  id: 'booking_course_01',
  instructorId: `course_${'course_legacy_01'}`,
  userId: 'student_course_01',
  status: 'confirmed',
  date: '2026-02-02',
  time: '11:00',
  durationHours: 2,
  difficulty: 'beginner',
} as Booking;

const courses = [
  {
    id: 'course_legacy_01',
    instructorIds: [instructorId],
    title: 'Legacy Course',
  },
] as Course[];

describe('useInstructorWorkspace canonical lesson isolation', () => {
  it('keeps individual lesson bookings and ignores course_* legacy bookings', () => {
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        allBookings: [individualBooking, legacyCourseBooking],
        reviews: [],
        courses,
        usersList: [
          {
            uid: 'student_workspace_01',
            displayName: 'Lesson Student',
          } as UserProfile,
        ],
      })
    );

    expect(result.current.displayedBookings).toHaveLength(1);
    expect(result.current.displayedBookings[0]?.id).toBe('booking_individual_01');
    expect(result.current.displayedBookings[0]).toMatchObject({
      clientName: 'Lesson Student',
    });
  });
});
