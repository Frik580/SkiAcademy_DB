import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextSessionBlock } from '../../src/features/student-cabinet/components/student/StudentTodaySessionBlocks';
import type { NextSessionBlockInput } from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import { getMiniCalendarDaysFromSessions } from '../../src/features/course-enrollments/sessionScheduleHelpers';
import { cabinetLessonTiming } from '../fixtures/cabinetLessonTiming';
import { translations } from '../../src/lib/i18n/translations';

const locale = vi.hoisted(() => ({ language: 'en' as 'en' | 'ru' }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: locale.language,
    t: (key: keyof typeof translations.en) => translations[locale.language][key],
  }),
}));
vi.mock('../../src/features/student-cabinet/components/LessonFeedbackIndicator', () => ({
  LessonFeedbackIndicator: ({ lessonBookingId }: { lessonBookingId: string }) => (
    <span data-feedback-id={lessonBookingId}>Feedback</span>
  ),
}));

function input(): NextSessionBlockInput {
  return {
    nextSessions: [
      {
        dateStr: '2026-10-31',
        session: {
          kind: 'lesson',
          session: {
            id: 'family',
            bookingId: 'family',
            revision: 1,
            status: 'confirmed',
            date: '2026-10-31',
            time: '10:00',
            durationHours: 1,
            ...cabinetLessonTiming('2026-10-31', '10:00', 1),
            instructorId: 'coach',
            instructorName: 'Actual coach',
            instructorAvatar: '',
            participantIds: ['a', 'b'],
            participantNames: ['Alice', 'Bob'],
            partyKind: 'family_group',
            payment: { kind: 'withheld' },
            bookingOrigin: 'account',
            isLessonBooking: true,
          },
        },
      },
    ],
    participantsBySessionKey: {
      'lesson:family': [
        { participantId: 'a', displayName: 'Alice', avatarUrl: '/alice.png' },
        { participantId: 'b', displayName: 'Bob' },
      ],
    },
    miniDays: getMiniCalendarDaysFromSessions(
      [],
      locale.language,
      new Date('2026-10-31T00:00:00Z')
    ),
    courses: [],
    instructors: [],
    usersList: [
      {
        uid: 'coach_user',
        instructorId: 'coach',
        phoneNumber: '+7 701 123 45 67',
      } as NextSessionBlockInput['usersList'][number],
    ],
    onGoToTab: vi.fn(),
    onOpenLesson: vi.fn(),
    onOpenSession: vi.fn(),
    hasUnreadChat: () => true,
  };
}

beforeEach(() => {
  locale.language = 'en';
});

