import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ParticipantProgressHistoryItem,
  QueryParticipantProgressHistoryReadModelsResult,
} from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { InstructorParticipantProgressHistorySection } from '../../src/features/instructor-workspace/components/InstructorParticipantProgressHistorySection';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useParticipantProgressStore } from '../../src/features/participant-progress';
import { presentProgressHistory } from '../../src/features/instructor-workspace/instructorProgressHistoryPresentation';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', async (original) => ({
  ...(await original<object>()),
  queryParticipantProgressHistoryReadModels: query,
}));
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: DEFAULT_SKILL_CONFIG.items.slice(0, 3).map((item) => ({ ...item, maxPoints: 5 })),
};
const [one, two, three] = config.items;
function event(id = 'event_2', participantId = 'participant_a'): ParticipantProgressHistoryItem {
  return {
    id,
    participantId,
    revision: 2,
    at: { seconds: 1793957400, nanoseconds: 0 },
    kind: 'update_participant_progress',
    instructorId: 'instructor_verified',
    skillChanges: [
      { skillId: one.id, previousScore: 0, newScore: 3 },
      { skillId: two.id, newScore: 4 },
      { skillId: three.id, previousScore: 3 },
    ],
    commentChanges: [
      { skillId: one.id, newText: 'Added text' },
      { skillId: two.id, previousText: 'Old text', newText: 'Changed text' },
      { skillId: three.id, previousText: 'Deleted text' },
    ],
  };
}
function page(
  items = [event()],
  nextCursor?: string,
  participantId = 'participant_a'
): QueryParticipantProgressHistoryReadModelsResult {
  return { scope: 'instructor', participantId, items, ...(nextCursor ? { nextCursor } : {}) };
}
function view(
  participantId = 'participant_a',
  bookingId = 'booking_a',
  authors = [{ id: 'instructor_verified', name: 'Verified Coach' }]
) {
  return (
    <StrictMode>
      <LanguageProvider>
        <InstructorParticipantProgressHistorySection
          participantId={participantId}
          bookingId={bookingId}
          bookingStatus="confirmed"
          skillConfig={config}
          authors={authors}
        />
      </LanguageProvider>
    </StrictMode>
  );
}
const expand = () => fireEvent.click(screen.getByRole('button', { name: 'Learning history' }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue(page());
  localStorage.setItem('alpine_glide_lang', 'en');
});
afterEach(cleanup);

