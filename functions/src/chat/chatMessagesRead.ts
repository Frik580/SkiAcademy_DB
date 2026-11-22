import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { authorizeChatMedia } from './chatMediaAccess';

export const ChatMessagesInput = z
  .object({
    threadId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    take: z.number().int().min(1).max(100).default(100),
    homeworkOnly: z.boolean().default(false),
    cursor: z
      .object({ timestamp: z.string().max(64), id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) })
      .strict()
      .optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .strict();

export function chatMessagesQuery(db: Firestore, input: z.output<typeof ChatMessagesInput>) {
  let query = db
    .collection(`bookings/${input.threadId}/messages`)
    .orderBy('timestamp', 'desc')
    .orderBy('__name__', 'desc');
  if (input.homeworkOnly) query = query.where('isHomework', '==', true);
  if (input.cursor) query = query.startAfter(input.cursor.timestamp, input.cursor.id);
  return query.limit(input.take + 1);
}
export function createQueryChatMessages(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication required.');
    const parsed = ChatMessagesInput.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid chat query.');
    const { uid } = request.auth;
    const input = parsed.data;
    // TEST message client reachability remains deferred, as in the Rules contract.
    const path = `chat/${input.threadId}/authorization`;
    await authorizeChatMedia(db, uid, path);
    const snapshot = await chatMessagesQuery(db, input).get();
    await authorizeChatMedia(db, uid, path);
    const selected = snapshot.docs.slice(0, input.take);
    return {
      messages: selected.map((doc) => ({ ...doc.data(), id: doc.id })),
      hasMore: snapshot.size > input.take,
      cursor: selected.length
        ? {
            id: selected[selected.length - 1].id,
            timestamp: selected[selected.length - 1].get('timestamp'),
          }
        : null,
    };
  };
}
