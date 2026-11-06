import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking, ChatMessage, Instructor, UserProfile } from '../../src/types';
import { translations } from '../../src/lib/i18n/translations';
import { useInstructorBookingMessages } from '../../src/features/student-cabinet/components/student/useInstructorBookingMessages';
import {
  StudentCoachPanel,
  type CoachNavigation,
} from '../../src/features/student-cabinet/components/student/StudentCoachPanel';

const fixture = vi.hoisted(() => ({
  language: 'en' as 'en' | 'ru',
  listeners: [] as {
    id: string;
    active: boolean;
    receive: (messages: ChatMessage[]) => void;
    fail: () => void;
  }[],
  homework: vi.fn(),
}));
vi.mock('../../src/features/chat', () => ({
  subscribeToChatMessages: (
    id: string,
    receive: (messages: ChatMessage[]) => void,
    fail: () => void
  ) => {
    const listener = { id, active: true, receive, fail };
    fixture.listeners.push(listener);
    return () => {
      listener.active = false;
    };
  },
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: fixture.language,
    t: (key: keyof typeof translations.en) => translations[fixture.language][key],
  }),
  translateInstructor: (instructor: Instructor) => instructor,
}));
vi.mock(
  '../../src/features/student-cabinet/components/student/useInstructorHomeworkHistory',
  () => ({
    useInstructorHomeworkHistory: (...args: unknown[]) => {
      fixture.homework(...args);
      return { messages: [], loading: false, error: false, hasMore: false };
    },
  })
);
vi.mock('../../src/features/student-cabinet/useSelectedParticipantLessonStats', () => ({
  useSelectedParticipantLessonStats: () => ({ evidence: [] }),
  instructorLessonCountFromEvidence: () => 0,
  latestAttendedLessonForInstructor: () => null,
}));
vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => ({
    participantId: 'child',
    instructorFeedback: () => [],
  }),
}));
vi.mock('../../src/features/profile', () => ({ InstructorCard: () => null }));
vi.mock('../../src/features/booking-collaboration', () => ({
  CoachParticipantAccessPanel: () => null,
}));
vi.mock('../../src/features/bookings/components/booking_chat/ChatMedia', () => ({
  ChatMedia: ({ value, name }: { value: string; name: string }) => <a href={value}>{name}</a>,
}));

const bookings = Array.from({ length: 3 }, (_, i) => ({
  id: `lesson-${i}`,
  userId: 'account',
  instructorId: 'coach',
  status: 'completed',
  date: '2026-01-01',
  time: '10:00',
})) as Booking[];
const onChat = vi.fn();
function panel(
  view: CoachNavigation['view'],
  participant = 'child',
  instructor = 'coach',
  rows = bookings
) {
  return (
    <StudentCoachPanel
      navigation={{ view, selectedInstructorId: view === 'list' ? null : instructor }}
      bookings={rows}
      courses={[]}
      instructors={
        [
          { id: 'coach', name: 'Coach' },
          { id: 'other', name: 'Other' },
        ] as Instructor[]
      }
      userProfile={{ uid: 'account', skillComments: { balance: 'Current comment' } } as UserProfile}
      selectedParticipantId={participant}
      onGoToTab={vi.fn()}
      onChat={onChat}
      onOpenLesson={vi.fn()}
      onBookInstructor={vi.fn()}
    />
  );
}
const active = () => fixture.listeners.filter((listener) => listener.active);
const video = (id = 'video'): ChatMessage =>
  ({
    id,
    bookingId: 'lesson-0',
    senderName: 'Coach',
    senderInstructorId: 'coach',
    timestamp: '2026-01-01T12:00:00.000Z',
    text: id,
    attachmentType: 'video',
    attachmentUrl: 'https://example.com/video',
    attachmentName: 'Review',
  }) as ChatMessage;

