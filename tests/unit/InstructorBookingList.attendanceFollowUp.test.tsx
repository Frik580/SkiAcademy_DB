import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/booking-collaboration/bookingCollaborationStore', () => ({
  useBookingCollaborationStore: (select: (state: { participantAccess: Map<string, never> }) => unknown) =>
    select({ participantAccess: new Map() }),
}));

import { InstructorBookingList } from '../../src/features/instructor-workspace/components/InstructorBookingList';

const overdueBooking = {
  id: 'booking_overdue_ui_01',
  date: '2026-09-10',
  time: '12:00',
  participants: [{ participantId: 'participant_a', clientName: 'Anna' }],
  missingAttendanceCount: 1,
  attendanceFollowUp: 'overdue_admin_required' as const,
  participantIds: ['participant_a'],
};

const inWindowBooking = {
  ...overdueBooking,
  id: 'booking_in_window_ui_01',
  attendanceFollowUp: 'missing_in_window' as const,
};

function workspaceFor(input: {
  overdueBookings?: typeof overdueBooking[];
  missingInWindowBookings?: typeof inWindowBooking[];
}) {
  return {
    t: (key: string) => key,
    language: 'en',
    theme: 'light',
    displayedBookings: [],
    overdueBookings: input.overdueBookings ?? [],
    missingInWindowBookings: input.missingInWindowBookings ?? [],
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
    setSelectedChatBooking: vi.fn(),
    hasUnreadChat: () => false,
    markBookingChatRead: vi.fn(),
    handleUpdateStudentLevel: vi.fn(),
    openEvalModal: vi.fn(),
    usersList: [],
    instructors: [],
    instructorBookings: [],
  };
}

describe('InstructorBookingList attendance follow-up', () => {
  it('offers the attendance editor only while the instructor window is open', () => {
    render(
      <InstructorBookingList
        workspace={workspaceFor({ missingInWindowBookings: [inWindowBooking] }) as never}
        collaboration={{ setCreateProposalParty: vi.fn() } as never}
      />
    );
    expect(screen.getByText('instructorGoToAttendance')).toBeTruthy();
    expect(screen.getByText(/instructorAttendanceNotRecordedLessons/)).toBeTruthy();
    expect(screen.queryByText('instructorAttendanceAdminRequired')).toBeNull();
    expect(screen.queryByText('instructorViewLessonReadOnly')).toBeNull();
  });

  it('after +24h does not promise a write action and requires an administrator', () => {
    render(
      <InstructorBookingList
        workspace={workspaceFor({ overdueBookings: [overdueBooking] }) as never}
        collaboration={{ setCreateProposalParty: vi.fn() } as never}
      />
    );
    expect(screen.getByText(/instructorAttendanceOverdueLessons/)).toBeTruthy();
    expect(screen.getByText('instructorAttendanceAdminRequired')).toBeTruthy();
    expect(screen.getByText('instructorViewLessonReadOnly')).toBeTruthy();
    expect(screen.queryByText('instructorGoToAttendance')).toBeNull();
  });
});
