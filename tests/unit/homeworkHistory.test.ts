import { describe, expect, it, vi } from 'vitest';
import {
  createHomeworkHistory,
  HOMEWORK_PAGE_SIZE,
  type HomeworkCursor,
} from '../../src/features/chat/homeworkHistory';
import type { ChatMessage, Instructor } from '../../src/types';
import { getInstructorHomeworkMessages } from '../../src/features/student-cabinet/components/student/coachUtils';

const message = (id: string, timestamp = id): ChatMessage => ({
  id,
  timestamp,
  bookingId: 'lesson',
  senderId: 'coach-user',
  senderName: 'Coach',
  senderAvatar: '',
  senderInstructorId: 'coach',
  text: id,
  isHomework: true,
});
const reader = (records: Record<string, ChatMessage[]>) =>
  vi.fn(async (thread: string, cursor: HomeworkCursor | null = null) => {
    const sorted = [...(records[thread] ?? [])]
      .filter((m) => m.isHomework)
      .sort((a, b) =>
        a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : a.id < b.id ? 1 : -1
      );
    const start = cursor ? sorted.findIndex((m) => m.id === cursor.id) + 1 : 0;
    const messages = sorted.slice(start, start + HOMEWORK_PAGE_SIZE);
    const last = messages.at(-1);
    return {
      messages,
      cursor: last ? { timestamp: last.timestamp, id: last.id } : cursor,
      hasMore: messages.length === HOMEWORK_PAGE_SIZE,
    };
  });

describe('homework history', () => {
  it('does not start queued thread reads after the surface closes', async () => {
    let active = true;
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const read = vi.fn(async () => {
      await waiting;
      return { messages: [], cursor: null, hasMore: false };
    });
    const pending = createHomeworkHistory(['a', 'b', 'c', 'd', 'e', 'f'], read).next(() => active);
    expect(read).toHaveBeenCalledTimes(4);
    active = false;
    finish();
    await expect(pending).rejects.toThrow('cancelled');
    expect(read).toHaveBeenCalledTimes(4);
  });
  it.each([101, 301])(
    'recovers homework behind %i ordinary chat messages in multiple lessons',
    async (count) => {
      const old = message('0000');
      const ordinary = Array.from({ length: count }, (_, i) => ({
        ...message(String(i + 1).padStart(4, '0')),
        isHomework: false,
      }));
      // The previous subscription + client filter loses this assignment.
      expect(
        [...ordinary, old]
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 100)
          .filter((m) => m.isHomework)
      ).toEqual([]);
      const read = reader({ first: [old, ...ordinary], second: [message('9999')] });
      const result = await createHomeworkHistory(['first', 'second', 'first'], read).next();
      expect(result.messages.map((m) => m.id)).toEqual(['9999', '0000']);
      expect(result.hasMore).toBe(false);
      expect(read).toHaveBeenCalledTimes(2);
    }
  );

  it('merges all pages in global order, including identical timestamps and document IDs across chats', async () => {
    const records = Array.from({ length: 45 }, (_, i) =>
      message(String(i).padStart(3, '0'), 'same')
    );
    const read = reader({ a: records, b: [message('044', 'same'), message('older', 'aaa')] });
    const history = createHomeworkHistory(['a', 'b'], read);
    const all = [];
    let page;
    do {
      page = await history.next();
      all.push(...page.messages);
    } while (page.hasMore);
    expect(all).toHaveLength(47);
    expect(new Set(all.map((m) => `${m.threadId}/${m.id}`)).size).toBe(47);
    expect(all[0].threadId).toBe('b');
    expect(all.at(-1)?.id).toBe('older');
    expect(all.filter((m) => m.threadId === 'a').map((m) => m.id)).toEqual(
      [...records].reverse().map((m) => m.id)
    );
    expect((await history.next()).messages).toEqual([]);
  });

  it('retries a failed page without committing other thread cursors', async () => {
    const read = reader({ a: [message('a')], b: [message('b')] });
    read.mockRejectedValueOnce(new Error('offline'));
    const history = createHomeworkHistory(['a', 'b'], read);
    await expect(history.next()).rejects.toThrow('offline');
    expect((await history.next()).messages.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('skips inaccessible/deleted chats and handles empty history', async () => {
    const read = reader({ b: [message('b')] });
    read.mockRejectedValueOnce({ code: 'permission-denied' });
    const history = createHomeworkHistory(['a', 'b'], read);
    expect((await history.next()).messages.map((m) => m.id)).toEqual(['b']);
    expect((await createHomeworkHistory([], read).next()).hasMore).toBe(false);
  });

  it('preserves instructor and group Participant audience filtering', () => {
    const coach = { id: 'coach', name: 'Coach' } as Instructor;
    const messages = [
      message('all'),
      { ...message('child-a'), homeworkForParticipantIds: ['a'] },
      { ...message('child-b'), homeworkForParticipantIds: ['b'] },
      {
        ...message('other-coach'),
        senderInstructorId: 'other',
        senderId: 'other',
        senderName: 'Other',
      },
    ];
    expect(
      getInstructorHomeworkMessages(messages, coach, 'coach-user', 'account', 'a').map((m) => m.id)
    ).toEqual(['all', 'child-a']);
    expect(
      getInstructorHomeworkMessages(messages, coach, 'coach-user', 'account', 'b').map((m) => m.id)
    ).toEqual(['all', 'child-b']);
  });
});
