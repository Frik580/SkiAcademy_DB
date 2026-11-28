import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getOrInitApp } from '../adminApp';
import { getAdminFirestore } from '../adminFirestore';
import { admitRequest } from '../security/requestAdmission';
import { authorizeChatMedia } from './chatMediaAccess';
import { chatMessagesQuery, ChatMessagesInput, mergeChatMessages } from './chatMessagesRead';
import { LEGACY_CHAT_MESSAGES, VERIFIED_CHAT_MESSAGES } from './chatMessageCollections';

/** Bounded message subscriptions and exact authority dependencies, without polling. */
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
    const input = ChatMessagesInput.parse({
      threadId: req.query.threadId,
      includeArchivedHomework: req.query.includeArchivedHomework === 'true',
    });
    const identity = await getAuth(getOrInitApp()).verifyIdToken(bearer[1], true);
    const db = getAdminFirestore();
    await admitRequest(db, `chat_stream_${identity.uid}`, 120);
    const path = `chat/${input.threadId}/authorization`;
    await authorizeChatMedia(db, identity.uid, path, undefined, undefined, identity, true);
    if (res.destroyed) return;
    res.set('Content-Type', 'text/event-stream');
    res.flushHeaders();
    let closed = false;
    let running = false;
    let pending = false;
    let previous = '';
    const stops = new Map<string, () => void>();
    const messages = new Map<string, readonly QueryDocumentSnapshot[]>();
    const sources = [VERIFIED_CHAT_MESSAGES, LEGACY_CHAT_MESSAGES] as const;
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
      if (closed || messages.size !== sources.length) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        const currentIdentity = await getAuth(getOrInitApp()).verifyIdToken(bearer[1], true);
        const dependencies = new Set<string>();
        await authorizeChatMedia(
          db,
          identity.uid,
          path,
          (name) => dependencies.add(name),
          undefined,
          currentIdentity,
          true
        );
        if (closed) return;
        const result = mergeChatMessages(
          input.threadId,
          identity.uid,
          input.take,
          input.includeArchivedHomework,
          messages.get(VERIFIED_CHAT_MESSAGES)!,
          messages.get(LEGACY_CHAT_MESSAGES)!
        );
        const serialized = JSON.stringify(result.messages);
        if (serialized !== previous) {
          res.write(`data: ${serialized}\n\n`);
          previous = serialized;
        }
        for (const [name, stop] of stops) {
          if (!sources.some((source) => source === name) && !dependencies.has(name)) {
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
    for (const source of sources) {
      stops.set(
        source,
        chatMessagesQuery(db, input, source).onSnapshot((snapshot) => {
          messages.set(source, snapshot.docs);
          void refresh();
        }, deny)
      );
    }
  } catch {
    res.status(403).json({ error: 'Chat access denied.' });
  }
};
export const chatMessagesStream = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 120, maxInstances: 20, concurrency: 40 },
  handleChatMessagesStream
);
