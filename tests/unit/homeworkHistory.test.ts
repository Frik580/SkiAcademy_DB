import { describe, expect, it, vi } from 'vitest';
import {
  createHomeworkHistory,
  compareHomework,
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
  vi.fn(
    async (thread: string, cursor: HomeworkCursor | null = null, pageSize = HOMEWORK_PAGE_SIZE) => {
      const sorted = [...(records[thread] ?? [])]
        .filter((m) => m.isHomework)
        .sort((a, b) =>
          a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : a.id < b.id ? 1 : -1
        );
      const start = cursor ? sorted.findIndex((m) => m.id === cursor.id) + 1 : 0;
      const messages = sorted.slice(start, start + pageSize);
      const last = messages.at(-1);
      return {
        messages,
        cursor: last ? { timestamp: last.timestamp, id: last.id } : cursor,
        hasMore: messages.length === pageSize,
      };
    }
  );

describe('homework history', () => {
  it('shares four read permits across replaced sessions and cancels queued old reads', async () => {
    let active = true;
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let running = 0;
    let peak = 0;
    const read = vi.fn(async () => {
      running++;
      peak = Math.max(peak, running);
      await waiting;
      running--;
      return { messages: [], cursor: null, hasMore: false };
    });
    const old = createHomeworkHistory(['a', 'b', 'c', 'd', 'e'], read).next(() => active);
    const oldResult = expect(old).rejects.toThrow('cancelled');
    await Promise.resolve();
    expect(running).toBe(4);
    const replaced = createHomeworkHistory(['f', 'g', 'h', 'i'], read).next();
    await Promise.resolve();
    expect(running).toBe(4);
    active = false;
    finish();
    await oldResult;
    await replaced;
    expect(peak).toBe(4);
    expect(read).toHaveBeenCalledTimes(8);
  });
  it.each([1, 5, 20, 21, 50])(
    'globally paginates %i streams with bounded reads, ties and empty sources',
    async (count) => {
      const ids = Array.from({ length: count }, (_, i) => `chat-${String(i).padStart(3, '0')}`);
      const records = Object.fromEntries(
        ids.map((id, index) => [
          id,
          Array.from({ length: 43 }, (_, n) =>
            message(
              String(n).padStart(3, '0'),
              n === 42
                ? index === count - 1
                  ? 'zz-newest'
                  : 'same'
                : String((n * 7 + index) % 17).padStart(3, '0')
            )
          ),
        ])
      );
      const expected = Object.entries(records)
        .flatMap(([threadId, items]) => items.map((item) => ({ ...item, threadId })))
        .sort(compareHomework);
      const base = reader(records);
      let active = 0;
      let peak = 0;
      const read = vi.fn(async (id: string, cursor: HomeworkCursor | null, size: number) => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        try {
          return await base(id, cursor, size);
        } finally {
          active--;
        }
      });
      const pager = createHomeworkHistory([...ids, ids[0], 'empty'], read);
      const actual = [];
      let page;
      do {
        page = await pager.next();
        expect(page.messages.length).toBeLessThanOrEqual(20);
        actual.push(...page.messages);
        expect(actual).toEqual(expected.slice(0, actual.length));
      } while (page.hasMore);
      expect(actual).toEqual(expected);
      expect(new Set(actual.map((m) => `${m.threadId}/${m.id}`)).size).toBe(expected.length);
      expect(actual[0].threadId).toBe(ids.at(-1));
      expect(peak).toBeLessThanOrEqual(4);
      expect(
        read.mock.calls.filter(([, cursor]) => !cursor).every(([, , size]) => size === 1)
      ).toBe(true);
    }
  );

  it('bounds each action to 20 candidates even when all homework targets another Participant', async () => {
    const records = Array.from({ length: 65 }, (_, i) => ({
      ...message(String(i).padStart(3, '0')),
      homeworkForParticipantIds: [i % 2 ? 'a' : 'b'],
    }));
    const read = reader({ a: records });
    const pager = createHomeworkHistory(['a'], read);
    const first = await pager.next();
    expect(first.messages).toHaveLength(20);
    const second = await pager.next();
    expect([...first.messages, ...second.messages]).toHaveLength(40);
    expect(second.hasMore).toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('rolls back a cancelled last batch and preserves its cursor for retry', async () => {
    let active = true;
    const base = reader({ a: [message('a')] });
    const read = vi.fn(async (id: string, cursor: HomeworkCursor | null, size: number) => {
      const result = await base(id, cursor, size);
      active = false;
      return result;
    });
    const pager = createHomeworkHistory(['a'], read);
    await expect(pager.next(() => active)).rejects.toThrow('cancelled');
    expect((await pager.next()).messages.map((m) => m.id)).toEqual(['a']);
    expect(read.mock.calls[1][1]).toBeNull();
  });
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
    await Promise.resolve();
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
      expect(read).toHaveBeenCalledTimes(4);
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

it.each(['permission-denied', 'functions/permission-denied'])(
  'keeps %s sources revoked if a parallel network read rolls back',
  async (code) => {
    const read = vi.fn(async (id: string) => {
      if (id === 'denied') throw { code };
      throw new Error('offline');
    });
    const denied = vi.fn();
    const pager = createHomeworkHistory(['denied', 'offline'], read, denied);
    await expect(pager.next()).rejects.toThrow('offline');
    await expect(pager.next()).rejects.toThrow('offline');
    expect(read.mock.calls.filter(([id]) => id === 'denied')).toHaveLength(1);
    expect(denied).toHaveBeenCalledWith('denied');
  }
);

it.each(['unauthenticated', 'functions/unauthenticated'])(
  'prioritizes %s over a parallel network error',
  async (code) => {
    const read = vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('offline');
      throw { code };
    });
    await expect(createHomeworkHistory(['a', 'b'], read).next()).rejects.toMatchObject({ code });
  }
);

it('settles all in-flight reads before exposing a retryable failure', async () => {
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const read = vi.fn(async (id: string) => {
    if (id === 'a') throw new Error('offline');
    await delayed;
    return { messages: [], cursor: null, hasMore: false };
  });
  let settled = false;
  const pending = createHomeworkHistory(['a', 'b'], read)
    .next()
    .catch(() => {
      settled = true;
    });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  await pending;
  expect(settled).toBe(true);
});
