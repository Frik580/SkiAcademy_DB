import { translations } from '../../src/lib/i18n/translations';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { InstructorHomeworkSection } from '../../src/features/instructor-workspace/components/InstructorHomeworkSection';
import { useAuthStore } from '../../src/features/auth/authStore';
import type { User } from 'firebase/auth';
import type { ChatMessage } from '../../src/types';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), media: vi.fn() }));
vi.mock('../../src/infrastructure/firebase', async (original) => ({
  ...(await original<object>()),
  getDocs: mocks.getDocs,
}));
vi.mock('../../src/features/bookings/components/booking_chat/ChatMedia', () => ({
  ChatMedia: (props: { name: string }) => {
    mocks.media(props);
    return <span>{props.name}</span>;
  },
}));
const item = (id: string, targets?: string[]): ChatMessage => ({
  id,
  bookingId: 'untrusted',
  timestamp: `2026-11-07T10:${id.padStart(2, '0')}:00.000Z`,
  senderId: 'sender',
  senderName: '',
  senderAvatar: '',
  text: `Homework ${id}\nComment`,
  isHomework: true,
  homeworkForParticipantIds: targets,
});
function respond(messages: ChatMessage[]) {
  return { docs: messages.map((message) => ({ id: message.id, data: () => message })) };
}
const source = (threadId = 'lesson') => ({ threadId, participantIds: ['a', 'b'], label: threadId });
function view(participantId = 'a', bookingId = 'lesson', sources = [source()]) {
  return (
    <LanguageProvider>
      <InstructorHomeworkSection
        participantId={participantId}
        bookingId={bookingId}
        sources={sources}
      />
    </LanguageProvider>
  );
}
const expand = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(Homework|Домашние задания)$/ }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDocs.mockReset();
  localStorage.setItem('alpine_glide_lang', 'en');
  useAuthStore.setState({ firebaseUser: { uid: 'coach' } as User, authGeneration: 1 });
  mocks.getDocs.mockResolvedValue(respond([]));
});
afterEach(cleanup);

it('does not read before expansion or after unmount; renders audience, metadata, text and safe attachments', async () => {
  mocks.getDocs.mockResolvedValueOnce(
    respond([
      {
        ...item('03', ['a']),
        senderName: 'Claimed coach',
        attachmentType: 'image',
        attachmentUrl: 'chat://media',
        attachmentName: 'Photo',
      },
      item('02', ['b']),
      item('01'),
      { ...item('00'), attachmentType: 'link', attachmentUrl: 'javascript:alert(1)' },
    ])
  );
  const mounted = render(view());
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Homework' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expand();
  await screen.findByText(/Homework 03/);
  expect(screen.queryByText(/Homework 02/)).toBeNull();
  expect(screen.getByText(/Homework 01/)).toHaveClass('whitespace-pre-wrap');
  expect(screen.getByText(/Sender name in message: Claimed coach/)).toBeTruthy();
  expect(screen.getAllByText(/Author unknown/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('link')).toBeNull();
  expect(mocks.media).toHaveBeenCalled();
  const query = mocks.getDocs.mock.calls[0][0];
  expect(JSON.stringify(query._query)).toContain('isHomework');
  mounted.unmount();
  expect(mocks.getDocs).toHaveBeenCalledTimes(2);
});

it('paginates in stable order, deduplicates, blocks concurrent loads and preserves data on retry', async () => {
  const first = Array.from({ length: 20 }, (_, i) => item(String(40 - i)));
  mocks.getDocs
    .mockResolvedValueOnce(respond(first))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(respond([first[19], item('19')]));
  render(view());
  expand();
  await screen.findByText(/Homework 40/);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByText(/Homework 40/)).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Retry' });
  fireEvent.click(retry);
  fireEvent.click(retry);
  await screen.findByText(/Homework 19/);
  expect(screen.getAllByText(/Homework 21/)).toHaveLength(1);
  expect(mocks.getDocs).toHaveBeenCalledTimes(3);
});

