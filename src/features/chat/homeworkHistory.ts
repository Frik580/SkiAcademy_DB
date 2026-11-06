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
  firestore: Firestore = db
): Promise<HomeworkPage> {
  const snapshot = await getDocs(
    query(
      collection(firestore, 'bookings', threadId, 'messages'),
      where('isHomework', '==', true),
      orderBy('timestamp', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(cursor ? [startAfter(cursor.timestamp, cursor.id)] : []),
      limit(HOMEWORK_PAGE_SIZE)
    )
  );
  const messages = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as ChatMessage);
  const last = messages.at(-1);
  return {
    messages,
    cursor: last ? { timestamp: last.timestamp, id: last.id } : cursor,
    hasMore: messages.length === HOMEWORK_PAGE_SIZE,
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

/** K-way merge: do not reveal an older message while another thread has an unread newer head. */
export function createHomeworkHistory(threadIds: string[], readPage = getHomeworkPage) {
  let threads: ThreadState[] = [...new Set(threadIds)]
    .sort()
    .map((id) => ({ id, cursor: null, buffer: [], hasMore: true }));
  return {
    async next(isActive: () => boolean = () => true) {
      // Commit cursors only on success so a failed request can be retried without gaps.
      const draft = threads.map((thread) => ({ ...thread, buffer: [...thread.buffer] }));
      const messages: HomeworkHistoryMessage[] = [];
      for (let index = 0; index < HOMEWORK_PAGE_SIZE; index++) {
        if (!isActive()) throw new Error('Homework history request cancelled');
        const empty = draft.filter((thread) => !thread.buffer.length && thread.hasMore);
        // Bound simultaneous reads even when the selected instructor has many lesson chats.
        for (let offset = 0; offset < empty.length; offset += 4) {
          if (!isActive()) throw new Error('Homework history request cancelled');
          await Promise.all(
            empty.slice(offset, offset + 4).map(async (thread) => {
              try {
                const page = await readPage(thread.id, thread.cursor);
                thread.buffer = page.messages;
                thread.cursor = page.cursor;
                thread.hasMore = page.hasMore;
              } catch (error) {
                // A revoked/deleted chat must not prevent access to the other authorized chats.
                if ((error as { code?: string }).code !== 'permission-denied') throw error;
                thread.hasMore = false;
              }
            })
          );
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
      threads = draft;
      return {
        messages,
        hasMore: threads.some((thread) => thread.buffer.length || thread.hasMore),
      };
    },
  };
}
