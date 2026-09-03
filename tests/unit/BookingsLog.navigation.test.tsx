import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingsLog } from '../../src/features/admin';
import type { Booking, Instructor, UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  getBookingStatusLabel: (status: string) => status,
  formatLessonDifficultyOrUnspecified: (
    difficulty: string | undefined,
    _language: string,
    unspecified: string
  ) => difficulty ?? unspecified,
}));

const lesson: Booking = {
  id: 'booking_lesson_1',
  userId: 'user-1',
  instructorId: 'ins_1',
  instructorName: 'Anna',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 1.5,
  totalPrice: 200,
  status: 'confirmed',
  difficulty: 'intermediate',
};

const pendingCancellationLesson: Booking = {
  ...lesson,
  id: 'booking_lesson_cancel',
  status: 'pending_cancellation',
  cancellationReason: 'Schedule conflict',
};

const guestLesson: Booking = {
  ...lesson,
  id: 'booking_guest_1',
  userId: 'guest_1',
  isGuest: true,
  guestName: 'Guest Ski',
  status: 'pending',
};

const courseEnrollment: Booking = {
  id: 'enrollment_1',
  userId: 'user-1',
  instructorId: 'course_course-1',
  instructorName: 'Group Course',
  instructorAvatar: '',
  date: '2026-12-01',
  time: '09:00',
  durationHours: 0,
  totalPrice: 200,
  status: 'confirmed',
  courseId: 'course-1',
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

describe('BookingsLog monitor navigation', () => {
  const onOpenLesson = vi.fn();
  const onOpenEnrollment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens Lesson Admin from a confirmed lesson instead of completing or cancelling', async () => {
    render(
      <BookingsLog
        bookings={[lesson]}
        usersList={usersList}
        instructors={instructors}
        onOpenLesson={onOpenLesson}
        onOpenEnrollment={onOpenEnrollment}
      />
    );

    expect(screen.queryByRole('button', { name: 'completeBtn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cancel' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'openLessonDetail' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_lesson_1');
    expect(onOpenEnrollment).not.toHaveBeenCalled();
  });

  it('opens Lesson Admin cancellation detail for pending_cancellation', async () => {
    render(
      <BookingsLog
        bookings={[pendingCancellationLesson]}
        usersList={usersList}
        instructors={instructors}
        onOpenLesson={onOpenLesson}
        onOpenEnrollment={onOpenEnrollment}
      />
    );

    expect(screen.queryByRole('button', { name: 'approveCancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'decline' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'openCancellationDetail' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_lesson_cancel');
  });

  it('keeps guest badge and Link client CTA that opens Lesson Admin', async () => {
    render(
      <BookingsLog
        bookings={[guestLesson]}
        usersList={usersList}
        instructors={instructors}
        onOpenLesson={onOpenLesson}
        onOpenEnrollment={onOpenEnrollment}
      />
    );

    expect(screen.getByText('guestBadge')).toBeInTheDocument();
    expect(screen.getByText('Guest Ski')).toBeInTheDocument();
    expect(screen.getByText('paymentDrivenGuestConfirmation')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'linkToClientBtn' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_guest_1');
    expect(onOpenEnrollment).not.toHaveBeenCalled();
  });

  it('opens course enrollment detail instead of mutating a course row', async () => {
    render(
      <BookingsLog
        bookings={[courseEnrollment]}
        usersList={usersList}
        instructors={instructors}
        onOpenLesson={onOpenLesson}
        onOpenEnrollment={onOpenEnrollment}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'openEnrollmentAttendance' }));
    expect(onOpenEnrollment).toHaveBeenCalledWith('enrollment_1');
    expect(onOpenLesson).not.toHaveBeenCalled();
  });
});
