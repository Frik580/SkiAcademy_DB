import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CustomerProposalInbox } from '../../src/features/booking-collaboration/components/CustomerProposalInbox';
import { BookingCollaborationActions } from '../../src/features/booking-collaboration/components/BookingCollaborationActions';
import { ParticipantAccessControls } from '../../src/features/booking-collaboration/components/ParticipantAccessControls';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { ParticipantAccessCabinetItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

const booking = (
  actions: LessonBookingCabinetItem['authorizedActions']
): LessonBookingCabinetItem => ({
  id: 'booking_component_01',
  bookingId: 'booking_component_01',
  revision: 2,
  status: 'pending_cancellation',
  date: '2026-06-15',
  time: '08:00',
  durationHours: 2,
  instructorId: 'instructor_fixture_01',
  instructorName: 'Coach',
  instructorAvatar: '',
  participantNames: ['Student'],
  partyKind: 'individual',
  payment: { kind: 'withheld' },
  bookingOrigin: 'account',
  isLessonBooking: true,
  authorizedActions: actions,
});

const access = (
  actions: ParticipantAccessCabinetItem['authorizedActions']
): ParticipantAccessCabinetItem => ({
  participantId: 'participant_fixture_01',
  instructorId: 'instructor_fixture_01',
  participantDisplayName: 'Student',
  instructorDisplayName: 'Coach',
  authorizedActions: actions,
});

describe('booking collaboration components', () => {
  it('hides accept/decline when authorizedActions are false', () => {
    render(
      <CustomerProposalInbox
        proposals={[
          {
            proposalId: 'booking_proposal_component_01',
            revision: 1,
            participantId: 'participant_fixture_01',
            instructorId: 'instructor_fixture_01',
            participantDisplayName: 'Student',
            instructorDisplayName: 'Coach',
            date: '2026-06-15',
            time: '08:00',
            durationHours: 2,
            lifecycleStatus: 'open',
            lifecycleLabel: 'Open',
            authorizedActions: { canAccept: false, canDecline: false, canWithdraw: false },
          },
        ]}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />
    );
    expect(screen.queryByText('collabAcceptProposal')).not.toBeInTheDocument();
    expect(screen.queryByText('collabDeclineProposal')).not.toBeInTheDocument();
  });

  it('renders cancellation withdraw only from canWithdrawCancellation', () => {
    const { rerender } = render(
      <BookingCollaborationActions
        booking={booking({
          canRequestCancellation: false,
          canWithdrawCancellation: true,
          canReschedule: false,
        })}
        onWithdrawCancellation={vi.fn()}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByText('collabWithdrawCancellation')).toBeInTheDocument();
    rerender(
      <BookingCollaborationActions
        booking={booking({
          canRequestCancellation: false,
          canWithdrawCancellation: false,
          canReschedule: true,
        })}
        onWithdrawCancellation={vi.fn()}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.queryByText('collabWithdrawCancellation')).not.toBeInTheDocument();
    expect(screen.getByText('rescheduleBtn')).toBeInTheDocument();
  });

  it('shows relationship and block controls separately', () => {
    render(
      <ParticipantAccessControls
        access={access({
          canCreateRelationship: true,
          canRevokeRelationship: false,
          canBlock: true,
          canUnblock: false,
        })}
        scope="account_manager"
        onCreateRelationship={vi.fn()}
        onBlock={vi.fn()}
      />
    );
    expect(screen.getByText('collabRelationshipSection')).toBeInTheDocument();
    expect(screen.getByText('collabBlockSection')).toBeInTheDocument();
    expect(screen.getByText('collabCreateRelationship')).toBeInTheDocument();
    expect(screen.getByText('collabBlockInstructor')).toBeInTheDocument();
    expect(screen.queryByText('collabUnblockInstructor')).not.toBeInTheDocument();
  });
});
