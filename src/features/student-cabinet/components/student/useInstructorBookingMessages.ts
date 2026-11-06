import { useEffect, useMemo, useState } from 'react';
import { ChatMessage } from '../../../../types';
import { InstructorMessage } from './coachUtils';
import { subscribeToChatMessages } from '../../../../features/chat';

export const useInstructorBookingMessages = (bookingIds: string[], scope = '') => {
  const [attempt, setAttempt] = useState(0);
  const bookingKey = JSON.stringify([scope, [...new Set(bookingIds)].sort(), attempt]);
  const [state, setState] = useState({
    key: '',
    messagesByBooking: new Map<string, ChatMessage[]>(),
    loading: false,
    error: false,
  });

  useEffect(() => {
    const [, ids] = JSON.parse(bookingKey) as [string, string[], number];
    let active = true;
    const localMap = new Map<string, ChatMessage[]>();
    const loadedIds = new Set<string>();
    const failedIds = new Set<string>();
    const publish = () =>
      setState({
        key: bookingKey,
        messagesByBooking: new Map(localMap),
        loading: loadedIds.size < ids.length,
        error: failedIds.size > 0,
      });
    publish();

    const unsubscribes = ids.map((bookingId) => {
      return subscribeToChatMessages(
        bookingId,
        (messages) => {
          if (!active) return;
          const list = [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          localMap.set(bookingId, list);
          loadedIds.add(bookingId);
          failedIds.delete(bookingId);
          publish();
        },
        () => {
          if (!active) return;
          loadedIds.add(bookingId);
          failedIds.add(bookingId);
          publish();
        }
      );
    });

    return () => {
      active = false;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [bookingKey]);

  const messages: InstructorMessage[] = useMemo(() => {
    const merged: InstructorMessage[] = [];
    if (state.key !== bookingKey) return merged;
    for (const [threadId, list] of state.messagesByBooking) {
      list.forEach((msg) =>
        merged.push({
          ...msg,
          bookingId: msg.bookingId || threadId,
          threadId,
        })
      );
    }
    return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [state.key, state.messagesByBooking, bookingKey]);

  return {
    messages,
    loading: state.key === bookingKey ? state.loading : bookingIds.length > 0,
    error: state.key === bookingKey && state.error,
    retry: () => setAttempt((previous) => previous + 1),
  };
};
