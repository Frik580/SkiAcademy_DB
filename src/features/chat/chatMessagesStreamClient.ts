import { app, auth, firebaseEmulatorConfig } from '../../infrastructure/firebase';
import type { ChatMessage } from '../../types';

type Observer = { publish(messages: ChatMessage[]): void; fail(): void };
const streams = new Map<
  string,
  {
    user: NonNullable<typeof auth.currentUser>;
    observers: Set<Observer>;
    stop(): void;
    messages?: ChatMessage[];
  }
>();

/** Share the fallback stream across unread/full-chat consumers of one thread. */
export function subscribeChatMessageStream(
  threadId: string,
  publish: Observer['publish'],
  fail: Observer['fail']
): () => void {
  const user = auth?.currentUser;
  if (!user) {
    fail();
    return () => undefined;
  }
  const key = `${user.uid}:${threadId}`;
  const observer = { publish, fail };
  let stream = streams.get(key);
  if (stream && stream.user !== user) {
    stream.stop();
    for (const observer of stream.observers) observer.fail();
    stream = undefined;
  }
  if (!stream) {
    const abort = new AbortController();
    const observers = new Set<Observer>();
    stream = { user, observers, stop: () => abort.abort() };
    streams.set(key, stream);
    const current = stream;
    void (async () => {
      let failures = 0;
      while (!abort.signal.aborted && auth.currentUser === user) {
        try {
          const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
          const base = firebaseEmulatorConfig.useEmulators
            ? `http://${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.ports.functions}/${app.options.projectId}/${region}/chatMessagesStream`
            : `https://${region}-${app.options.projectId}.cloudfunctions.net/chatMessagesStream`;
          const response = await fetch(`${base}?${new URLSearchParams({ threadId, includeArchivedHomework: 'true' })}`, {
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            cache: 'no-store',
            signal: abort.signal,
          });
          if (response.status === 401 || response.status === 403) {
            current.messages = undefined;
            for (const item of observers) item.fail();
            break;
          }
          if (!response.ok || !response.body) throw new Error('Chat stream unavailable.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = '';
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            pending += decoder.decode(next.value, { stream: true });
            if (pending.length > 4 * 1024 * 1024)
              throw new Error('Chat stream exceeded its bound.');
            let end: number;
            while ((end = pending.indexOf('\n\n')) >= 0) {
              const event = pending.slice(0, end);
              pending = pending.slice(end + 2);
              if (event.startsWith('event: denied')) {
                current.messages = undefined;
                for (const item of observers) item.fail();
                return;
              }
              const data = event.split('\n').find((line) => line.startsWith('data: '));
              if (data && !abort.signal.aborted && auth.currentUser === user) {
                current.messages = JSON.parse(data.slice(6)) as ChatMessage[];
                for (const item of observers) item.publish(current.messages);
                failures = 0;
              }
            }
          }
        } catch {
          if (abort.signal.aborted) break;
          failures++;
        }
        current.messages = undefined;
        if (failures > 3) {
          for (const item of observers) item.fail();
          break;
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Math.min(2000, 250 * 2 ** failures));
          abort.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        });
      }
    })().finally(() => {
      if (!abort.signal.aborted && auth.currentUser !== user)
        for (const observer of observers) observer.fail();
      if (streams.get(key) === current) streams.delete(key);
    });
  }
  stream.observers.add(observer);
  if (stream.messages) publish(stream.messages);
  return () => {
    stream.observers.delete(observer);
    if (!stream.observers.size) {
      stream.stop();
      streams.delete(key);
    }
  };
}
