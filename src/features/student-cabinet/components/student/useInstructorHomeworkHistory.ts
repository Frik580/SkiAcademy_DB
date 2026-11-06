import { useEffect, useRef, useState } from 'react';
import { createHomeworkHistory, type HomeworkHistoryMessage } from '../../../chat/homeworkHistory';

type State = {
  key: string;
  messages: HomeworkHistoryMessage[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
};
type Session = { active: boolean; pending: boolean; load: () => Promise<void> };

export function useInstructorHomeworkHistory(threadIds: string[], scope: string, enabled: boolean) {
  const key = JSON.stringify([enabled, scope, [...new Set(threadIds)].sort()]);
  const [state, setState] = useState<State>({
    key: '',
    messages: [],
    loading: false,
    error: false,
    hasMore: false,
  });
  const current = useRef<Session | null>(null);

  useEffect(() => {
    const [active, , ids] = JSON.parse(key) as [boolean, string, string[]];
    const pager = createHomeworkHistory(active ? ids : []);
    const session: Session = {
      active: true,
      pending: false,
      load: async () => {
        if (!session.active || session.pending) return;
        session.pending = true;
        setState((prev) => ({ ...prev, loading: true, error: false }));
        try {
          const page = await pager.next(() => session.active);
          if (!session.active) return;
          setState((prev) => {
            const merged = new Map(
              prev.messages.map((message) => [
                JSON.stringify([message.threadId, message.id]),
                message,
              ])
            );
            page.messages.forEach((message) =>
              merged.set(JSON.stringify([message.threadId, message.id]), message)
            );
            return {
              key,
              messages: [...merged.values()],
              loading: false,
              error: false,
              hasMore: page.hasMore,
            };
          });
        } catch {
          if (session.active) setState((prev) => ({ ...prev, loading: false, error: true }));
        } finally {
          session.pending = false;
        }
      },
    };
    current.current = session;
    setState({ key, messages: [], loading: active, error: false, hasMore: active });
    if (active) void session.load();
    return () => {
      session.active = false;
    };
  }, [key]);

  const visible =
    state.key === key ? state : { messages: [], loading: enabled, error: false, hasMore: false };
  return {
    ...visible,
    loadMore: () => {
      void current.current?.load();
    },
  };
}
