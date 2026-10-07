import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LESSON_LEVELS } from '@ski-academy/shared-domain';
import { BookingSelectors } from '../../src/features/bookings/components/booking_modal/BookingSelectors';
import { useLessonLevelsStore } from '../../src/features/settings/lessonLevelsStore';
import { getDifficultyLabel } from '../../src/lib/i18n/bookingLabels';
import { getParticipantSkillLabel } from '../../src/lib/i18n/participantSkillLabels';

vi.mock('../../src/features/bookings/components/booking_modal/BookingAppleDatePicker', () => ({
  BookingAppleDatePicker: () => null,
}));
vi.mock('../../src/features/bookings/components/booking_modal/BookingAppleWheelPicker', () => ({
  BookingAppleWheelPicker: (props: {
    options: { value: string; label: string }[];
    'aria-label': string;
  }) => (
    <select aria-label={props['aria-label']}>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
beforeEach(() => useLessonLevelsStore.setState({ levels: DEFAULT_LESSON_LEVELS }));
afterEach(cleanup);
describe('lesson level selectors', () => {
  it('shows only active catalog IDs in admin order and updates names and new levels live', () => {
    render(
      <BookingSelectors
        date="2099-01-01"
        setDate={vi.fn()}
        time="10:00"
        setTime={vi.fn()}
        duration={1}
        setDuration={vi.fn()}
        difficulty="advanced"
        setDifficulty={vi.fn()}
        isLoadingBookings={false}
        availableSlots={['10:00']}
        minBookingDateStr="2099-01-01"
        t={(key) => key}
        language="ru"
        getDifficultyLabel={getDifficultyLabel}
      />
    );
    const select = screen.getByRole('combobox', { name: 'lessonStage' });
    expect([...select.querySelectorAll('option')].map((option) => option.value)).toEqual(
      DEFAULT_LESSON_LEVELS.map((level) => level.id)
    );
    const levels = DEFAULT_LESSON_LEVELS.map((level) =>
      level.id === 'advanced' ? { ...level, isActive: false, nameRu: 'Экспертный' } : level
    );
    act(() =>
      useLessonLevelsStore.setState({
        levels: [
          { id: 'race', nameRu: 'Гонки', nameEn: 'Race', marker: '🏁', order: 0, isActive: true },
          ...levels.map((level) => ({ ...level, order: level.order + 1 })),
        ],
      })
    );
    expect([...select.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'race',
      'beginner',
      'intermediate',
      'freeride',
      'freestyle',
    ]);
    expect(select.querySelector('option')).toHaveTextContent('🏁 Гонки');
    expect(getDifficultyLabel('ADVANCED', 'ru')).toBe('🔴 Экспертный');
    expect(getParticipantSkillLabel('advanced', 'ru')).toBe('Продвинутый');
    expect(getParticipantSkillLabel('ADVANCED', 'ru')).toBe('Продвинутый');
    expect(getParticipantSkillLabel('custom-skill', 'en')).toBe('custom-skill');
  });
});
