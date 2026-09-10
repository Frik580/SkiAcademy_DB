import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CreateProposalModal } from '../../src/features/booking-collaboration/components/CreateProposalModal';
import { RescheduleBookingModal } from '../../src/features/booking-collaboration/components/RescheduleBookingModal';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('../../src/features/booking-collaboration/useRescheduleBookingAvailability', () => ({
  useRescheduleBookingAvailability: () => ({
    availableSlots: ['10:00', '11:00'],
    isLoadingBookings: false,
    occupancyLoadFailed: false,
  }),
}));

const booking: LessonBookingCabinetItem = {
  id: 'booking_reschedule_01',
  bookingId: 'booking_reschedule_01',
  revision: 2,
  status: 'confirmed',
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
};

describe('RescheduleBookingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders wheel pickers instead of native date/time inputs', () => {
    render(
      <RescheduleBookingModal
        booking={booking}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );

    expect(screen.queryByDisplayValue('2026-06-15')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('08:00')).not.toBeInTheDocument();
    expect(screen.getByText('collabRescheduleTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'selectDate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'collabSelectTime' })).toBeInTheDocument();
  });

  it('create proposal modal renders duration wheel picker', () => {
    render(
      <CreateProposalModal
        open
        instructorId="instructor_fixture_01"
        participants={[
          { participantId: 'student_01', label: 'Student', selectable: true },
        ]}
        defaultSelectedParticipantIds={['student_01']}
        defaultDate="2026-06-15"
        defaultTime="10:00"
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByRole('button', { name: 'durationHours' })).toBeInTheDocument();
  });

  it('unmounts when booking is cleared', () => {
    const { rerender } = render(
      <RescheduleBookingModal
        booking={booking}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );
    expect(screen.getByText('collabRescheduleTitle')).toBeInTheDocument();

    rerender(
      <RescheduleBookingModal
        booking={null}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );
    expect(screen.queryByText('collabRescheduleTitle')).not.toBeInTheDocument();
  });
});
