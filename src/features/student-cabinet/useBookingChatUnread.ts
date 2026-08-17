import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from '../../types';
import { getChatLastReadAt, markChatReadAt, seedChatReadAt } from '../../domain/chat';
import { getCourseChatThreadIds, resolveChatId, type CourseChatBooking } from '../../domain/chat';
import { subscribeToChatMessages } from '../chat';

type WatchPlan = {
  bookingId: string;
  primaryChatId: string;
  threadIds: string[];
};

function collectMessagesForPlan(
  plan: WatchPlan,
  messagesByThread: Map<string, ChatMessage[]>
): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const threadId of plan.threadIds) {
    const list = messagesByThread.get(threadId);
    if (list) merged.push(...list);
  }
  return merged;
}

export function normalizeChatTimestamp(timestamp: ChatMessage['timestamp']): string {
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp && typeof timestamp === 'object') {
    const ts = timestamp as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString();
  }
  return String(timestamp ?? '');
}

function latestTimestampFromOthers(messages: ChatMessage[], currentUserId: string): string {
  let latest = '';
  for (const msg of messages) {
    if (msg.senderId === currentUserId) continue;
    const ts = normalizeChatTimestamp(msg.timestamp);
    if (ts > latest) latest = ts;
  }
  return latest;
}

function hasUnreadMessages(
  messages: ChatMessage[],
  currentUserId: string,
  lastReadAt: string
): boolean {
  return messages.some(
    (msg) => msg.senderId !== currentUserId && normalizeChatTimestamp(msg.timestamp) > lastReadAt
  );
}

function buildWatchPlanKey(bookings: CourseChatBooking[]): string {
  return bookings
    .filter((b) => b.status !== 'cancelled')
    .map((b) => `${b.id}:${b.status}:${resolveChatId(b)}:${getCourseChatThreadIds(b).join(',')}`)
    .sort()
    .join(';');
}

function unreadMapsEqual(prev: Record<string, boolean>, next: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if ((prev[key] ?? false) !== (next[key] ?? false)) return false;
  }
  return true;
}

export function useBookingChatUnread(
  currentUserId: string | undefined,
  bookings: CourseChatBooking[]
) {
  const [messagesByThread, setMessagesByThread] = useState<Map<string, ChatMessage[]>>(new Map());
  const [unreadByChatId, setUnreadByChatId] = useState<Record<string, boolean>>({});
  const seededChatsRef = useRef<Set<string>>(new Set());
  const loadedThreadsRef = useRef<Set<string>>(new Set());

  const watchPlanKey = buildWatchPlanKey(bookings);

  const watchPlan = useMemo<WatchPlan[]>(() => {
    return bookings
      .filter((b) => b.status !== 'cancelled')
      .map((b) => ({
        bookingId: b.id,
        primaryChatId: resolveChatId(b),
        threadIds: getCourseChatThreadIds(b),
      }));
  }, [watchPlanKey]);

  const threadKey = useMemo(() => {
    const ids = new Set<string>();
    watchPlan.forEach((plan) => plan.threadIds.forEach((id) => ids.add(id)));
    return [...ids].sort().join(',');
  }, [watchPlan]);

  useEffect(() => {
    if (!currentUserId || !threadKey) {
      setMessagesByThread(new Map());
      loadedThreadsRef.current = new Set();
      return;
    }

    loadedThreadsRef.current = new Set();
    const threadIds = threadKey.split(',');
    const localMap = new Map<string, ChatMessage[]>();

    const unsubscribes = threadIds.map((threadId) => {
      return subscribeToChatMessages(
        threadId,
        (messages) => {
          const list = messages;
          localMap.set(threadId, list);
          loadedThreadsRef.current.add(threadId);
          setMessagesByThread(new Map(localMap));
        },
        () => {
          loadedThreadsRef.current.add(threadId);
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [currentUserId, threadKey]);

  useEffect(() => {
    if (!currentUserId) {
      setUnreadByChatId({});
      return;
    }

    const next: Record<string, boolean> = {};

    for (const plan of watchPlan) {
      const messages = collectMessagesForPlan(plan, messagesByThread);
      const seedKey = `${currentUserId}:${plan.primaryChatId}`;
      const allThreadsLoaded = plan.threadIds.every((id) => loadedThreadsRef.current.has(id));

      if (
        allThreadsLoaded &&
        !getChatLastReadAt(currentUserId, plan.primaryChatId) &&
        !seededChatsRef.current.has(seedKey)
      ) {
        const latestFromOthers = latestTimestampFromOthers(messages, currentUserId);
        seedChatReadAt(
          currentUserId,
          plan.primaryChatId,
          latestFromOthers || new Date().toISOString()
        );
        seededChatsRef.current.add(seedKey);
      }

      const lastRead = getChatLastReadAt(currentUserId, plan.primaryChatId);
      const unread = hasUnreadMessages(messages, currentUserId, lastRead);
      next[plan.primaryChatId] = unread;
      if (plan.bookingId !== plan.primaryChatId) {
        next[plan.bookingId] = unread;
      }
    }

    setUnreadByChatId((prev) => (unreadMapsEqual(prev, next) ? prev : next));
  }, [currentUserId, watchPlan, messagesByThread]);

  const markBookingChatRead = useCallback(
    (booking: CourseChatBooking) => {
      if (!currentUserId) return;
      const chatId = resolveChatId(booking);
      markChatReadAt(currentUserId, chatId);
      seededChatsRef.current.add(`${currentUserId}:${chatId}`);
      setUnreadByChatId((prev) => {
        const keysToClear = new Set<string>([chatId, booking.id]);
        let changed = false;
        const next = { ...prev };
        for (const key of keysToClear) {
          if (next[key]) {
            next[key] = false;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [currentUserId]
  );

  const hasUnreadChat = useCallback(
    (bookingOrId: string | CourseChatBooking) => {
      if (typeof bookingOrId === 'string') {
        return unreadByChatId[bookingOrId] ?? false;
      }
      const chatId = resolveChatId(bookingOrId);
      return unreadByChatId[chatId] ?? unreadByChatId[bookingOrId.id] ?? false;
    },
    [unreadByChatId]
  );

  return { hasUnreadChat, markBookingChatRead };
}
