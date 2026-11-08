import {
  collection,
  db,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from '../../infrastructure/firebase';
import type { Firestore } from 'firebase/firestore';
import type { ChatMessage } from '../../types';

export const HOMEWORK_PAGE_SIZE = 20;
export type HomeworkCursor = { timestamp: string; id: string };
export type HomeworkPage = {
  messages: ChatMessage[];
  cursor: HomeworkCursor | null;
  hasMore: boolean;
};

/** Existing message authority and Rules apply; ordinary chat messages are never read. */
export async function getHomeworkPage(
  threadId: string,
  cursor: HomeworkCursor | null = null,
  firestore: Firestore = db,
  pageSize = HOMEWORK_PAGE_SIZE
): Promise<HomeworkPage> {
  const snapshot = await getDocs(
    query(
      collection(firestore, 'bookings', threadId, 'messages'),
      where('isHomework', '==', true),
      orderBy('timestamp', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(cursor ? [startAfter(cursor.timestamp, cursor.id)] : []),
      limit(pageSize)
    )
  );
  const messages = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as ChatMessage);
  const last = messages.at(-1);
  return {
    messages,
    cursor: last ? { timestamp: last.timestamp, id: last.id } : cursor,
    hasMore: messages.length >= pageSize,
  };
}

export type HomeworkHistoryMessage = ChatMessage & { threadId: string };
type ThreadState = {
  id: string;
  cursor: HomeworkCursor | null;
  buffer: ChatMessage[];
  hasMore: boolean;
};

export const compareHomework = (a: HomeworkHistoryMessage, b: HomeworkHistoryMessage) =>
  compareString(b.timestamp, a.timestamp) ||
  compareString(b.threadId, a.threadId) ||
  compareString(b.id, a.id);

function compareString(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Firestore getDocs cannot be aborted. Share permits across surfaces/generations so
// a replacement Participant session waits for old in-flight reads to settle.
let activeReads = 0;
const readWaiters: (() => void)[] = [];
async function withReadPermit<T>(isActive: () => boolean, read: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const acquire = () => {
      activeReads++;
      resolve();
    };
    if (activeReads < 4) acquire();
    else readWaiters.push(acquire);
  });
  try {
    if (!isActive()) throw new Error('Homework history request cancelled');
    return await read();
  } finally {
    activeReads--;
    readWaiters.shift()?.();
  }
}

/** K-way merge: do not reveal an older message while another thread has an unread newer head. */
export function createHomeworkHistory(
  threadIds: string[],
  readPage = (id: string, cursor: HomeworkCursor | null, pageSize: number) =>
    getHomeworkPage(id, cursor, db, pageSize),
  onDenied?: (threadId: string) => void
) {
  const denied = new Set<string>();
  let threads: ThreadState[] = [...new Set(threadIds)]
    .sort()
    .map((id) => ({ id, cursor: null, buffer: [], hasMore: true }));
  return {
    async next(isActive: () => boolean = () => true) {
      // Commit cursors only on success so a failed request can be retried without gaps.
      const draft = threads.map((thread) => ({ ...thread, buffer: [...thread.buffer] }));
      const messages: HomeworkHistoryMessage[] = [];
      while (messages.length < HOMEWORK_PAGE_SIZE) {
        if (!isActive()) throw new Error('Homework history request cancelled');
        const empty = draft.filter((thread) => !thread.buffer.length && thread.hasMore);
        // Bound simultaneous reads even when the selected instructor has many lesson chats.
        for (let offset = 0; offset < empty.length; offset += 4) {
          if (!isActive()) throw new Error('Homework history request cancelled');
          const results = await Promise.allSettled(
            empty.slice(offset, offset + 4).map(async (thread) => {
              try {
                // Only discover the head of each source; refill consumed streams in bounded pages.
                const page = await withReadPermit(isActive, () =>
                  readPage(thread.id, thread.cursor, thread.cursor ? HOMEWORK_PAGE_SIZE : 1)
                );
                if (!isActive()) throw new Error('Homework history request cancelled');
                thread.buffer = page.messages;
                thread.cursor = page.cursor;
                thread.hasMore = page.hasMore;
              } catch (error) {
                // A revoked/deleted chat must not prevent access to the other authorized chats.
                if ((error as { code?: string }).code !== 'permission-denied') throw error;
                denied.add(thread.id);
                // Revocation survives a concurrent network failure and cursor rollback.
                const original = threads.find((item) => item.id === thread.id)!;
                original.hasMore = false;
                original.buffer = [];
                thread.hasMore = false;
                thread.buffer = [];
                onDenied?.(thread.id);
              }
            })
          );
          const failed = results.find((result) => result.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
        }
        const heads = draft
          .flatMap((thread) =>
            thread.buffer.length ? [{ ...thread.buffer[0], threadId: thread.id }] : []
          )
          .sort(compareHomework);
        const head = heads[0];
        if (!head) break;
        messages.push(head);
        draft.find((thread) => thread.id === head.threadId)!.buffer.shift();
      }
      if (!isActive()) throw new Error('Homework history request cancelled');
      threads = draft;
      return {
        messages: messages.filter((message) => !denied.has(message.threadId)),
        hasMore: threads.some((thread) => thread.buffer.length || thread.hasMore),
      };
    },
  };
}
