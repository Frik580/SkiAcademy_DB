import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Course, UserProfile } from '../../src/types';
import type { InstructorLessonBookingItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

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

import {
  compareInstructorLessonDisplayOrder,
  getInstructorLessonScheduleRank,
  useInstructorWorkspace,
} from '../../src/features/instructor-workspace/components/useInstructorWorkspace';

const instructorId = 'instructor_workspace_01';
const userProfile = {
  uid: 'account_workspace_01',
  instructorId,
  displayName: 'Coach',
} as UserProfile;

const individualBooking = {
  bookingId: 'booking_individual_01',
  revision: 1,
  instructorId,
  instructorName: 'Coach',
  status: 'confirmed',
  date: '2026-02-01',
  time: '10:00',
  durationHours: 2,
  startsAtEpochMs: Date.parse('2026-02-01T10:00:00Z'),
  endsAtEpochMs: Date.parse('2026-02-01T12:00:00Z'),
  difficulty: 'beginner',
  notes: '',
  participantIds: ['participant_workspace_01', 'participant_workspace_02'],
  participantNames: ['Lesson Student', 'Second Student'],
  participants: [
    {
      participantId: 'participant_workspace_01',
      displayName: 'Lesson Student',
      selfAccountId: 'student_workspace_01',
    },
    {
      participantId: 'participant_workspace_02',
      displayName: 'Second Student',
      selfAccountId: 'student_workspace_02',
    },
  ],
  partyKind: 'family_group',
  bookingOrigin: 'account',
  authorizedActions: {
    canRequestCancellation: false,
    canWithdrawCancellation: false,
    canReschedule: false,
    canCreateChangeRequest: true,
  },
} as InstructorLessonBookingItem;

const courses = [
  {
    id: 'course_legacy_01',
    instructorIds: [instructorId],
    title: 'Legacy Course',
  },
] as Course[];

describe('useInstructorWorkspace canonical lesson isolation', () => {
  it('maps canonical instructor lessons and self-managed participant accounts', () => {
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [
          {
            uid: 'student_workspace_01',
            displayName: 'Lesson Student',
          } as UserProfile,
          {
            uid: 'student_workspace_02',
            displayName: 'Second Student',
          } as UserProfile,
        ],
      })
    );

    expect(result.current.displayedBookings).toHaveLength(1);
    expect(result.current.displayedBookings[0]?.id).toBe('booking_individual_01');
    expect(result.current.displayedBookings[0]).toMatchObject({
      clientName: 'Lesson Student',
    });
    expect(result.current.displayedBookings[0]?.participants).toHaveLength(2);
    expect(result.current.myStudents.map((student) => student.name)).toEqual([
      'Lesson Student',
      'Second Student',
    ]);
  });

  it('preserves canonical authorizedActions on displayed bookings', () => {
    const pendingBooking = {
      ...individualBooking,
      bookingId: 'booking_pending_01',
      status: 'pending',
      authorizedActions: {
        canRequestCancellation: false,
        canWithdrawCancellation: false,
        canReschedule: false,
        canCreateChangeRequest: false,
      },
    } as InstructorLessonBookingItem;

    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking, pendingBooking],
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

    expect(
      result.current.displayedBookings.find((booking) => booking.id === 'booking_individual_01')
        ?.authorizedActions.canCreateChangeRequest
    ).toBe(true);
    expect(
      result.current.displayedBookings.find((booking) => booking.id === 'booking_pending_01')
        ?.authorizedActions.canCreateChangeRequest
    ).toBe(false);
  });

  it('sorts displayed bookings with the current lesson first, then upcoming by start time', () => {
    const nowMs = Date.parse('2026-02-01T11:00:00Z');
    const pastBooking = {
      ...individualBooking,
      bookingId: 'booking_past_01',
      date: '2026-01-31',
      time: '10:00',
      startsAtEpochMs: Date.parse('2026-01-31T10:00:00Z'),
      endsAtEpochMs: Date.parse('2026-01-31T12:00:00Z'),
    } as InstructorLessonBookingItem;
    const currentBooking = {
      ...individualBooking,
      bookingId: 'booking_current_01',
      date: '2026-02-01',
      time: '10:30',
      startsAtEpochMs: Date.parse('2026-02-01T10:30:00Z'),
      endsAtEpochMs: Date.parse('2026-02-01T11:30:00Z'),
    } as InstructorLessonBookingItem;
    const nextBooking = {
      ...individualBooking,
      bookingId: 'booking_next_01',
      date: '2026-02-01',
      time: '12:00',
      startsAtEpochMs: Date.parse('2026-02-01T12:00:00Z'),
      endsAtEpochMs: Date.parse('2026-02-01T13:00:00Z'),
    } as InstructorLessonBookingItem;
    const laterBooking = {
      ...individualBooking,
      bookingId: 'booking_later_01',
      date: '2026-02-02',
      time: '09:00',
      startsAtEpochMs: Date.parse('2026-02-02T09:00:00Z'),
      endsAtEpochMs: Date.parse('2026-02-02T10:00:00Z'),
    } as InstructorLessonBookingItem;

    const sorted = [
      laterBooking,
      pastBooking,
      nextBooking,
      currentBooking,
    ]
      .map((booking) => ({
        id: booking.bookingId,
        startsAtEpochMs: booking.startsAtEpochMs,
        endsAtEpochMs: booking.endsAtEpochMs,
      }))
      .sort((left, right) => compareInstructorLessonDisplayOrder(left, right, nowMs));

    expect(sorted.map((booking) => booking.id)).toEqual([
      'booking_current_01',
      'booking_next_01',
      'booking_later_01',
      'booking_past_01',
    ]);
    expect(getInstructorLessonScheduleRank(currentBooking, nowMs)).toBe(0);
    expect(getInstructorLessonScheduleRank(nextBooking, nowMs)).toBe(1);
    expect(getInstructorLessonScheduleRank(pastBooking, nowMs)).toBe(2);
  });
});
