import { isDeepStrictEqual } from 'node:util';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  identityDocumentMatchesReadScope,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  selfParticipantIdFromAccountId,
} from '@ski-academy/shared-domain';
import { getStorage } from 'firebase-admin/storage';
import { getOrInitApp } from '../adminApp';
import { isLiveChatImageType, isLiveChatVideoType } from '../security/mediaTypePolicy';
import {
  hasInstructorAccountLink,
  resolveActiveAccountInstructorId,
} from '../canonical/participantAccess/instructorIdentity';
import { authorizeChatMedia, mediaSizeLimit, parseChatMediaPath } from './chatMediaAccess';
import { LEGACY_CHAT_MESSAGES, VERIFIED_CHAT_MESSAGES } from './chatMessageCollections';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const senderContext = z.enum(['participant', 'instructor', 'administration']);
const participantIds = z.array(identifier).min(1).max(32);
const messageContent = z.object({
  text: z.string().trim().max(1000),
  attachmentType: z.enum(['image', 'video', 'link']).optional(),
  attachmentUrl: z.string().min(1).max(2048).optional(),
  attachmentName: z.string().max(512).optional(),
  attachmentSize: z.number().int().positive().optional(),
});
const createMessage = messageContent
  .extend({
    // Compatibility fields from deployed clients. Only content and authorized homework are stored.
    id: z.unknown().optional(),
    bookingId: z.unknown().optional(),
    senderId: z.unknown().optional(),
    senderName: z.unknown().optional(),
    senderAvatar: z.unknown().optional(),
    senderRole: z.unknown().optional(),
    senderInstructorId: z.unknown().optional(),
    timestamp: z.unknown().optional(),
    isHomework: z.boolean().optional(),
    homeworkForParticipantIds: participantIds.optional(),
  })
  .strict();
const Input = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('edit'),
      threadId: identifier,
      messageId: identifier,
      text: messageContent.shape.text,
      expectedAccountId: identifier.optional(),
      idempotencyKey: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('create'),
      threadId: identifier,
      messageId: identifier,
      message: createMessage,
      context: senderContext.optional(),
      expectedAccountId: identifier.optional(),
      homework: z.object({ participantIds: participantIds.optional() }).strict().optional(),
      idempotencyKey: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('homework'),
      threadId: identifier,
      messageId: identifier,
      isHomework: z.boolean(),
      expectedAccountId: identifier.optional(),
      participantIds: participantIds.optional(),
      idempotencyKey: z.string().max(256).optional(),
    })
    .strict(),
]);

function trustedAvatar(value: unknown, allowedPath: (path: string) => boolean): string {
  if (typeof value !== 'string' || value.length > 2000) return '';
  try {
    const url = new URL(value);
    const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    const expectedOrigin = emulator
      ? `http://${emulator}`
      : 'https://firebasestorage.googleapis.com';
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (
      url.origin === expectedOrigin &&
      !url.username &&
      !url.password &&
      match &&
      decodeURIComponent(match[1]) === getStorage(getOrInitApp()).bucket().name &&
      allowedPath(decodeURIComponent(match[2]))
    ) {
      url.hash = '';
      return url.href;
    }
  } catch {
    return '';
  }
  return '';
}

function validateContent(content: z.output<typeof messageContent>, threadId: string) {
  const { text, attachmentType, attachmentUrl, attachmentName, attachmentSize } = content;
  if (!attachmentType) {
    if (!text || attachmentUrl || attachmentName !== undefined || attachmentSize !== undefined) {
      throw new HttpsError('invalid-argument', 'Invalid message content.');
    }
    return;
  }
  if (attachmentUrl && attachmentType === 'link') {
    const url = URL.parse(attachmentUrl);
    if (
      url &&
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    )
      return;
  } else if (attachmentUrl?.startsWith('chat-media:')) {
    const media = parseChatMediaPath(attachmentUrl.slice('chat-media:'.length));
    if (!media.sessionId && media.threadId === threadId) return media.path;
  }
  throw new HttpsError('invalid-argument', 'Invalid message attachment.');
}

