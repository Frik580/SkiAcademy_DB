import { useEffect, useMemo, useState } from 'react';
import { ChatMessage, OperationType } from '../../../types';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  orderBy,
  query,
} from '../../../lib/firebase';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { InstructorMessage } from './coachUtils';

export const useInstructorBookingMessages = (bookingIds: string[]) => {
  const [messagesByBooking, setMessagesByBooking] = useState<Map<string, ChatMessage[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const bookingKey = useMemo(() => bookingIds.slice().sort().join(','), [bookingIds]);

  useEffect(() => {
    const ids = bookingKey ? bookingKey.split(',') : [];

    if (ids.length === 0) {
      setMessagesByBooking((prev) => (prev.size === 0 ? prev : new Map()));
      setLoading((prev) => (prev ? false : prev));
      return;
    }

    setLoading(true);
    const localMap = new Map<string, ChatMessage[]>();
    const loadedIds = new Set<string>();

    const unsubscribes = ids.map((bookingId) => {
      const messagesPath = `bookings/${bookingId}/messages`;
      return onSnapshot(
        query(
          collection(db, 'bookings', bookingId, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(QUERY_LIMITS.chatMessages)
        ),
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
          list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          localMap.set(bookingId, list);
          loadedIds.add(bookingId);
          setMessagesByBooking(new Map(localMap));
          if (loadedIds.size >= ids.length) setLoading(false);
        },
        (error) => {
          loadedIds.add(bookingId);
          if (loadedIds.size >= ids.length) setLoading(false);
          handleFirestoreError(error, OperationType.GET, messagesPath);
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [bookingKey]);

  const messages: InstructorMessage[] = useMemo(() => {
    const merged: InstructorMessage[] = [];
    for (const [threadId, list] of messagesByBooking) {
      list.forEach((msg) =>
        merged.push({
          ...msg,
          bookingId: msg.bookingId || threadId,
          threadId,
        })
      );
    }
    return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [messagesByBooking]);

  return { messages, loading };
};
