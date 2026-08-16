import { useEffect, useMemo, useState } from 'react';
import { ChatMessage } from '../../../types';
import { InstructorMessage } from './coachUtils';
import { subscribeToChatMessages } from '../../../features/chat/chatService';

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
      return subscribeToChatMessages(
        bookingId,
        (messages) => {
          const list = messages;
          list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          localMap.set(bookingId, list);
          loadedIds.add(bookingId);
          setMessagesByBooking(new Map(localMap));
          if (loadedIds.size >= ids.length) setLoading(false);
        },
        () => {
          loadedIds.add(bookingId);
          if (loadedIds.size >= ids.length) setLoading(false);
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
