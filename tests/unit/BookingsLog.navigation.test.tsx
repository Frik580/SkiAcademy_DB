import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingsLog } from '../../src/features/admin';
import type { Booking, UserProfile } from '../../src/types';

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

function numberedLesson(index: number, overrides: Partial<Booking> = {}): Booking {
  return {
    ...lesson,
    id: `row_${index}`,
    guestName: `Skier ${String(index).padStart(2, '0')}`,
    date: `2026-01-${String(Math.min(index, 28)).padStart(2, '0')}`,
    ...overrides,
  };
}

describe('BookingsLog monitor navigation', () => {
  const onOpenLesson = vi.fn();
  const onOpenEnrollment = vi.fn();

  function renderLog(bookings: Booking[]) {
    return render(
      <BookingsLog
        bookings={bookings}
        usersList={usersList}
        onOpenLesson={onOpenLesson}
        onOpenEnrollment={onOpenEnrollment}
      />
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 15 incoming rows at once without pagination controls', () => {
    const bookings = Array.from({ length: 15 }, (_, index) => numberedLesson(index + 1));
    renderLog(bookings);

    for (let index = 1; index <= 15; index += 1) {
      expect(screen.getByText(`Skier ${String(index).padStart(2, '0')}`)).toBeInTheDocument();
    }
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(16);
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.queryByText('Load more bookings')).not.toBeInTheDocument();
  });

  it('renders incoming rows in source order without filter or sort UI', () => {
    const older = numberedLesson(1, { date: '2026-01-01', guestName: 'Older First' });
    const newer = numberedLesson(2, { date: '2026-12-31', guestName: 'Newer Second' });
    renderLog([older, newer]);

    expect(screen.queryByPlaceholderText('searchBookingsPlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('resetFilters')).not.toBeInTheDocument();
    expect(screen.queryByText('allStatuses')).not.toBeInTheDocument();

    const names = screen.getAllByText(/^(Older First|Newer Second)$/);
    expect(names.map((node) => node.textContent)).toEqual(['Older First', 'Newer Second']);
  });

  it('hides system_block rows and keeps the remaining incoming rows', () => {
    const visible = numberedLesson(1, { guestName: 'Visible Skier' });
    const hidden = numberedLesson(2, {
      id: 'system_block_row',
      userId: 'system_block_break',
      guestName: 'Hidden Block',
    });
    renderLog([hidden, visible]);

    expect(screen.getByText('Visible Skier')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Block')).not.toBeInTheDocument();
    expect(screen.queryByText('system_block_row')).not.toBeInTheDocument();
  });

  it('opens Lesson Admin from a confirmed lesson instead of completing or cancelling', async () => {
    renderLog([lesson]);

    expect(screen.queryByRole('button', { name: 'completeBtn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cancel' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'openLessonDetail' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_lesson_1');
    expect(onOpenEnrollment).not.toHaveBeenCalled();
  });

  it('opens Lesson Admin cancellation detail for pending_cancellation', async () => {
    renderLog([pendingCancellationLesson]);

    expect(screen.queryByRole('button', { name: 'approveCancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'decline' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'openCancellationDetail' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_lesson_cancel');
  });

  it('keeps guest badge and Link client CTA that opens Lesson Admin', async () => {
    renderLog([guestLesson]);

    expect(screen.getByText('guestBadge')).toBeInTheDocument();
    expect(screen.getByText('Guest Ski')).toBeInTheDocument();
    expect(screen.getByText('paymentDrivenGuestConfirmation')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'linkToClientBtn' }));
    expect(onOpenLesson).toHaveBeenCalledWith('booking_guest_1');
    expect(onOpenEnrollment).not.toHaveBeenCalled();
  });

  it('opens course enrollment detail instead of mutating a course row', async () => {
    renderLog([courseEnrollment]);

    await userEvent.click(screen.getByRole('button', { name: 'openEnrollmentAttendance' }));
    expect(onOpenEnrollment).toHaveBeenCalledWith('enrollment_1');
    expect(onOpenLesson).not.toHaveBeenCalled();
  });
});
