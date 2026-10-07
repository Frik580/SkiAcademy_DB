import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LESSON_LEVELS } from '@ski-academy/shared-domain';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import { useLessonLevelsStore } from '../../src/features/settings/lessonLevelsStore';
import {
  CurrentSessionsBlock,
  NextSessionBlock,
  SessionCountdownBlock,
} from '../../src/features/student-cabinet/components/student/StudentTodaySessionBlocks';
import { getDifficultyLabel } from '../../src/lib/i18n/bookingLabels';
import { getDifficultyShort } from '../../src/features/student-cabinet/components/student/studentSessionPresentation';
import { getRecentLessonTitle } from '../../src/features/student-cabinet/components/student/studentLessonPresentation';
import { getCabinetSessionTitle } from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';
import type { Booking } from '../../src/types';

vi.mock('../../src/features/student-cabinet/components/LessonFeedbackIndicator', () => ({
  LessonFeedbackIndicator: () => null,
}));
vi.mock('../../src/features/student-cabinet/components/student/BookingCallCoachButton', () => ({
  BookingCallCoachButton: () => null,
}));
const session: CabinetSessionItem = {
  kind: 'lesson',
  session: {
    id: 'booking_levels',
    bookingId: 'booking_levels',
    revision: 1,
    status: 'confirmed',
    difficulty: 'ADVANCED',
    date: '2099-01-02',
    time: '10:00',
    durationHours: 1,
    instructorId: 'coach',
    instructorName: 'Coach',
    instructorAvatar: '',
    participantIds: ['self'],
    participantDisplayNames: { self: 'Student' },
    participantNames: ['Student'],
    partyKind: 'individual',
    payment: { kind: 'withheld' },
    bookingOrigin: 'account',
    isLessonBooking: true,
  },
};
function SwitchLanguage() {
  const { setLanguage } = useLanguage();
  return <button onClick={() => setLanguage('en')}>English</button>;
}
beforeEach(() => {
  localStorage.setItem('alpine_glide_lang', 'ru');
  useLessonLevelsStore.setState({
    levels: DEFAULT_LESSON_LEVELS,
    revision: 0,
    loaded: true,
    error: false,
  });
});
afterEach(cleanup);
describe('Student Cabinet lesson levels', () => {
  it('uses one label for current, countdown and next session, with live rename and language switch', () => {
    const common = {
      courses: [],
      instructors: [],
      usersList: [],
      onOpenLesson: vi.fn(),
      onOpenSession: vi.fn(),
    };
    render(
      <LanguageProvider>
        <SwitchLanguage />
        <CurrentSessionsBlock {...common} sessions={[session]} />
        <SessionCountdownBlock
          {...common}
          countdown={{ session, startsAt: new Date('2099-01-02T10:00:00Z') }}
        />
        <NextSessionBlock
          {...common}
          nextSessions={[{ session, dateStr: '2099-01-02' }]}
          miniDays={[]}
          onGoToTab={vi.fn()}
        />
      </LanguageProvider>
    );
    expect(screen.getAllByText('🔴 Продвинутый')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getAllByText('🔴 Advanced')).toHaveLength(3);
    act(() =>
      useLessonLevelsStore.setState({
        levels: DEFAULT_LESSON_LEVELS.map((level) =>
          level.id === 'advanced' ? { ...level, nameEn: 'Expert lesson', isActive: false } : level
        ),
        revision: 1,
      })
    );
    expect(screen.getAllByText('🔴 Expert lesson')).toHaveLength(3);
    expect(session.session.difficulty).toBe('ADVANCED');
  });
  it('uses the same formatter for list, details, history and recent lesson helpers', () => {
    const booking = { difficulty: 'ADVANCED', instructorId: 'coach' } as Booking;
    for (const language of ['ru', 'en'] as const) {
      const expected = language === 'ru' ? '🔴 Продвинутый' : '🔴 Advanced';
      expect(getDifficultyLabel(booking.difficulty!, language)).toBe(expected);
      expect(getDifficultyShort(booking.difficulty, language)).toBe(expected);
      expect(getRecentLessonTitle(booking, [], language)).toBe(expected);
      expect(getCabinetSessionTitle(session, language)).toBe(expected);
    }
  });
});
