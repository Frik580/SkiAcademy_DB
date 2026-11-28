import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { authorizeChatMedia } from './chatMediaAccess';
import { LEGACY_CHAT_MESSAGES, VERIFIED_CHAT_MESSAGES } from './chatMessageCollections';

export const ChatMessagesInput = z
  .object({
    threadId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    take: z.number().int().min(1).max(100).default(100),
    homeworkOnly: z.boolean().default(false),
    includeArchivedHomework: z.boolean().default(false),
    cursor: z
      .object({
        timestamp: z.string().max(1500),
        id: z
          .string()
          .min(1)
          .max(1500)
          .regex(/^[^/]+$/),
        source: z.enum([LEGACY_CHAT_MESSAGES, VERIFIED_CHAT_MESSAGES]).optional(),
      })
      .strict()
      .optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .strict();

export function chatMessagesQuery(
  db: Firestore,
  input: z.output<typeof ChatMessagesInput>,
  collection: typeof LEGACY_CHAT_MESSAGES | typeof VERIFIED_CHAT_MESSAGES
) {
  let query = db
    .collection(`bookings/${input.threadId}/${collection}`)
    // Firestore ranges are type-bracketed. Both message formats use ISO strings.
    .where('timestamp', '>=', '')
    .orderBy('timestamp', 'desc')
    .orderBy('__name__', 'desc');
  if (input.homeworkOnly) query = query.where('isHomework', '==', true);
  if (input.cursor && (!input.cursor.source || input.cursor.source === collection))
    query = query.startAfter(input.cursor.timestamp, input.cursor.id);
  return query.limit(input.take + 1);
}

export function mergeChatMessages(
  threadId: string,
  viewerId: string,
  take: number,
  includeArchivedHomework: boolean,
  verified: readonly QueryDocumentSnapshot[],
  archived: readonly QueryDocumentSnapshot[]
) {
  const ids = new Set(verified.map((item) => item.id));
  // Verified messages were created after the cutover. A client-supplied
  // historical timestamp cannot push an archived row ahead of them.
  const sorted = [...verified, ...archived.filter((item) => !ids.has(item.id))];
  const selected = sorted.slice(0, take);
  const last = selected.at(-1);
  return {
    messages: selected.map((item) => {
      if (item.ref.parent.id === VERIFIED_CHAT_MESSAGES) return { ...item.data(), id: item.id };
      const {
        text,
        attachmentType,
        attachmentUrl,
        attachmentName,
        attachmentSize,
        isHomework,
        homeworkForParticipantIds,
      } = item.data();
      return {
        id: item.id,
        bookingId: threadId,
        senderId: '',
        senderRole: 'client',
        senderName: '',
        senderAvatar: '',
        archived: true,
        ownedByViewer: item.get('senderId') === viewerId,
        text: typeof text === 'string' ? text.slice(0, 1000) : '',
        timestamp: item.createTime.toDate().toISOString(),
        ...(includeArchivedHomework && isHomework === true &&
        (homeworkForParticipantIds === undefined ||
          (Array.isArray(homeworkForParticipantIds) &&
            homeworkForParticipantIds.length <= 32 &&
            homeworkForParticipantIds.every((id) => typeof id === 'string' && id.length <= 128)))
          ? {
              isHomework: true,
              ...(Array.isArray(homeworkForParticipantIds)
                ? {
                    homeworkForParticipantIds,
                  }
                : {}),
            }
          : {}),
        ...(attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'link'
          ? { attachmentType }
          : {}),
        ...(typeof attachmentUrl === 'string' && attachmentUrl.length <= 2048
          ? { attachmentUrl }
          : {}),
        ...(typeof attachmentName === 'string'
          ? { attachmentName: attachmentName.slice(0, 512) }
          : {}),
        ...(typeof attachmentSize === 'number' ? { attachmentSize } : {}),
      };
    }),
    hasMore: sorted.length > take,
    cursor: last
      ? { id: last.id, timestamp: last.get('timestamp'), source: last.ref.parent.id }
      : null,
  };
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
    await authorizeChatMedia(db, uid, path, undefined, undefined, request.auth.token, true);
    const read = async (source: typeof LEGACY_CHAT_MESSAGES | typeof VERIFIED_CHAT_MESSAGES) =>
      (await chatMessagesQuery(db, input, source).get()).docs;
    const [verified, archived] = await Promise.all([
      input.cursor?.source === LEGACY_CHAT_MESSAGES ? [] : read(VERIFIED_CHAT_MESSAGES),
      input.homeworkOnly && !input.includeArchivedHomework ? [] : read(LEGACY_CHAT_MESSAGES),
    ]);
    await authorizeChatMedia(db, uid, path, undefined, undefined, request.auth.token, true);
    return mergeChatMessages(input.threadId, uid, input.take, input.includeArchivedHomework, verified, archived);
  };
}