describe('Next Session tile functional adaptation', () => {
  it('keeps four mixed sessions, repeated dates, long names and each navigation target', async () => {
    const props = input();
    const first = props.nextSessions[0];
    if (first.session.kind !== 'lesson') throw new Error('Expected lesson fixture');
    const course = {
      kind: 'course_day' as const,
      enrollmentId: 'enrollment',
      participantId: 'b',
      courseId: 'course',
      courseDayId: 'day',
      courseTitle: 'Family alpine course',
      date: first.dateStr,
      time: '12:00',
      endTime: '14:00',
      timeZone: 'Asia/Almaty',
      dayOrder: 1,
      lifecycleStatus: 'confirmed' as const,
      revision: 1,
      authorizedActions: { canRequestCancellation: false, canWithdraw: false },
    };
    props.nextSessions = [
      first,
      { dateStr: first.dateStr, session: course },
      ...['second', 'third'].map((id) => ({
        dateStr: first.dateStr,
        session: {
          kind: 'lesson' as const,
          session: {
            ...first.session.session,
            id,
            bookingId: id,
            instructorName: 'Александр Константинович Мухамеджанов — инструктор по горным лыжам',
          },
        },
      })),
    ];
    const longName = 'Александра Константиновна с длинным именем участника';
    props.participantsBySessionKey = {
      ...props.participantsBySessionKey,
      'lesson:second': [{ participantId: 'b', displayName: longName }],
    };
    props.onViewCourseDetails = vi.fn();
    render(<NextSessionBlock {...props} />);
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => card.dataset.sessionId)).toEqual([
      'lesson:family',
      'course_day:course:day',
      'lesson:second',
      'lesson:third',
    ]);
    expect(cards[2]).toHaveTextContent(longName);
    const user = userEvent.setup();
    for (const [index, id] of [
      [0, 'family'],
      [2, 'second'],
      [3, 'third'],
    ] as const) {
      await user.click(
        within(cards[index]).getByRole('button', { name: translations.en.scMoreDetails })
      );
      expect(props.onOpenLesson).toHaveBeenLastCalledWith(expect.objectContaining({ id }));
      await user.click(within(cards[index]).getByRole('button', { name: /Chat/ }));
      expect(props.onOpenSession).toHaveBeenLastCalledWith(expect.objectContaining({ id }));
      expect(within(cards[index]).getByRole('link', { name: 'Call coach' })).toHaveAttribute(
        'href',
        'tel:+77011234567'
      );
    }
    await user.click(within(cards[1]).getByRole('button', { name: translations.en.scMoreDetails }));
    expect(props.onViewCourseDetails).toHaveBeenCalledWith('course');
  });

  it('retains lesson details, unread chat, feedback ID, real phone and keyboard calendar action', async () => {
    const props = input();
    const user = userEvent.setup();
    render(<NextSessionBlock {...props} />);
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('data-session-id', 'lesson:family');
    expect(card).toHaveTextContent('10:00–11:00');
    expect(card).toHaveTextContent('Actual coach');
    expect(within(card).getByText('Alice')).toBeInTheDocument();
    expect(within(card).getByText('Bob')).toBeInTheDocument();
    expect(card.querySelector('img')).toHaveAttribute('src', '/alice.png');
    expect(card.querySelectorAll('[data-participant-avatar-face]')[1]).toHaveTextContent('B');
    expect(card.querySelector('[data-feedback-id]')).toHaveAttribute('data-feedback-id', 'family');
    await user.click(within(card).getByRole('button', { name: translations.en.scMoreDetails }));
    expect(props.onOpenLesson).toHaveBeenCalledWith(expect.objectContaining({ id: 'family' }));
    const chat = within(card).getByRole('button', { name: /Chat/ });
    expect(chat).toHaveAttribute('title', translations.en.chatNewMessages);
    expect(within(chat).getByLabelText(translations.en.chatNewMessages)).toBeInTheDocument();
    await user.click(chat);
    expect(props.onOpenSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'family' }));
    expect(within(card).getByRole('link', { name: 'Call coach' })).toHaveAttribute(
      'href',
      'tel:+77011234567'
    );
    const calendar = screen.getByRole('button', { name: translations.en.scFullCalendar });
    calendar.focus();
    await user.keyboard('{Enter}');
    expect(props.onGoToTab).toHaveBeenCalledTimes(1);
    expect(props.onGoToTab).toHaveBeenCalledWith('calendar');
  });

  it.each(['en', 'ru'] as const)(
    'renders actual informational dates and cross-month label in %s',
    (language) => {
      locale.language = language;
      render(<NextSessionBlock {...input()} />);
      expect(screen.queryByText(translations[language].scBookedSessionSchedule)).not.toBeInTheDocument();
      expect(document.querySelectorAll('.sc-next-session-day')).toHaveLength(7);
      expect(document.querySelector('[aria-current="date"]')).toHaveTextContent('31');
      expect(document.querySelector('.sc-next-session-month')).toHaveTextContent(
        language === 'en' ? 'October 2026 · November 2026' : 'октябрь 2026 г. · ноябрь 2026 г.'
      );
      expect(document.querySelector('.sc-next-session-weekday')).toHaveTextContent(
        language === 'en' ? 'Sat' : 'сб'
      );
      expect(document.querySelector('.sc-next-session-days button')).toBeNull();
      expect(document.querySelector('[data-upcoming]')).toHaveTextContent('31');
    }
  );

  it('keeps graceful empty state, informational dates and calendar navigation', () => {
    render(<NextSessionBlock {...input()} nextSessions={[]} />);
    expect(screen.getByText(translations.en.scNoUpcomingSession)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(document.querySelectorAll('.sc-next-session-day')).toHaveLength(7);
  });

  it('omits unavailable phone without losing lesson actions or title', () => {
    render(<NextSessionBlock {...input()} usersList={[]} />);
    expect(screen.queryByRole('link', { name: 'Call coach' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.en.scMoreDetails })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('passes courseId alone and never exposes lesson actions on course cards', async () => {
    const props = input();
    const details = vi.fn();
    render(
      <NextSessionBlock
        {...props}
        onViewCourseDetails={details}
        nextSessions={[
          {
            dateStr: '2026-11-01',
            session: {
              kind: 'course_day',
              enrollmentId: 'a_enrollment',
              participantId: 'a',
              participantName: 'Alice',
              courseId: 'course',
              courseDayId: 'day',
              courseTitle: 'Actual course',
              date: '2026-11-01',
              time: '12:00',
              endTime: '14:00',
              timeZone: 'Asia/Almaty',
              dayOrder: 1,
              lifecycleStatus: 'confirmed',
              revision: 1,
              authorizedActions: { canRequestCancellation: false, canWithdraw: false },
            },
          },
        ]}
      />
    );
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('data-session-id', 'course_day:course:day');
    expect(card).toHaveTextContent('12:00–14:00');
    expect(within(card).queryByRole('button', { name: /Chat/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(
      within(card).getByRole('button', { name: translations.en.scMoreDetails })
    );
    expect(details).toHaveBeenCalledWith('course');
    expect(details.mock.calls[0]).toHaveLength(1);
  });
});
