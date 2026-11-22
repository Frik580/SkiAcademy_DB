import { isDeepStrictEqual } from 'node:util';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { authorizeChatMedia } from './chatMediaAccess';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const Input = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('create'),
      threadId: identifier,
      messageId: identifier,
      message: z.record(z.string(), z.unknown()),
      idempotencyKey: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('homework'),
      threadId: identifier,
      messageId: identifier,
      isHomework: z.boolean(),
      participantIds: z.array(identifier).max(32).optional(),
      idempotencyKey: z.string().max(256).optional(),
    })
    .strict(),
]);
export function createMutateChatMessage(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication required.');
    const parsed = Input.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid message.');
    const input = parsed.data;
    const uid = request.auth.uid;
    await authorizeChatMedia(
      db,
      uid,
      `chat/${input.threadId}/authorization`,
      undefined,
      async (tx) => {
        const ref = db.doc(`bookings/${input.threadId}/messages/${input.messageId}`);
        const existing = await tx.get(ref);
        if (input.operation === 'create') {
          const data: Record<string, unknown> = { ...input.message, id: input.messageId };
          if (
            data.senderId !== uid ||
            'homeworkForUserIds' in data ||
            'testSessionId' in data ||
            ('dataScope' in data && data.dataScope !== 'live')
          ) {
            throw new HttpsError('permission-denied', 'Invalid message authority.');
          }
          if (existing.exists) {
            if (!isDeepStrictEqual(existing.data(), data))
              throw new HttpsError('already-exists', 'Message exists.');
          } else tx.create(ref, data);
        } else {
          const profile = await tx.get(db.doc(`users/${uid}`));
          const admin = profile.get('role') === 'admin';
          if (
            !existing.exists ||
            (!admin &&
              (existing.get('senderId') !== uid || 'homeworkForUserIds' in existing.data()!))
          ) {
            throw new HttpsError('permission-denied', 'Not the message owner.');
          }
          tx.update(ref, {
            isHomework: input.isHomework,
            homeworkForParticipantIds:
              input.isHomework && input.participantIds ? input.participantIds : FieldValue.delete(),
          });
        }
      }
    );
    return { saved: true };
  };
}
