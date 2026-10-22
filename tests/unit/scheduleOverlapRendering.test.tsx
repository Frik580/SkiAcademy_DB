import { ScheduleTimetableCells } from '../../src/features/admin/components/schedule/ScheduleTimetableCells';
import React, { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { ScheduleCalendar } from '../../src/features/admin/components/schedule/ScheduleCalendar';
import type { Booking, Instructor, UserProfile } from '../../src/types';

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));
vi.mock('../../src/features/admin/components/schedule/ScheduleSlotActionModal', () => ({
  ScheduleSlotActionModal: forwardRef(function Modal(
    { activeSlot }: { activeSlot?: { booking?: { id: string } } },
    _ref
  ) {
    return <output data-testid="opened-booking">{activeSlot?.booking?.id}</output>;
  }),
}));
afterEach(cleanup);
const instructor = { id: 'coach', name: 'Coach', isAvailable: true } as Instructor;
const bookings: Booking[] = [
  {
    id: 'booking_a',
    userId: 'payer',
    instructorId: 'coach',
    date: '2026-10-22',
    time: '08:00',
    durationHours: 3,
    status: 'completed',
    guestName: 'child1, Tester-two, child3, child2',
  },
  {
    id: 'booking_b',
    userId: 'payer2',
    instructorId: 'coach',
    date: '2026-10-22',
    time: '10:00',
    durationHours: 2,
    status: 'completed',
    guestName: 'child2',
  },
] as Booking[];

describe('day and week calendar overlapping Booking rendering', () => {
  it.each(['day', 'week'] as const)(
    'renders both bookings and opens their own IDs in %s',
    (view) => {
      render(
        <LanguageProvider>
          <ScheduleCalendar
            instructors={[instructor]}
            bookings={bookings}
            courses={[]}
            usersList={[]}
            adminProfile={{ uid: 'admin' } as UserProfile}
            plannerDate="2026-10-22"
            plannerView={view}
            onCancelBooking={vi.fn()}
          />
        </LanguageProvider>
      );
      const desktop = screen.getByRole('table');
      expect(within(desktop).getByText('08:00 (3h)', { exact: false })).toBeTruthy();
      expect(within(desktop).getByText('10:00 (2h)', { exact: false })).toBeTruthy();
      fireEvent.click(within(desktop).getByText('child1, Tester-two, child3, child2'));
      expect(screen.getByTestId('opened-booking').textContent).toBe('booking_a');
      fireEvent.click(within(desktop).getByText('child2'));
      expect(screen.getByTestId('opened-booking').textContent).toBe('booking_b');
      // Mobile uses the same conflict list without the single-Booking-per-slot selector.
      const mobile = screen.getAllByTestId('schedule-conflict-day')[0]!;
      fireEvent.click(within(mobile).getByText('child2'));
      expect(screen.getByTestId('opened-booking').textContent).toBe('booking_b');
    }
  );
});

it.each([
  ['same start', ['08:00', '08:00'], [3, 2]],
  ['nested', ['08:00', '09:00'], [4, 1]],
  ['three overlaps', ['08:00', '09:00', '10:00'], [4, 3, 2]],
  ['adjacent sub-hour', ['08:00', '08:30'], [0.5, 0.5]],
] as const)(
  'renders each %s Booking once with its own click target',
  (_label, times, durations) => {
    const items = times.map((time, index) => ({
      ...bookings[0]!,
      id: `booking_${index}`,
      time,
      durationHours: durations[index]!,
      guestName: `Participant ${index}`,
    }));
    const onOpen = vi.fn();
    render(
      <LanguageProvider>
        <table>
          <tbody>
            <tr>
              <ScheduleTimetableCells
                instructor={instructor}
                instructors={[instructor]}
                selectedDate="2026-10-22"
                bookings={items}
                courses={[]}
                usersList={[]}
                onOpenSlot={onOpen}
                onDeleteSlot={vi.fn()}
              />
            </tr>
          </tbody>
        </table>
      </LanguageProvider>
    );
    for (const item of items) {
      const card = screen.getByText(item.guestName);
      fireEvent.click(card);
      expect(onOpen).toHaveBeenLastCalledWith(instructor, item.time, item);
    }
    expect(screen.getAllByText(/Participant [0-9]/)).toHaveLength(items.length);
  }
);

it('retains the Booking when a CourseDay covers its start', () => {
  const onOpen = vi.fn();
  render(
    <LanguageProvider>
      <table>
        <tbody>
          <tr>
            <ScheduleTimetableCells
              instructor={instructor}
              instructors={[instructor]}
              selectedDate="2026-10-22"
              bookings={bookings}
              courses={[
                {
                  id: 'course_day',
                  title: 'Group course',
                  dates: '22.10.2026, 08:00 - 11:00',
                  instructorIds: ['coach'],
                  availableSeats: 2,
                  totalSeats: 4,
                },
              ]}
              usersList={[]}
              onOpenSlot={onOpen}
              onDeleteSlot={vi.fn()}
            />
          </tr>
        </tbody>
      </table>
    </LanguageProvider>
  );
  expect(screen.getByText('Group course')).toBeTruthy();
  fireEvent.click(screen.getByText('child2'));
  expect(onOpen).toHaveBeenLastCalledWith(instructor, '10:00', bookings[1]);
});
