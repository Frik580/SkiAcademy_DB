import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { getOrInitApp } from '../adminApp';
import { getAdminFirestore } from '../adminFirestore';
import { admitRequest } from '../security/requestAdmission';
import { authorizeChatMedia } from './chatMediaAccess';
import { ChatMessagesInput, createQueryChatMessages } from './chatMessagesRead';

/** Fallback for parties whose complete ACL cannot fit the Rules get() budget.
 * No polling: bounded message subscription and exact authority dependencies. */
export const handleChatMessagesStream: Parameters<typeof onRequest>[0] = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  const bearer = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '');
  try {
    if (!bearer) throw new HttpsError('unauthenticated', 'Authentication required.');
    const input = ChatMessagesInput.parse({ threadId: req.query.threadId });
    const identity = await getAuth(getOrInitApp()).verifyIdToken(bearer[1], true);
    const db = getAdminFirestore();
    await admitRequest(db, `chat_stream_${identity.uid}`, 120);
    const paths = new Set<string>();
    const path = `chat/${input.threadId}/authorization`;
    await authorizeChatMedia(db, identity.uid, path, (name) => paths.add(name));
    res.set('Content-Type', 'text/event-stream');
    res.flushHeaders();
    let closed = false;
    let running = false;
    let pending = false;
    let previous = '';
    const stops = new Map<string, () => void>();
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      for (const stop of stops.values()) stop();
      res.end();
    };
    const timer = setTimeout(close, 110000);
    timer.unref();
    res.on('close', close);
    const refresh = async () => {
      if (closed) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        await getAuth(getOrInitApp()).verifyIdToken(bearer[1], true);
        const dependencies = new Set<string>();
        await authorizeChatMedia(db, identity.uid, path, (name) => dependencies.add(name));
        const result = await createQueryChatMessages(db)({
          auth: { uid: identity.uid },
          data: input,
        } as never);
        if (closed) return;
        const serialized = JSON.stringify(result.messages);
        if (serialized !== previous) {
          res.write(`data: ${serialized}\n\n`);
          previous = serialized;
        }
        for (const [name, stop] of stops) {
          if (name !== 'messages' && !dependencies.has(name)) {
            stop();
            stops.delete(name);
          }
        }
        for (const name of dependencies) {
          if (!stops.has(name))
            stops.set(
              name,
              db.doc(name).onSnapshot(() => {
                void refresh();
              }, deny)
            );
        }
      } catch {
        deny();
      } finally {
        running = false;
        if (pending && !closed) {
          pending = false;
          void refresh();
        }
      }
    };
    const deny = () => {
      if (!closed) res.write('event: denied\ndata: {}\n\n');
      close();
    };
    stops.set(
      'messages',
      db
        .collection(`bookings/${input.threadId}/messages`)
        .orderBy('timestamp', 'desc')
        .limit(100)
        .onSnapshot(() => {
          void refresh();
        }, deny)
    );
    void refresh();
  } catch {
    res.status(403).json({ error: 'Chat access denied.' });
  }
};
export const chatMessagesStream = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 120, maxInstances: 20, concurrency: 40 },
  handleChatMessagesStream
);
