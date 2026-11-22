import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../auth/authStore';
import { isHomeworkVisibleToStudent } from '../../domain/chat';
import { createHomeworkHistory, type HomeworkHistoryMessage } from '../chat/homeworkHistory';

type State = {
  key: string;
  items: HomeworkHistoryMessage[];
  denied: string[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
};

/** A separate instructor session; stream selection never uses the student cabinet's identity model. */
export function useLessonHomeworkHistory(
  threadIds: string[],
  participantId: string,
  scope: string,
  enabled: boolean
) {
  const generation = useAuthStore((state) => state.authGeneration);
  const signedIn = useAuthStore((state) => Boolean(state.firebaseUser));
  const key = JSON.stringify([threadIds, participantId, scope, enabled && signedIn, generation]);
  const [state, setState] = useState<State>();
  const request = useRef<() => Promise<void>>();
  useEffect(() => {
    let active = true;
    let pending = false;
    const denied = new Set<string>();
    const current = () =>
      active &&
      useAuthStore.getState().authGeneration === generation &&
      Boolean(useAuthStore.getState().firebaseUser);
    const pager = createHomeworkHistory(threadIds, undefined, (id) => {
      denied.add(id);
      if (current())
        setState(
          (previous) =>
            previous && {
              ...previous,
              denied: [...denied],
              items: previous.items.filter((item) => item.threadId !== id),
            }
        );
    });
    setState({
      key,
      items: [],
      denied: [],
      loading: false,
      error: false,
      hasMore: threadIds.length > 0,
    });
    const load = async () => {
      if (!enabled || !current() || pending) return;
      pending = true;
      setState((previous) => previous && { ...previous, loading: true, error: false });
      try {
        const page = await pager.next(current);
        if (!current()) return;
        setState((previous) => {
          const merged = new Map(
            (previous?.items ?? []).map((item) => [JSON.stringify([item.threadId, item.id]), item])
          );
          page.messages.forEach((item) =>
            merged.set(JSON.stringify([item.threadId, item.id]), item)
          );
          return {
            key,
            items: [...merged.values()].filter(
              (item) =>
                !denied.has(item.threadId) && isHomeworkVisibleToStudent(item, participantId)
            ),
            denied: [...denied],
            loading: false,
            error: false,
            hasMore: page.hasMore,
          };
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'unauthenticated' || code === 'functions/unauthenticated') {
          if (current())
            setState({
              key,
              items: [],
              denied: [...threadIds],
              loading: false,
              error: false,
              hasMore: false,
            });
          active = false;
          return;
        }
        if (current())
          setState((previous) => previous && { ...previous, loading: false, error: true });
      } finally {
        pending = false;
      }
    };
    request.current = load;
    if (enabled && signedIn && threadIds.length) void load();
    return () => {
      active = false;
    };
    // key contains all session inputs, including the ordered source list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const visible =
    state?.key === key
      ? state
      : {
          items: [],
          denied: [],
          loading: enabled && signedIn,
          error: false,
          hasMore: false,
        };
  return { ...visible, signedIn, loadMore: () => void request.current?.() };
}
