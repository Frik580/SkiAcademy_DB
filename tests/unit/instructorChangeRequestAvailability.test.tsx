import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { InstructorCollaborationPanel } from '../../src/features/booking-collaboration/components/InstructorCollaborationPanel';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

describe('instructor change request availability', () => {
  it('shows create change request only when callback is provided from authorizedActions', () => {
    const { rerender } = render(
      <InstructorCollaborationPanel
        proposals={[]}
        changeRequests={[]}
        bookingId="booking_confirmed_01"
        participantId="participant_01"
        onWithdrawProposal={vi.fn()}
        onCreateChangeRequest={vi.fn()}
        onWithdrawChangeRequest={vi.fn()}
      />
    );

    expect(screen.getByText('collabChangeRequestOpen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('collabChangeRequestReasonPlaceholder')).toBeInTheDocument();
    expect(screen.getByText('collabCreateChangeRequest')).toBeInTheDocument();

    rerender(
      <InstructorCollaborationPanel
        proposals={[]}
        changeRequests={[]}
        bookingId="booking_pending_01"
        participantId="participant_01"
        onWithdrawProposal={vi.fn()}
        onWithdrawChangeRequest={vi.fn()}
      />
    );

    expect(screen.queryByText('collabChangeRequestOpen')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('collabChangeRequestReasonPlaceholder')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('collabCreateChangeRequest')).not.toBeInTheDocument();
  });
});