it('ignores stale responses and immediately hides another Participant or Booking history', async () => {
  let resolve!: (value: ReturnType<typeof respond>) => void;
  mocks.getDocs.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const mounted = render(view());
  expand();
  await waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));
  mounted.rerender(view('b'));
  expect(screen.getByRole('button', { name: 'Homework' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  await act(async () => resolve(respond([item('01', ['a'])])));
  expect(screen.queryByText(/Homework 01/)).toBeNull();
  expect(mocks.getDocs).toHaveBeenCalledTimes(1);
  mocks.getDocs.mockResolvedValue(respond([item('02', ['b'])]));
  expand();
  await screen.findByText(/Homework 02/);
  mounted.rerender(view('b', 'another'));
  expect(screen.queryByText(/Homework 02/)).toBeNull();
});

it('distinguishes denial, empty and unavailable, clears revoked data and never retries a denied source', async () => {
  mocks.getDocs
    .mockResolvedValueOnce(respond(Array.from({ length: 20 }, (_, i) => item(String(40 - i)))))
    .mockRejectedValueOnce({ code: 'permission-denied' });
  render(view());
  expand();
  await screen.findByText(/Homework 40/);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/Homework 40/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  expect(screen.queryByText(translations.en.lessonHomeworkEmpty)).toBeNull();
});

it('clears history on sign-out and makes no further reads', async () => {
  mocks.getDocs.mockResolvedValueOnce(respond([item('01')]));
  render(view());
  expand();
  await screen.findByText(/Homework 01/);
  act(() => useAuthStore.setState({ firebaseUser: null, authGeneration: 2 }));
  expect(screen.queryByText(/Homework 01/)).toBeNull();
  expand();
  await screen.findByRole('alert');
  expect(mocks.getDocs).toHaveBeenCalledTimes(2);
});

it('closes pending history and safely reloads it on reopening', async () => {
  let finish!: (value: ReturnType<typeof respond>) => void;
  mocks.getDocs.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(view());
  expand();
  await waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(1));
  expand();
  await act(async () => finish(respond([item('01')])));
  expect(screen.queryByText(/Homework 01/)).toBeNull();
  mocks.getDocs.mockResolvedValueOnce(respond([item('02')]));
  expand();
  await screen.findByText(/Homework 02/);
  expect(screen.queryByText(/Homework 01/)).toBeNull();
});

it('discovers all 50 sources and excludes unrelated family Participants', async () => {
  const sources = Array.from({ length: 50 }, (_, i) => source(`chat-${i}`));
  sources.push({ threadId: 'foreign', label: 'Foreign', participantIds: ['other-child'] });
  render(view('a', 'lesson', sources));
  expand();
  await waitFor(() => expect(mocks.getDocs).toHaveBeenCalledTimes(50));
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(
    mocks.getDocs.mock.calls.every(([query]) => !JSON.stringify(query._query).includes('foreign'))
  ).toBe(true);
});

it.each(['en', 'ru'])('renders localized empty state in %s', async (language) => {
  localStorage.setItem('alpine_glide_lang', language);
  render(view());
  expect(screen.getByText(translations[language].lessonHomeworkScope)).toBeVisible();
  expect(mocks.getDocs).not.toHaveBeenCalled();
  expand();
  await screen.findByText(translations[language].lessonHomeworkEmpty);
  expect(screen.queryByText(translations[language].lessonHomeworkEmptyPage)).toBeNull();
});

it.each(['en', 'ru'])('allows manual pagination through hidden pages in %s', async (language) => {
  localStorage.setItem('alpine_glide_lang', language);
  const copy = translations[language];
  const hidden = Array.from({ length: 40 }, (_, i) => item(String(45 - i), ['b']));
  mocks.getDocs
    .mockResolvedValueOnce(respond(hidden.slice(0, 1)))
    .mockResolvedValueOnce(respond(hidden.slice(1, 21)))
    .mockResolvedValueOnce(respond([...hidden.slice(21), item('05', ['a'])]))
    .mockResolvedValueOnce(respond([item('04')]));
  render(view());
  expand();

  for (const reads of [2, 3]) {
    await screen.findByText(copy.lessonHomeworkEmptyPage);
    expect(screen.queryByText(copy.lessonHomeworkEmpty)).toBeNull();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(mocks.getDocs).toHaveBeenCalledTimes(reads);
    fireEvent.click(screen.getByRole('button', { name: copy.historyShowMore }));
  }

  await screen.findByText(/Homework 04/);
  expect(screen.getAllByRole('article').map((article) => article.textContent)).toEqual([
    expect.stringContaining('Homework 05'),
    expect.stringContaining('Homework 04'),
  ]);
  expect(screen.queryByRole('button', { name: copy.historyShowMore })).toBeNull();
  expect(mocks.getDocs).toHaveBeenCalledTimes(4);
});