beforeEach(() => {
  fixture.listeners = [];
  fixture.language = 'en';
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('coach subscription measurements (three lesson threads)', () => {
  it.each([
    ['list', 0],
    ['chat', 0],
    ['videos', 3],
    ['comments', 0],
    ['homework', 0],
    ['recommendations', 0],
  ] as const)('%s: active ordinary-message listeners = %i', (view, count) => {
    const { unmount } = render(panel(view));
    expect(active()).toHaveLength(count);
    expect(fixture.listeners).toHaveLength(count);
    expect(fixture.homework.mock.lastCall?.[2]).toBe(view === 'homework');
    unmount();
    expect(active()).toHaveLength(0);
  });

  it('opens the selected full chat using the original booking', () => {
    render(panel('chat'));
    fireEvent.click(screen.getByRole('button', { name: translations.en.scCoachOpenChat }));
    expect(onChat).toHaveBeenCalledWith(bookings[0]);
  });

  it.each(['ru', 'en'] as const)('renders live video text and attachments (%s)', (language) => {
    fixture.language = language;
    render(panel('videos'));
    act(() =>
      active().forEach((listener) => listener.receive(listener.id === 'lesson-0' ? [video()] : []))
    );
    expect(screen.getByText('video')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe(
      'https://example.com/video'
    );
    act(() => active()[0].receive([video('new video')]));
    expect(screen.getByText('new video')).toBeTruthy();
    expect(screen.queryByText('video')).toBeNull();
  });

  it('releases listeners across rapid navigation, returning, unmounting and reopening', () => {
    const { rerender, unmount } = render(panel('videos'));
    act(() =>
      active().forEach((listener) => listener.receive(listener.id === 'lesson-0' ? [video()] : []))
    );
    const old = active();
    for (const view of ['chat', 'comments', 'homework', 'recommendations', 'list'] as const) {
      rerender(panel(view));
      expect(active()).toHaveLength(0);
    }
    expect(screen.queryByText('video')).toBeNull();
    rerender(panel('comments'));
    expect(screen.getByText(/Current comment/)).toBeTruthy();
    rerender(panel('videos'));
    expect(active()).toHaveLength(3);
    act(() => old.forEach((listener) => listener.receive([video('stale')])));
    expect(screen.queryByText('stale')).toBeNull();
    unmount();
    expect(active()).toHaveLength(0);
    render(panel('videos'));
    expect(active()).toHaveLength(3);
    expect(screen.queryByText('video')).toBeNull();
  });

  it('cleans up instructor and Participant scopes, including a shared lesson', () => {
    const otherRows = [{ ...bookings[0], id: 'other-lesson', instructorId: 'other' }] as Booking[];
    const { rerender } = render(panel('videos'));
    const first = active();
    act(() =>
      first.forEach((listener) => listener.receive(listener.id === 'lesson-0' ? [video()] : []))
    );
    rerender(panel('videos', 'sibling'));
    expect(first.every((listener) => !listener.active)).toBe(true);
    expect(active()).toHaveLength(3);
    expect(screen.queryByText('video')).toBeNull();
    const second = active();
    rerender(panel('videos', 'sibling', 'other', otherRows));
    expect(second.every((listener) => !listener.active)).toBe(true);
    expect(active().map((listener) => listener.id)).toEqual(['other-lesson']);
    act(() => [...first, ...second].forEach((listener) => listener.receive([video('stale')])));
    expect(screen.queryByText('stale')).toBeNull();
  });

  it.each(['ru', 'en'] as const)('settles errors and offers a working retry (%s)', (language) => {
    fixture.language = language;
    render(panel('videos'));
    const failed = active();
    act(() => failed.forEach((listener) => listener.fail()));
    expect(screen.getByRole('alert')).toHaveTextContent(translations[language].requestFailed);
    expect(screen.queryByText(translations[language].loading)).toBeNull();
    expect(screen.queryByText(translations[language].scCoachNoVideos)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: translations[language].retry }));
    expect(failed.every((listener) => !listener.active)).toBe(true);
    expect(active()).toHaveLength(3);
    act(() =>
      active().forEach((listener) => listener.receive(listener.id === 'lesson-0' ? [video()] : []))
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('video')).toBeTruthy();
  });

  it('does not fan out with 200 lessons outside videos; StrictMode leaves one listener per thread', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...bookings[0], id: `lesson-${i}` }));
    const { rerender, unmount } = render(
      <StrictMode>{panel('chat', 'child', 'coach', many)}</StrictMode>
    );
    expect(fixture.listeners).toHaveLength(0);
    rerender(<StrictMode>{panel('videos', 'child', 'coach', many)}</StrictMode>);
    expect(active()).toHaveLength(200);
    rerender(<StrictMode>{panel('videos', 'child', 'coach', [...many].reverse())}</StrictMode>);
    expect(fixture.listeners).toHaveLength(200);
    unmount();
    expect(active()).toHaveLength(0);
    render(<StrictMode>{panel('videos')}</StrictMode>);
    expect(fixture.listeners).toHaveLength(206);
    expect(active()).toHaveLength(3);
  });
});

describe('message hook lifecycle', () => {
  it('deduplicates ids, stabilizes equivalent arrays, and clears removed threads immediately', () => {
    const { result, rerender } = renderHook(({ ids }) => useInstructorBookingMessages(ids), {
      initialProps: { ids: ['b', 'a', 'a'] },
    });
    expect(active().map((listener) => listener.id)).toEqual(['a', 'b']);
    const incoming = [video('z'), { ...video('a'), timestamp: '2025-01-01' }];
    act(() => active().forEach((listener) => listener.receive(incoming)));
    expect(incoming.map((message) => message.id)).toEqual(['z', 'a']);
    expect(result.current.loading).toBe(false);
    rerender({ ids: ['a', 'b'] });
    expect(fixture.listeners).toHaveLength(2);
    rerender({ ids: ['b'] });
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(active().map((listener) => listener.id)).toEqual(['b']);
    act(() => active()[0].receive([]));
    expect(result.current.loading).toBe(false);
    rerender({ ids: [] });
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(active()).toHaveLength(0);
  });

  it('ignores late success and error callbacks even when returning to the same scope', () => {
    const { result, rerender, unmount } = renderHook(
      ({ scope }) => useInstructorBookingMessages(['a'], scope),
      {
        initialProps: { scope: 'account/child-a/coach' },
      }
    );
    const old = active()[0];
    act(() => old.receive([video('old')]));
    rerender({ scope: 'account/child-b/coach' });
    expect(result.current.messages).toEqual([]);
    rerender({ scope: 'account/child-a/coach' });
    act(() => {
      old.receive([video('stale')]);
      old.fail();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe(false);
    act(() => active()[0].receive([video('new')]));
    expect(result.current.messages.map((message) => message.id)).toEqual(['new']);
    const last = active()[0];
    unmount();
    act(() => {
      last.receive([video('unmounted')]);
      last.fail();
    });
    expect(active()).toHaveLength(0);
  });

  it('settles mixed success/errors without losing successful videos', () => {
    const { result } = renderHook(() => useInstructorBookingMessages(['a', 'b']));
    act(() => active()[0].receive([video()]));
    expect(result.current.loading).toBe(true);
    act(() => active()[1].fail());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.messages).toHaveLength(1);
  });

  it('uses an unambiguous key for thread ids', () => {
    const { rerender } = renderHook(({ ids }) => useInstructorBookingMessages(ids), {
      initialProps: { ids: ['a,b'] },
    });
    expect(active().map((listener) => listener.id)).toEqual(['a,b']);
    rerender({ ids: ['a', 'b'] });
    expect(active().map((listener) => listener.id)).toEqual(['a', 'b']);
  });
});
