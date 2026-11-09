import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryInstructorParticipantRecommendationHistoryReadModelsResult } from '@ski-academy/shared-domain';
import type { User } from 'firebase/auth';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { useAuthStore } from '../../src/features/auth/authStore';
import { InstructorRecommendationHistorySection } from '../../src/features/instructor-workspace/components/InstructorRecommendationHistorySection';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryInstructorParticipantRecommendationHistoryReadModels: query,
}));

type Page = QueryInstructorParticipantRecommendationHistoryReadModelsResult;
function lesson(id: number, participantId = 'participant_a'): Page['items'][number] {
  return {
    feedbackId: `feedback_${id}`,
    lessonBookingId: `booking_${id}`,
    participantId,
    instructorId: id === 1 ? 'instructor_a' : 'instructor_b',
    lessonStartsAt: { seconds: Date.parse('2026-11-05T22:00:00Z') / 1000, nanoseconds: id },
    items: [{ itemId: 'first', text: `Recommendation ${id}`, completed: id === 1 }],
    revision: 1,
    updatedAt: { seconds: Date.parse('2026-11-09T00:00:00Z') / 1000, nanoseconds: 0 },
  };
}

function page(
  items: Page['items'] = [],
  nextCursor?: string,
  participantId = 'participant_a'
): Page {
  return { scope: 'instructor', participantId, items, nextCursor };
}

function view(participantId = 'participant_a', bookingId = 'booking_current') {
  return (
    <StrictMode>
      <LanguageProvider>
        <InstructorRecommendationHistorySection
          participantId={participantId}
          bookingId={bookingId}
          bookingStatus="confirmed"
          authors={[{ id: 'instructor_a', name: 'Alexey' }]}
        />
      </LanguageProvider>
    </StrictMode>
  );
}

function deferred() {
  let resolve!: (value: Page) => void;
  const promise = new Promise<Page>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const toggle = () => screen.getByRole('button', { name: 'Recommendation history' });
const more = () => screen.getByRole('button', { name: 'Show more' });
const expand = () => fireEvent.click(toggle());

beforeEach(() => {
  query.mockReset();
  localStorage.setItem('alpine_glide_lang', 'en');
  useAuthStore.setState({ firebaseUser: { uid: 'account_a' } as User, authGeneration: 1 });
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ firebaseUser: null, authGeneration: 0 });
});

