import React, { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLessonBookingSeason } from '@ski-academy/shared-domain';
import { BookingAppleDatePicker } from '../../src/features/bookings/components/booking_modal/BookingAppleDatePicker';
import { useLessonBookingSeason } from '../../src/features/lesson-bookings/useLessonBookingSeason';
import { translations } from '../../src/lib/i18n/translations';
import { ActiveSlotMoveForm } from '../../src/features/admin/components/schedule/slot-modal/ActiveSlotMoveForm';

const mock = vi.hoisted(() => ({
  school: {
    ready: true,
    timeZone: 'Pacific/Kiritimati',
    season: { kind: 'configured', startDate: '2026-12-01', endDate: '2027-04-15' },
  } as {
    ready: boolean;
    timeZone: string;
    season: ReturnType<typeof resolveLessonBookingSeason>;
  },
  language: 'ru' as 'ru' | 'en',
}));
vi.mock('../../src/features/settings/schoolTimeZone', () => ({
  useSchoolTimeZone: () => mock.school,
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: keyof typeof translations.en) => translations[mock.language][key],
    language: mock.language,
  }),
}));

describe('lesson season calendar UI', () => {
  it('preserves administrative past-date editing when no season is configured', () => {
    mock.school = { ...mock.school, season: resolveLessonBookingSeason(undefined) };
    const view = renderHook(() => useLessonBookingSeason(undefined, { allowPastDates: true }));
    expect(view.result.current.minDate).toBe('');
    expect(view.result.current.dateAllowed('2026-01-15')).toBe(true);
    expect(view.result.current.allows('2026-01-15', '09:00', 60)).toBe(true);
  });

  it('bounds administrative moves and keeps cancellation available when season rejects a move', () => {
    const view = render(
      <ActiveSlotMoveForm
        booking={{
          id: 'booking_admin_season',
          userId: 'client',
          instructorId: 'coach',
          instructorName: 'Coach',
          instructorAvatar: '',
          date: '2027-04-16',
          time: '09:00',
          durationHours: 1,
          totalPrice: 12000,
          status: 'confirmed',
        }}
        canReassignInstructor={false}
        canChangeDuration={false}
        canCompleteLesson={false}
        newInstructorId="coach"
        setNewInstructorId={vi.fn()}
        availableInstructors={[]}
        newMoveDate="2027-04-16"
        setNewMoveDate={vi.fn()}
        newMoveTime="09:00"
        setNewMoveTime={vi.fn()}
        newMoveDuration={1}
        setNewMoveDuration={vi.fn()}
        availableMoveTimeSlots={['09:00']}
        availableMoveDurations={[1]}
        isSlotActionSubmitting={false}
        onDeleteRequest={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        seasonMoveAllowed={false}
        minMoveDate="2026-12-01"
        maxMoveDate="2027-04-15"
        seasonMessage="Season range"
      />
    );
    expect(view.container.querySelector('input[type="date"]')).toHaveAttribute('min', '2026-12-01');
    expect(view.container.querySelector('input[type="date"]')).toHaveAttribute('max', '2027-04-15');
    expect(view.container.querySelector('button[type="submit"]')).toBeDisabled();
    expect(screen.getByRole('button', { name: translations.ru.deleteCancelBlock })).toBeEnabled();
  });

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    mock.language = 'ru';
    mock.school = {
      ready: true,
      timeZone: 'Pacific/Kiritimati',
      season: resolveLessonBookingSeason({ startDate: '2026-12-01', endDate: '2027-04-15' }),
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T12:30:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  });

  it('uses school today, checks the full interval, and presents RU/EN dates', () => {
    const view = renderHook(useLessonBookingSeason);
    expect(view.result.current.minDate).toBe('2026-12-01');
    expect(view.result.current.message).toBe(
      'Бронирование доступно только с 2026-12-01 по 2027-04-15'
    );
    expect(view.result.current.allows('2027-04-15', '22:30', 60)).toBe(true);
    expect(view.result.current.allows('2027-04-15', '23:30', 60)).toBe(false);
    mock.language = 'en';
    view.rerender();
    expect(view.result.current.message).toBe(
      'Booking is available only from 2026-12-01 to 2027-04-15'
    );
  });

  it('limits month/day wheels across New Year and clears an invalidated selection', () => {
    function Picker() {
      const season = useLessonBookingSeason();
      const [date, setDate] = useState('2026-12-20');
      return (
        <>
          <output aria-label="selected">{date}</output>
          <BookingAppleDatePicker
            value={date}
            onChange={setDate}
            min={season.minDate}
            max={season.maxDate}
            disabled={season.disabled}
            aria-label="Date"
          />
        </>
      );
    }
    const view = render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.queryByRole('button', { name: 'November', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2027', exact: true }));
    expect(screen.getByLabelText('selected')).toHaveTextContent('2027-04-15');
    expect(screen.queryByRole('button', { name: 'May', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '16', exact: true })).not.toBeInTheDocument();
    act(() => {
      mock.school = {
        ...mock.school,
        season: resolveLessonBookingSeason({ startDate: '2026-12-01', endDate: '2027-03-01' }),
      };
    });
    view.rerender(<Picker />);
    expect(screen.getByLabelText('selected')).toBeEmptyDOMElement();
  });

  it('disables malformed/expired season, preserving unconfigured behavior', () => {
    const view = renderHook(useLessonBookingSeason);
    mock.school = { ...mock.school, season: resolveLessonBookingSeason({}) };
    view.rerender();
    expect(view.result.current.disabled).toBe(true);
    expect(view.result.current.allows('2026-12-01', '09:00', 60)).toBe(false);
    mock.school = { ...mock.school, season: resolveLessonBookingSeason(undefined) };
    view.rerender();
    expect(view.result.current.allows('2027-08-01', '09:00', 60)).toBe(true);
    mock.school = {
      ...mock.school,
      season: resolveLessonBookingSeason({ startDate: '2026-01-01', endDate: '2026-04-15' }),
    };
    view.rerender();
    expect(view.result.current.disabled).toBe(true);
  });

  it('projects picker bounds into an existing occurrence zone after school timezone changes', () => {
    mock.school = {
      ready: true,
      timeZone: 'America/Los_Angeles',
      season: resolveLessonBookingSeason({ startDate: '2026-12-01', endDate: '2026-12-01' }),
    };
    const view = renderHook(() => useLessonBookingSeason('Asia/Almaty'));
    expect(view.result.current.maxDate).toBe('2026-12-02');
    expect(view.result.current.dateAllowed('2026-12-02')).toBe(true);
    expect(view.result.current.allows('2026-12-02', '08:00', 60, 'Asia/Almaty')).toBe(true);
    expect(view.result.current.allows('2026-12-02', '14:00', 60, 'Asia/Almaty')).toBe(false);
  });
});