export function createMutateChatMessage(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication required.');
    const parsed = Input.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid message.');
    const input = parsed.data;
    const uid = request.auth.uid;
    const expectedUid =
      input.expectedAccountId ??
      (input.operation === 'create' ? input.message.senderId : undefined);
    if (expectedUid !== undefined && expectedUid !== uid)
      throw new HttpsError('permission-denied', 'The active Account changed.');
    const content = input.operation === 'create' ? messageContent.parse(input.message) : undefined;
    const mediaPath = content ? validateContent(content, input.threadId) : undefined;
    let mediaCheck: Promise<void> | undefined;
    await authorizeChatMedia(
      db,
      uid,
      `chat/${input.threadId}/authorization`,
      undefined,
      async (tx, { account, profile, assignedInstructor, hasParticipantAccess }) => {
        const root = `bookings/${input.threadId}`;
        const ref = db.doc(`${root}/${VERIFIED_CHAT_MESSAGES}/${input.messageId}`);
        const existing = await tx.get(ref);
        const archiveRef = db.doc(`${root}/${LEGACY_CHAT_MESSAGES}/${input.messageId}`);
        const archived = existing.exists ? undefined : await tx.get(archiveRef);
        const admin = profile.role === 'admin';
        if (input.operation === 'edit') {
          const current = existing.exists ? existing : archived;
          if (!admin || !current?.exists)
            throw new HttpsError('permission-denied', 'Message editing requires administration.');
          if (!input.text && !current.get('attachmentUrl'))
            throw new HttpsError('invalid-argument', 'Invalid message content.');
          tx.update(current.ref, { text: input.text });
          return;
        }
        const context = input.operation === 'create' ? input.context : undefined;
        const instructorId =
          assignedInstructor && context !== 'participant' && context !== 'administration'
            ? resolveActiveAccountInstructorId(account.accountId, account, profile.instructorId)
            : undefined;
        const instructor = instructorId
          ? (await tx.get(db.doc(`instructors/${instructorId}`))).data()
          : undefined;
        const verifiedInstructor =
          instructorId &&
          hasInstructorAccountLink(instructor, instructorId, account.accountId) &&
          identityDocumentMatchesReadScope(LIVE_CANONICAL_EXECUTION_SCOPE, instructor)
            ? instructor
            : undefined;
        if (input.operation === 'create') {
          if (archived?.exists) throw new HttpsError('already-exists', 'Message exists.');
          let role: 'admin' | 'instructor' | 'client';
          if (context === 'administration' && admin) role = 'admin';
          else if ((context === undefined || context === 'instructor') && verifiedInstructor)
            role = 'instructor';
          else if (
            (context === undefined || context === 'participant') &&
            (await hasParticipantAccess())
          )
            role = 'client';
          else if (context === undefined && admin) role = 'admin';
          else throw new HttpsError('permission-denied', 'Chat sender context is unavailable.');

          const homework = input.homework || input.message.isHomework === true;
          const targets = input.homework?.participantIds ?? input.message.homeworkForParticipantIds;
          if ((homework || targets) && role !== 'instructor' && role !== 'admin') {
            throw new HttpsError('permission-denied', 'Homework requires chat teaching authority.');
          }
          if (targets && !homework)
            throw new HttpsError('invalid-argument', 'Invalid homework targets.');
          const data = {
            ...content!,
            ...(homework ? { isHomework: true } : {}),
            ...(targets ? { homeworkForParticipantIds: [...new Set(targets)] } : {}),
          };
          if (existing.exists) {
            const current = existing.data()!;
            if (
              current.senderId !== uid ||
              !Object.entries(content!).every(([key, value]) =>
                isDeepStrictEqual(current[key], value)
              ) ||
              Object.keys(messageContent.shape).some((key) => !(key in data) && key in current)
            ) {
              throw new HttpsError('already-exists', 'Message exists.');
            }
            return;
          }
          if (mediaPath) {
            mediaCheck ??= (async () => {
              const [metadata] = await getStorage(getOrInitApp())
                .bucket()
                .file(mediaPath)
                .getMetadata()
                .catch(() => {
                  throw new HttpsError('invalid-argument', 'Invalid message attachment.');
                });
              const type = content!.attachmentType!;
              const mime = metadata.contentType ?? '';
              const size = Number(metadata.size);
              if (
                metadata.metadata?.uploaderUid !== uid ||
                !(type === 'image' ? isLiveChatImageType(mime) : isLiveChatVideoType(mime)) ||
                !Number.isSafeInteger(size) ||
                size <= 0 ||
                size >= mediaSizeLimit(mime) ||
                (content!.attachmentSize !== undefined && content!.attachmentSize !== size)
              )
                throw new HttpsError('invalid-argument', 'Invalid message attachment.');
            })();
            await mediaCheck;
          }
          const avatarPath = (path: string) =>
            role === 'instructor'
              ? /^instructors\/[A-Za-z0-9_.-]+$/.test(path)
              : path ===
                  `participant-avatars/${selfParticipantIdFromAccountId(account.accountId)}/avatar.jpg` ||
                path === `avatars/${uid}` ||
                path === `avatars/${uid}.jpg`;
          const name = role === 'instructor' ? verifiedInstructor?.name : profile.displayName;
          tx.create(ref, {
            ...data,
            id: input.messageId,
            bookingId: input.threadId,
            senderId: uid,
            senderRole: role,
            ...(role === 'instructor' ? { senderInstructorId: instructorId } : {}),
            senderName: typeof name === 'string' ? name.trim().slice(0, 200) : '',
            senderAvatar: trustedAvatar(
              role === 'instructor' ? verifiedInstructor?.avatarUrl : profile.avatarUrl,
              avatarPath
            ),
            timestamp: new Date().toISOString(),
          });
        } else {
          const current = existing.exists ? existing : archived;
          if (
            !current?.exists ||
            (!admin &&
              (!verifiedInstructor ||
                current.get('senderId') !== uid ||
                'homeworkForUserIds' in current.data()!))
          ) {
            throw new HttpsError('permission-denied', 'Not the message owner.');
          }
          tx.update(current.ref, {
            isHomework: input.isHomework,
            homeworkForParticipantIds:
              input.isHomework && input.participantIds ? input.participantIds : FieldValue.delete(),
          });
        }
      },
      request.auth.token,
      true
    );
    return { saved: true };
  };
}
