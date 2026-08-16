import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingsLog } from '../../src/features/admin/components/admin/BookingsLog';
import type { Booking, Instructor, UserProfile } from '../../src/types';

vi.mock('../../src/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  getBookingStatusLabel: (status: string) => status,
}));

const pendingCancellationBooking: Booking = {
  id: 'booking-course-1',
  userId: 'user-1',
  instructorId: 'course_course-1',
  instructorName: 'Group Course',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 2,
  totalPrice: 200,
  status: 'pending_cancellation',
  difficulty: 'intermediate',
  cancellationReason: 'Schedule conflict',
};

const usersList: UserProfile[] = [
  {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Alex Carter',
    role: 'user',
    avatarUrl: '',
    balanceUSD: 0,
  },
];

const instructors: Instructor[] = [];

describe('BookingsLog admin cancellation', () => {
  const onConfirmBooking = vi.fn();
  const onCancelBooking = vi.fn().mockResolvedValue(undefined);
  const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
    void onConfirm();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves a pending cancellation through onCancelBooking', async () => {
    render(
      <BookingsLog
        bookings={[pendingCancellationBooking]}
        usersList={usersList}
        instructors={instructors}
        onConfirmBooking={onConfirmBooking}
        onCancelBooking={onCancelBooking}
        onRequestConfirm={onRequestConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'approveCancel' }));

    expect(onRequestConfirm).toHaveBeenCalledWith('approveCancelConfirm', expect.any(Function));
    expect(onCancelBooking).toHaveBeenCalledWith('booking-course-1');
    expect(onConfirmBooking).not.toHaveBeenCalled();
  });

  it('cancels a confirmed booking immediately through onCancelBooking', async () => {
    render(
      <BookingsLog
        bookings={[
          { ...pendingCancellationBooking, status: 'confirmed', cancellationReason: undefined },
        ]}
        usersList={usersList}
        instructors={instructors}
        onConfirmBooking={onConfirmBooking}
        onCancelBooking={onCancelBooking}
        onRequestConfirm={onRequestConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'cancel' }));

    expect(onCancelBooking).toHaveBeenCalledWith('booking-course-1');
    expect(onRequestConfirm).not.toHaveBeenCalled();
  });
});
