import { mkdirSync, writeFileSync } from 'node:fs';
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
import {
  getCabinetSessionTitle,
  getMiniCalendarDaysFromSessions,
} from '../../src/features/course-enrollments/sessionScheduleHelpers';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';
import type { Booking } from '../../src/types';

vi.mock('../../src/features/settings/lessonLevelLogo', () => ({
  getLessonLevelLogoUrl: vi.fn(async () => 'https://example.invalid/logo.webp'),
}));
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
  it('renders logos and colors in all three tiles and keeps course titles independent', async () => {
    useLessonLevelsStore.setState({
      levels: DEFAULT_LESSON_LEVELS.map((level) =>
        level.id === 'advanced'
          ? {
              ...level,
              markerColor: '#123abc',
              logoStoragePath: 'lesson-levels/advanced/admin/12345678-1234-4123-8123-123456789abc',
              isActive: false,
            }
          : level
      ),
    });
    const common = {
      courses: [],
      instructors: [],
      usersList: [],
      onOpenLesson: vi.fn(),
      onOpenSession: vi.fn(),
    };
    const course = {
      kind: 'course_day',
      courseTitle: 'BASE course',
      courseId: 'course_base',
      courseDayId: 'day1',
      enrollmentId: 'enrollment1',
      date: '2099-01-02',
      time: '10:00',
      endTime: '11:00',
      timeZone: 'Asia/Almaty',
    } as CabinetSessionItem;
    const { container } = render(
      <LanguageProvider>
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
        <CurrentSessionsBlock {...common} sessions={[course]} />
      </LanguageProvider>
    );
    await act(async () => undefined);
    expect(container.querySelectorAll('img[src="https://example.invalid/logo.webp"]')).toHaveLength(
      3
    );
    expect(container.querySelectorAll('[data-lesson-marker-color="#123abc"]')).toHaveLength(3);
    expect(screen.getByText('BASE course').closest('article')!.querySelector('img')).toBeNull();
    const image = container.querySelector('img')!;
    fireEvent.error(image);
    expect(image).not.toBeInTheDocument();
    expect(container.textContent).toContain('🔴');
  });
  it('uses the same five rows, avatars only and discipline in every tile', () => {
    const lesson = { ...session, session: { ...session.session, discipline: 'ski' as const } };
    const participants = Array.from({ length: 9 }, (_, index) => ({
      participantId: `person-${index}`,
      displayName: `Participant ${index}`,
      avatarUrl: undefined,
    }));
    const common = {
      courses: [],
      instructors: [
        { id: 'coach', phoneNumber: '+77001234567' },
      ] as import('../../src/types').Instructor[],
      usersList: [],
      participantsBySessionKey: { 'lesson:booking_levels': participants },
      onOpenLesson: vi.fn(),
      onOpenSession: vi.fn(),
    };
    const { container } = render(
      <LanguageProvider>
        <div className="sc-dashboard">
          <div className="sc-dashboard-card" data-dashboard-tile="currentSessions">
            <CurrentSessionsBlock {...common} sessions={[lesson]} />
          </div>
          <SessionCountdownBlock
            {...common}
            dashboardSize="small"
            countdown={{ session: lesson, startsAt: new Date('2099-01-02T10:00:00Z') }}
          />
          <NextSessionBlock
            {...common}
            nextSessions={[{ session: lesson, dateStr: '2099-01-02' }]}
            miniDays={getMiniCalendarDaysFromSessions(
              [lesson],
              'ru',
              new Date('2099-01-02T10:00:00Z'),
              'Asia/Almaty'
            )}
            onGoToTab={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    const cards = container.querySelectorAll('.sc-session-card');
    expect(cards).toHaveLength(3);
    expect(container.querySelectorAll('.sc-next-session-day')).toHaveLength(7);
    for (const card of cards) {
      expect(Array.from(card.children).map((row) => row.className)).toEqual([
        'sc-session-card-heading',
        'sc-session-card-schedule',
        'sc-session-card-coaches',
        'sc-session-participants',
        'sc-session-card-actions',
      ]);
      expect(card.querySelector('.sc-session-card-discipline')).toHaveTextContent('Лыжи');
      expect(card.querySelector('ul')).not.toHaveTextContent('Participant');
      expect(card.querySelectorAll('ul .ui-avatar')).toHaveLength(4);
      expect(card.querySelector('ul')).toHaveTextContent('+5');
    }
    if (process.env.STUDENT_SESSION_VISUAL_DIR) {
      mkdirSync(process.env.STUDENT_SESSION_VISUAL_DIR, { recursive: true });
      writeFileSync(process.env.STUDENT_SESSION_VISUAL_DIR + '/tiles.html', container.innerHTML);
    }
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
