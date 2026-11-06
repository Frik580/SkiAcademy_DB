import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Course, UserProfile } from '../../src/types';
import type { InstructorLessonBookingItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';
import {
  updateCanonicalParticipantProgress,
  refreshInstructorParticipantProgress,
} from '../../src/features/participant-progress/participantProgressService';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import { emptyParticipantProgressView } from '../../src/features/participant-progress/applyParticipantProgressToProfile';

vi.mock('../../src/features/participant-progress/participantProgressService', () => ({
  updateCanonicalParticipantProgress: vi.fn().mockResolvedValue(undefined),
  refreshInstructorParticipantProgress: vi.fn(),
}));

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
      avatarUrl: 'https://example.com/participant-avatar.jpg',
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
  it('retains explicit lesson-context read-only mode across progress reload', async () => {
    const id = 'participant_workspace_01';
    const value = emptyParticipantProgressView(id);
    useParticipantProgressStore.getState().setItems([value]);
    vi.mocked(refreshInstructorParticipantProgress).mockResolvedValue([value]);
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [],
      })
    );
    act(() => result.current.openEvalModal(id, 'Student', 1, undefined, undefined, true));
    expect(result.current.canAssessParticipant(id)).toBe(true);
    expect(result.current.evalModalState.readOnly).toBe(true);
    await act(async () => result.current.reloadEvalProgress());
    expect(result.current.evalModalState.readOnly).toBe(true);
    await expect(result.current.handleSaveStudentScores(id, {}, 1, {})).rejects.toThrow(
      'Open the participant assessment'
    );
  });
  it.each([
    { skillScores: { carving: 4 }, skillComments: { carving: 'Other instructor text' } },
    { skillScores: { other: 4 }, skillComments: { other: 'Different skill text' } },
    { skillScores: { carving: 0 }, skillComments: {} },
    { skillScores: {}, skillComments: { carving: 'Comment-only update' } },
  ])('keeps the editing revision across store updates: %j', async (newValues) => {
    const id = 'participant_workspace_01';
    const initial = {
      ...emptyParticipantProgressView(id),
      revision: 7,
      skillComments: { carving: 'Original' },
    };
    useParticipantProgressStore.getState().setItems([initial]);
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [],
      })
    );
    act(() =>
      result.current.openEvalModal(id, 'Student', 1, initial.skillScores, initial.skillComments)
    );
    act(() =>
      useParticipantProgressStore.getState().setItems([{ ...initial, revision: 8, ...newValues }])
    );
    await act(async () =>
      result.current.handleSaveStudentScores(id, { carving: 5 }, 1, { carving: 'Old form edit' })
    );
    expect(updateCanonicalParticipantProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 7, skillComments: { carving: 'Old form edit' } })
    );
  });
  it('rebases only after explicit reload and does not restore a deleted comment', async () => {
    const id = 'participant_workspace_01';
    const initial = {
      ...emptyParticipantProgressView(id),
      revision: 3,
      skillComments: { carving: 'Deleted remotely' },
    };
    useParticipantProgressStore.getState().setItems([initial]);
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [],
      })
    );
    act(() => result.current.openEvalModal(id, 'Student', 1));
    const fresh = { ...initial, revision: 4, skillComments: {} };
    vi.mocked(refreshInstructorParticipantProgress).mockImplementationOnce(async () => {
      useParticipantProgressStore.getState().setItems([fresh]);
      return [fresh];
    });
    expect(result.current.evalModalState.expectedRevision).toBe(3);
    await act(async () => result.current.reloadEvalProgress());
    expect(result.current.evalModalState).toMatchObject({
      expectedRevision: 4,
      existingComments: {},
    });
    await act(async () => result.current.handleSaveStudentScores(id, {}, 1, {}));
    expect(updateCanonicalParticipantProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 4, skillComments: {} })
    );
    act(() => result.current.closeEvalModal());
    await expect(result.current.handleSaveStudentScores(id, {}, 1, {})).rejects.toThrow(
      'Open the participant assessment'
    );
  });
  it('keeps saved text for zero-rated and unrated skills in the canonical command', async () => {
    useParticipantProgressStore
      .getState()
      .setItems([emptyParticipantProgressView('participant_workspace_01')]);
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [],
      })
    );
    act(() => result.current.openEvalModal('participant_workspace_01', 'Student', 1));
    await act(async () =>
      result.current.handleSaveStudentScores('participant_workspace_01', { carving: 0 }, 1, {
        carving: 'Zero note',
        unrated: 'Unrated note',
      })
    );
    expect(updateCanonicalParticipantProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        participantId: 'participant_workspace_01',
        skillComments: { carving: 'Zero note', unrated: 'Unrated note' },
      })
    );
  });
  afterEach(() => {
    act(() => useParticipantProgressStore.getState().clear());
    vi.useRealTimers();
  });

  it('uses canonical participant identity and avatar without account profiles', () => {
    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [individualBooking],
        reviews: [],
        courses,
        usersList: [],
      })
    );

    expect(result.current.displayedBookings).toHaveLength(1);
    expect(result.current.displayedBookings[0]?.id).toBe('booking_individual_01');
    expect(result.current.displayedBookings[0]).toMatchObject({
      clientName: 'Lesson Student',
      clientAvatar: 'https://example.com/participant-avatar.jpg',
    });
    expect(result.current.displayedBookings[0]?.participants).toHaveLength(2);
    expect(result.current.myStudents.map((student) => student.name)).toEqual([
      'Lesson Student',
      'Second Student',
    ]);
  });

  it('counts dashboard metrics by booking lifecycle, not participant rows', () => {
    const completedGroup = {
      ...individualBooking,
      bookingId: 'booking_completed_group',
      status: 'completed',
    } as InstructorLessonBookingItem;
    const noShow = {
      ...individualBooking,
      bookingId: 'booking_no_show_01',
      status: 'no_show',
      participants: [individualBooking.participants[0]!],
      participantIds: [individualBooking.participantIds[0]!],
    } as InstructorLessonBookingItem;
    const pending = {
      ...individualBooking,
      bookingId: 'booking_pending_metric',
      status: 'pending',
    } as InstructorLessonBookingItem;

    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [completedGroup, noShow, pending],
        reviews: [],
        courses,
        usersList: [],
      })
    );

    expect(result.current.stats.completed).toBe(1);
    expect(result.current.stats.noShow).toBe(1);
    expect(result.current.stats.occupied).toBe(2);
    expect(result.current.stats.pending).toBe(1);
    expect(result.current.stats.total).toBe(3);
    expect(
      result.current.myStudents.find(
        (student) => student.participantId === 'participant_workspace_01'
      )?.lessonsCount
    ).toBe(3);
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

    const sorted = [laterBooking, pastBooking, nextBooking, currentBooking]
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

  it('counts overdue attendance as action-required lessons, not missing participants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T18:00:00.000Z'));
    const overdueBooking = {
      ...individualBooking,
      bookingId: 'booking_overdue_01',
      status: 'confirmed',
      endsAtEpochMs: Date.parse('2026-09-10T12:00:00Z'),
      attendance: [
        {
          participantId: 'participant_workspace_01',
          authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
        },
        {
          participantId: 'participant_workspace_02',
          authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
        },
      ],
    } as InstructorLessonBookingItem;
    const recentMissing = {
      ...individualBooking,
      bookingId: 'booking_recent_missing',
      status: 'confirmed',
      endsAtEpochMs: Date.parse('2026-09-12T20:00:00Z'),
      attendance: [
        {
          participantId: 'participant_workspace_01',
          authorizedActions: { canRecordPresent: true, canRecordAbsent: true },
        },
      ],
    } as InstructorLessonBookingItem;

    const { result } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: [overdueBooking, recentMissing],
        reviews: [],
        courses,
        usersList: [],
      })
    );

    expect(result.current.overdueBookings).toHaveLength(1);
    expect(result.current.overdueBookings[0]?.id).toBe('booking_overdue_01');
    expect(result.current.overdueBookings[0]?.attendanceFollowUp).toBe('overdue_admin_required');
    expect(result.current.overdueBookings[0]?.missingAttendanceCount).toBe(2);
    expect(result.current.missingInWindowBookings).toHaveLength(1);
    expect(result.current.missingInWindowBookings[0]?.id).toBe('booking_recent_missing');
    expect(
      result.current.displayedBookings.find((booking) => booking.id === 'booking_overdue_01')
        ?.attendanceOverdue
    ).toBe(true);
    expect(
      result.current.displayedBookings.find((booking) => booking.id === 'booking_recent_missing')
        ?.attendanceOverdue
    ).toBe(false);
  });
});

it('lists confirmed future dependents and unlocks assessment at lesson start without a reload', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(individualBooking.startsAtEpochMs - 1000));
  const bookings = [individualBooking];
  try {
    const { result, unmount } = renderHook(() =>
      useInstructorWorkspace({
        userProfile,
        instructors: [],
        lessonBookings: bookings,
        reviews: [],
        courses,
        usersList: [],
      })
    );
    expect(result.current.myStudents).toHaveLength(2);
    expect(result.current.canAssessParticipant(individualBooking.participantIds[1]!)).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.canAssessParticipant(individualBooking.participantIds[1]!)).toBe(true);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