describe('instructor Participant learning history', () => {
  it('loads only on expansion and reuses data within the same open context', async () => {
    render(view());
    const button = screen.getByRole('button', { name: 'Learning history' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toHaveAttribute(
      'hidden'
    );
    expect(query).not.toHaveBeenCalled();
    expand();
    await screen.findByText('Verified Coach');
    expect(query).toHaveBeenCalledExactlyOnceWith({
      scope: 'instructor',
      participantId: 'participant_a',
    });
    expand();
    expand();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('groups multiple score and comment changes in one event, preserving zero and absence', async () => {
    render(view());
    expand();
    await screen.findByText('Verified Coach');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('0 / 5 · 0%')).toBeInTheDocument();
    expect(screen.getAllByText('Not evaluated / 5')).toHaveLength(2);
    expect(screen.getAllByText('3 / 5 · 60%')).toHaveLength(2);
    expect(screen.getByText('Added text')).toBeVisible();
    expect(screen.getByText('Changed text')).toBeVisible();
    expect(screen.getByText('Old text')).not.toBeVisible();
    expect(screen.getByText('Deleted text')).not.toBeVisible();
    expect(screen.getByText(/Comment deleted/)).toBeVisible();
    fireEvent.click(screen.getAllByText('Previous version')[0]);
    expect(screen.getByText('Old text')).toBeVisible();
    const time = document.querySelector('time')!;
    expect(time.dateTime).toBe(new Date(1793957400000).toISOString());
    expect(time.textContent).toBe(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Almaty',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(1793957400000))
    );
  });
  it.each([undefined, 'instructor_missing'])(
    'does not infer author when verified author is %s',
    async (instructorId) => {
      query.mockResolvedValue(page([{ ...event(), instructorId }]));
      render(view());
      expand();
      const author = await screen.findByText('Author unknown');
      if (instructorId) expect(author).toHaveAttribute('data-instructor-id', instructorId);
      else expect(author).not.toHaveAttribute('data-instructor-id');
      expect(screen.queryByText('Verified Coach')).not.toBeInTheDocument();
    }
  );
  it('appends one explicit page, preserves server order, deduplicates and ends pagination', async () => {
    const cursor = 'opaque+/==cursor';
    query
      .mockResolvedValueOnce(page([event('new')], cursor))
      .mockResolvedValueOnce(page([event('new'), event('old'), event('old')]));
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(query.mock.calls[1][0]).toEqual({
      scope: 'instructor',
      participantId: 'participant_a',
      cursor,
    });
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(
      presentProgressHistory([event('new'), event('old')], config, 'en').map((item) => item.id)
    ).toEqual(['new', 'old']);
  });
  it('allows an empty bounded scan page with a continuation without automatically draining it', async () => {
    query.mockResolvedValueOnce(page([], 'cursor')).mockResolvedValueOnce(page());
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await screen.findByText('Verified Coach');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('locks duplicate requests while first or next page is pending', async () => {
    const pending = deferred<QueryParticipantProgressHistoryReadModelsResult>();
    query.mockReturnValueOnce(pending.promise);
    render(view());
    expand();
    expand();
    expand();
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(page([event()], 'next')));
    const next = deferred<QueryParticipantProgressHistoryReadModelsResult>();
    query.mockReturnValueOnce(next.promise);
    const button = screen.getByRole('button', { name: 'Show more' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(query).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(page([])));
  });
  it('preserves the first page and cursor after a network failure, then retries', async () => {
    query
      .mockResolvedValueOnce(page([event()], 'next'))
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValueOnce(page([event('old')]));
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Verified Coach')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(query.mock.calls[2][0].cursor).toBe('next');
  });
  it('retries a first-page error and does not present it as empty history', async () => {
    query.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(page([]));
    render(view());
    expand();
    await screen.findByRole('alert');
    expect(screen.queryByText('No learning history yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('No learning history yet.');
  });
  it.each([
    'permission-denied',
    'functions/permission-denied',
    'unauthenticated',
    'functions/unauthenticated',
  ])('clears cached pages and stops pagination on %s', async (code) => {
    query.mockResolvedValueOnce(page([event()], 'next')).mockRejectedValueOnce({ code });
    render(view());
    expand();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expand();
    expand();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('handles permission denial on the first page', async () => {
    query.mockRejectedValueOnce({ code: 'permission-denied' });
    render(view());
    expand();
    await screen.findByRole('alert');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('isolates A → B → A including late responses from the first A request', async () => {
    const pending = deferred<QueryParticipantProgressHistoryReadModelsResult>();
    query
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(
        page(
          [
            {
              ...event('b', 'participant_b'),
              commentChanges: [{ skillId: one.id, newText: 'Only B' }],
            },
          ],
          undefined,
          'participant_b'
        )
      )
      .mockResolvedValueOnce(
        page([{ ...event(), commentChanges: [{ skillId: one.id, newText: 'Fresh A' }] }])
      );
    const { rerender } = render(view());
    expand();
    rerender(view('participant_b'));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expand();
    await screen.findByText('Only B');
    await act(async () => pending.resolve(page()));
    expect(screen.queryByText('Added text')).not.toBeInTheDocument();
    rerender(view());
    expect(screen.queryByText('Only B')).not.toBeInTheDocument();
    expand();
    await screen.findByText('Fresh A');
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('revalidates the same Participant after changing Booking and reopening', async () => {
    const { rerender, unmount } = render(view());
    expand();
    await screen.findByText('Verified Coach');
    rerender(view('participant_a', 'booking_b'));
    expect(screen.queryByText('Verified Coach')).not.toBeInTheDocument();
    expand();
    await screen.findByText('Verified Coach');
    unmount();
    render(view());
    expect(query).toHaveBeenCalledTimes(2);
    expand();
    await screen.findByText('Verified Coach');
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('ignores pending results after unmount', async () => {
    const pending = deferred<QueryParticipantProgressHistoryReadModelsResult>();
    query.mockReturnValueOnce(pending.promise);
    const { unmount } = render(view());
    expand();
    unmount();
    await act(async () => pending.resolve(page()));
    render(view());
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it.each(['auth', 'scope'])(
    'clears visible history immediately when %s generation changes',
    async (kind) => {
      render(view());
      expand();
      await screen.findByText('Verified Coach');
      act(() => {
        if (kind === 'auth')
          useAuthStore.setState((state) => ({ authGeneration: state.authGeneration + 1 }));
        else useParticipantProgressStore.getState().clear();
      });
      expect(screen.queryByText('Verified Coach')).not.toBeInTheDocument();
      expect(query).toHaveBeenCalledTimes(1);
    }
  );
  it('rejects a mismatched response Participant', async () => {
    query.mockResolvedValueOnce(page([event('wrong', 'participant_b')]));
    render(view());
    expand();
    await screen.findByRole('alert');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('supports keyboard expansion and RU, long text and retired skills', async () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const longText = 'ДлинныйКомментарий'.repeat(300);
    query.mockResolvedValueOnce(
      page([
        {
          ...event(),
          skillChanges: [{ skillId: 'retired', previousScore: 0 }],
          commentChanges: [{ skillId: 'retired', newText: longText }],
        },
      ])
    );
    render(view());
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByText(longText);
    expect(screen.getByRole('button', { name: 'История обучения' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText(longText)).toHaveClass('break-words');
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('Нет оценки')).toBeVisible();
  });
});
