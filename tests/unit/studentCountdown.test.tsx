import { mkdirSync, writeFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionCountdownBlock } from '../../src/features/student-cabinet/components/student/StudentTodaySessionBlocks';
import type { SessionCountdownBlockInput } from '../../src/features/student-cabinet/components/student/studentCabinetContracts';
import { cabinetLessonTiming } from '../fixtures/cabinetLessonTiming';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru', t: (key: string) => key }),
}));
vi.mock('../../src/features/student-cabinet/components/LessonFeedbackIndicator', () => ({
  LessonFeedbackIndicator: () => null,
}));

function input(): SessionCountdownBlockInput {
  return {
    dashboardSize: 'small',
    countdown: {
      startsAt: new Date('2026-10-10T09:00:00Z'),
      session: {
        kind: 'lesson',
        session: {
          id: 'countdown-lesson',
          bookingId: 'countdown-lesson',
          revision: 1,
          status: 'confirmed',
          date: '2026-10-10',
          time: '14:00',
          durationHours: 1,
          ...cabinetLessonTiming('2026-10-10', '14:00', 1),
          instructorId: 'coach',
          instructorName: 'Арман',
          instructorAvatar: '',
          participantIds: ['alice', 'bob'],
          participantNames: ['Айгерим', 'Тимур'],
          participantDisplayNames: { alice: 'Айгерим', bob: 'Тимур' },
          partyKind: 'family_group',
          payment: { kind: 'withheld' },
          bookingOrigin: 'account',
          isLessonBooking: true,
        },
      },
    },
    participants: [
      { participantId: 'alice', displayName: 'Айгерим' },
      { participantId: 'bob', displayName: 'Тимур' },
    ],
    courses: [],
    instructors: [
      { id: 'coach', phoneNumber: '+77001234567' },
    ] as SessionCountdownBlockInput['instructors'],
    usersList: [],
    onExpire: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T07:36:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('countdown presentation preserves the existing lifecycle', () => {
  it('shows real people, coach and contact alongside the second-resolution countdown', () => {
    const { container } = render(<SessionCountdownBlock {...input()} />);
    expect(container.querySelector('[aria-live]')).toHaveTextContent('1ч 24м 00с');
    expect(screen.getByText('Арман')).toBeInTheDocument();
    expect(screen.getByText('Айгерим')).toBeInTheDocument();
    expect(screen.getByText('Тимур')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'tel:+77001234567');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    if (process.env.STUDENT_COUNTDOWN_VISUAL_DIR) {
      mkdirSync(process.env.STUDENT_COUNTDOWN_VISUAL_DIR, { recursive: true });
      writeFileSync(process.env.STUDENT_COUNTDOWN_VISUAL_DIR + '/tile.html', container.innerHTML);
    }
  });

  it('ticks once a second, does not restart on rerender and expires once without negative text', () => {
    const props = input();
    props.countdown.startsAt = new Date(Date.now() + 2000);
    const intervals = vi.spyOn(window, 'setInterval');
    const { container, rerender } = render(<SessionCountdownBlock {...props} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector('[aria-live]')).toHaveTextContent('0м 01с');
    rerender(<SessionCountdownBlock {...props} participants={[props.participants![1]]} />);
    expect(intervals).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(5000));
    expect(props.onExpire).toHaveBeenCalledTimes(1);
  });

  it('cleans up the interval on unmount', () => {
    const props = input();
    const { unmount } = render(<SessionCountdownBlock {...props} />);
    unmount();
    act(() => vi.advanceTimersByTime(24 * 3600 * 1000));
    expect(props.onExpire).not.toHaveBeenCalled();
  });

  it('preserves localized text and unit styling across the hour boundary and a rerender', () => {
    const props = input();
    props.countdown.startsAt = new Date(Date.now() + 3600000);
    const { container, rerender } = render(<SessionCountdownBlock {...props} />);
    expect(container.querySelector('[aria-live]')).toHaveTextContent('1ч 00м 00с');
    act(() => vi.advanceTimersByTime(1000));
    rerender(<SessionCountdownBlock {...props} participants={[props.participants![0]]} />);
    expect(container.querySelector('[aria-live]')).toHaveTextContent('59м 59с');
    expect(container.querySelector('.sc-countdown-unit')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector('[aria-live]')).toHaveTextContent('59м 58с');
  });

  it('omits contact when no real phone exists', () => {
    render(<SessionCountdownBlock {...input()} instructors={[]} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([0, -1000])('does not render at or beyond start (%s ms)', (offset) => {
    const props = input();
    props.countdown.startsAt = new Date(Date.now() + offset);
    const { container } = render(<SessionCountdownBlock {...props} />);
    expect(container).toBeEmptyDOMElement();
    expect(props.onExpire).not.toHaveBeenCalled();
  });
});