describe('instructor recommendation history', () => {
  it('loads on keyboard expansion and renders previous lessons, known and unnamed instructors, dates and saved completion', async () => {
    const pending = deferred();
    query.mockReturnValueOnce(pending.promise);
    render(view('participant_a', 'booking_3'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle().getAttribute('aria-controls')!)).toHaveAttribute(
      'hidden'
    );
    expect(query).not.toHaveBeenCalled();

    toggle().focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading recommendations');
    expect(query).toHaveBeenCalledExactlyOnceWith(
      { scope: 'instructor', participantId: 'participant_a' },
      expect.any(String)
    );

    const longText = 'x'.repeat(2000);
    const first = lesson(1);
    first.lessonDate = '2026-11-07';
    first.items.push({ itemId: 'long', text: longText, completed: false });
    await act(() => pending.resolve(page([first, lesson(2), lesson(3)])));
    const [newer, older] = screen.getAllByRole('article');
    expect(newer).toHaveTextContent('7 Nov 2026');
    expect(newer).toHaveTextContent('Instructor · Alexey');
    expect(within(newer).getByText(longText)).toBeVisible();
    expect(within(newer).getByText('Marked complete')).toBeVisible();
    expect(within(newer).getByText('Not marked complete')).toBeVisible();
    expect(older).toHaveTextContent('6 Nov 2026');
    expect(older).toHaveTextContent('Instructor name unavailable');
    expect(older).not.toHaveTextContent('instructor_b');
    expect(screen.queryByText('Recommendation 3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expand();
    expand();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('renders a terminal empty state in Russian', async () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    query.mockResolvedValueOnce(page());
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'История рекомендаций' }));
    expect(await screen.findByText('Рекомендаций пока нет.')).toBeVisible();
  });

  it('keeps a continuation on an empty page and appends unique lessons in server order', async () => {
    const full = Array.from({ length: 20 }, (_, index) => lesson(20 - index));
    const pending = deferred();
    query
      .mockResolvedValueOnce(page([], 'opaque-empty'))
      .mockResolvedValueOnce(page(full, 'opaque-full'))
      .mockReturnValueOnce(pending.promise);
    render(view());
    expand();
    await screen.findByRole('button', { name: 'Show more' });
    expect(screen.queryByText('No recommendations yet.')).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(1);
    fireEvent.click(more());
    await screen.findByText('Recommendation 20');
    expect(screen.getAllByRole('article')).toHaveLength(20);
    more().focus();
    fireEvent.click(more());
    expect(more()).toHaveAttribute('aria-disabled', 'true');
    expect(more()).toHaveFocus();
    fireEvent.click(more());
    expect(query.mock.calls.map(([input]) => input.cursor)).toEqual([
      undefined,
      'opaque-empty',
      'opaque-full',
    ]);
    await act(() => pending.resolve(page([lesson(1), lesson(0), lesson(0)])));
    expect(
      screen
        .getAllByRole('article')
        .map((article) => article.querySelector('li')?.firstChild?.textContent)
    ).toEqual([...full, lesson(0)].map((row) => row.items[0].text));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(toggle()).toHaveFocus();
  });

  it('retries a network failure on either page without losing the cursor or loaded rows', async () => {
    const unavailable = { code: 'functions/unavailable' };
    query
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(page([lesson(1)], 'same-cursor'))
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(page([lesson(2)]));
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recommendations.');
    expect(screen.getByText('Recommendation 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recommendation 2')).toBeVisible();
    expect(query.mock.calls.map(([input]) => input.cursor)).toEqual([
      undefined,
      undefined,
      'same-cursor',
      'same-cursor',
    ]);
  });

  it.each([
    ['functions/permission-denied', 'You do not have access'],
    ['functions/unauthenticated', 'Sign In Required'],
  ])('clears visible data and continuation on %s', async (code, message) => {
    query.mockResolvedValueOnce(page([lesson(1)], 'next')).mockRejectedValueOnce({ code });
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expand();
    expand();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('handles first-page permission denial without showing an empty or retry state', async () => {
    query.mockRejectedValueOnce({ code: 'permission-denied' });
    render(view());
    expand();
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('isolates participants and ignores a late continuation after a context switch', async () => {
    const pending = deferred();
    query
      .mockResolvedValueOnce(page([lesson(1)], 'old-cursor'))
      .mockReturnValueOnce(pending.promise);
    const { rerender } = render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    rerender(view('participant_b'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Recommendation 1')).not.toBeInTheDocument();

    query.mockResolvedValueOnce(page([lesson(3, 'participant_b')], undefined, 'participant_b'));
    expand();
    expect(await screen.findByText('Recommendation 3')).toBeVisible();
    await act(() => pending.resolve(page([lesson(2)])));
    expect(screen.queryByText('Recommendation 2')).not.toBeInTheDocument();
    expect(query).toHaveBeenLastCalledWith(
      { scope: 'instructor', participantId: 'participant_b' },
      expect.any(String)
    );
  });

  it('rejects a page containing rows for a different participant', async () => {
    query.mockResolvedValueOnce(page([lesson(1, 'participant_b')]));
    render(view());
    expand();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recommendations.');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('resets when the booking or principal changes and avoids calls when signed out', async () => {
    query.mockResolvedValueOnce(page([lesson(1)], 'old')).mockResolvedValueOnce(page([lesson(2)]));
    const { rerender } = render(view());
    expand();
    expect(await screen.findByText('Recommendation 1')).toBeVisible();
    rerender(view('participant_a', 'another_booking'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expand();
    expect(await screen.findByText('Recommendation 2')).toBeVisible();
    expect(query).toHaveBeenLastCalledWith(
      { scope: 'instructor', participantId: 'participant_a' },
      expect.any(String)
    );
    act(() =>
      useAuthStore.setState({ firebaseUser: { uid: 'account_b' } as User, authGeneration: 2 })
    );
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    act(() => useAuthStore.setState({ firebaseUser: null, authGeneration: 3 }));
    expand();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign In Required');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('discards an in-flight result when the dialog closes and starts fresh on reopen', async () => {
    const pending = deferred();
    query.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([lesson(2)]));
    const { unmount } = render(view());
    expand();
    unmount();
    render(view());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expand();
    expect(await screen.findByText('Recommendation 2')).toBeVisible();
    expect(query.mock.calls[0][1]).not.toBe(query.mock.calls[1][1]);
    await act(() => pending.resolve(page([lesson(1)])));
    expect(screen.queryByText('Recommendation 1')).not.toBeInTheDocument();
  });
});
