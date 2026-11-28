import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import sharp from 'sharp';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  canonicalStorageBooking,
  seedCanonicalBookingChatFixtures,
  seedCourseGroupChatFixtures,
  seedLegacyBookingChatFixtures,
  seedTestStorageIsolationFixtures,
  seedStorageFirestore,
  loadStorageRules,
  loadFirestoreRules,
  STORAGE_USER_ID,
  STORAGE_ADMIN_ID,
  STORAGE_INSTRUCTOR_USER_ID,
  STORAGE_OTHER_USER_ID,
  STORAGE_RULES_PROJECT_ID,
  STORAGE_TEST_ACTOR_ID,
  STORAGE_TEST_ACTOR_B_ID,
  STORAGE_TEST_SESSION_A,
} from '../../../tests/helpers/storageRulesFixtures';
import { getOrInitApp } from '../adminApp';
import { handleBookingChatMedia } from './chatMediaHttp';
import { handleProtectedImages } from '../security/protectedImagesHttp';
import { authorizeProtectedImage } from '../security/protectedImageAccess';
import { getAdminFirestore } from '../adminFirestore';
import { createQueryChatMessages } from './chatMessagesRead';
import { createMutateChatMessage } from './chatMessagesWrite';
import { handleChatMessagesStream } from './chatMessagesStream';
import {
  TestActorSchema,
  TestActorAssignmentSchema,
  TestSessionSchema,
} from '@ski-academy/shared-domain';

let env: RulesTestEnvironment;
const tokens = new Map<string, string>();
const path = `chat/${canonicalStorageBooking.bookingId}/photo.jpg`;
const uploadId = '11111111-1111-4111-8111-111111111111';

// Real fixtures: the gateway classifies payloads from their bytes, never from a
// declared Content-Type, extension or file name.
const buildImage = (format: 'jpeg' | 'png' | 'webp') => {
  const image = sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 6, b: 7 } },
  });
  return format === 'jpeg' ? image.jpeg().toBuffer() : format === 'png' ? image.png().toBuffer() : image.webp().toBuffer();
};
const JPEG = await buildImage('jpeg');
const PNG = await buildImage('png');
const WEBP = await buildImage('webp');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(24)]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script></svg>'
);
const HTML = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>');
const padded = (body: Buffer, size: number) =>
  Buffer.concat([body, Buffer.alloc(Math.max(0, size - body.length))]);

async function request(
  uid: string | null,
  method = 'GET',
  target = path,
  query: Record<string, string> = {},
  body = Buffer.alloc(0),
  handler = handleBookingChatMedia
) {
  const result = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const response = {
    set(name: string, value: string) {
      result.headers[name] = value;
      return this;
    },
    status(status: number) {
      result.status = status;
      return this;
    },
    json(value: unknown) {
      result.body = value;
      return this;
    },
    send(value: unknown) {
      result.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler(
    {
      method,
      query: { path: target, ...query },
      rawBody: body,
      get: (header: string) =>
        header === 'Content-Type' ? 'image/jpeg' : uid ? `Bearer ${tokens.get(uid)}` : undefined,
    } as unknown as Parameters<typeof handleBookingChatMedia>[0],
    response as unknown as Parameters<typeof handleBookingChatMedia>[1]
  );
  return result;
}

beforeAll(async () => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth emulator required');
  process.env.GCLOUD_PROJECT = STORAGE_RULES_PROJECT_ID;
  process.env.FIREBASE_CONFIG = JSON.stringify({
    projectId: STORAGE_RULES_PROJECT_ID,
    storageBucket: `${STORAGE_RULES_PROJECT_ID}.appspot.com`,
  });
  env = await initializeTestEnvironment({
    projectId: STORAGE_RULES_PROJECT_ID,
    firestore: { rules: loadFirestoreRules() },
    storage: { rules: loadStorageRules() },
  });
  const app = getOrInitApp();
  for (const uid of [
    STORAGE_USER_ID,
    STORAGE_ADMIN_ID,
    STORAGE_INSTRUCTOR_USER_ID,
    STORAGE_OTHER_USER_ID,
    'second-participant-owner',
    'unassigned-instructor',
    STORAGE_TEST_ACTOR_ID,
    STORAGE_TEST_ACTOR_B_ID,
  ]) {
    const customToken = await getAuth(app).createCustomToken(uid);
    const response = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );
    const data = (await response.json()) as { idToken: string };
    expect(data.idToken).toBeTypeOf('string');
    tokens.set(uid, data.idToken);
  }
}, 60_000);

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedCanonicalBookingChatFixtures(env);
  await getStorage(getOrInitApp())
    .bucket()
    .file(path)
    .save(Buffer.from('private image'), {
      resumable: false,
      metadata: { contentType: 'image/jpeg' },
    });
});
afterAll(async () => {
  await env?.cleanup();
});

describe('authorized canonical chat media gateway', () => {
  it('stores server-owned message identity and preserves immutable fields on an authorized edit', async () => {
    const db = getAdminFirestore();
    const mutate = createMutateChatMessage(db);
    const threadId = canonicalStorageBooking.bookingId;
    const messageId = 'server-written-message';
    const write = (uid: string, data: Record<string, unknown>) =>
      mutate({ auth: { uid }, data: { threadId, messageId, ...data } } as never);
    const ref = db.doc(`bookings/${threadId}/verified_chat_messages/${messageId}`);
    const legacyClient = env.authenticatedContext(STORAGE_USER_ID).firestore();
    await expect(setDoc(doc(legacyClient, 'bookings', threadId, 'messages', messageId), {
      text: 'See you on the slope', senderId: STORAGE_USER_ID, timestamp: new Date().toISOString(),
    })).rejects.toMatchObject({ code: 'permission-denied' });
    const before = Date.now();
    await write(STORAGE_USER_ID, {
      operation: 'create',
      message: {
        text: 'See you on the slope', senderId: STORAGE_USER_ID, senderRole: 'admin',
        senderName: 'Client display name', senderAvatar: 'https://example.test/client-avatar',
        senderInstructorId: 'unrelated-instructor', timestamp: '2099-01-01T00:00:00.000Z',
      },
    });
    const initial = (await ref.get()).data()!;
    expect(initial).toMatchObject({
      id: messageId, bookingId: threadId, senderId: STORAGE_USER_ID,
      senderRole: 'client', senderName: STORAGE_USER_ID, senderAvatar: '',
    });
    expect(Date.parse(initial.timestamp)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(initial.timestamp)).toBeLessThanOrEqual(Date.now());
    expect(initial).not.toHaveProperty('senderInstructorId');
    await write(STORAGE_USER_ID, {
      operation: 'create', context: 'participant', message: { text: 'See you on the slope' },
    });
    expect((await ref.get()).data()).toEqual(initial);
    await expect(write(STORAGE_USER_ID, { operation: 'homework', isHomework: true }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(write(STORAGE_USER_ID, { operation: 'edit', text: 'Change' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(write(STORAGE_USER_ID, {
      operation: 'create', message: { text: 'Wrong context', isHomework: true },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(write(STORAGE_USER_ID, {
      operation: 'create', message: { text: 'Different author', senderId: STORAGE_ADMIN_ID },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(write(STORAGE_USER_ID, {
      operation: 'edit', text: 'Invalid edit', senderRole: 'admin',
    })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(write(STORAGE_USER_ID, {
      operation: 'create', message: { text: 'Invalid content', system: true },
    })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await ref.get()).data()).toEqual(initial);
    await write(STORAGE_ADMIN_ID, { operation: 'edit', text: 'Updated text' });
    expect((await ref.get()).data()).toEqual({ ...initial, text: 'Updated text' });
    await write(STORAGE_ADMIN_ID, {
      operation: 'create', context: 'administration', messageId: 'administrator-message',
      message: { text: 'Message from administration' },
    });
    const adminMessage = await db.doc(
      `bookings/${threadId}/verified_chat_messages/administrator-message`
    ).get();
    expect(adminMessage.data()).toMatchObject({
      senderId: STORAGE_ADMIN_ID, senderRole: 'admin', senderName: STORAGE_ADMIN_ID,
    });
    const unauthorizedCreate = {
      operation: 'create', context: 'participant', messageId: 'unexpected-message',
      message: { text: 'Not authorized for this thread' },
    };
    await expect(write(STORAGE_OTHER_USER_ID, unauthorizedCreate))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc(`users/${STORAGE_USER_ID}`).update({
      lifecycle: { status: 'disabled', disabledAt: canonicalStorageBooking.updatedAt },
    });
    await expect(write(STORAGE_USER_ID, unauthorizedCreate))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(mutate({ data: { threadId, ...unauthorizedCreate } } as never))
      .rejects.toMatchObject({ code: 'unauthenticated' });
    expect((await db.doc(`bookings/${threadId}/verified_chat_messages/unexpected-message`).get()).exists)
      .toBe(false);
  });

  it('uses the assigned and linked instructor profile for a homework message', async () => {
    const db = getAdminFirestore();
    const mutate = createMutateChatMessage(db);
    const threadId = canonicalStorageBooking.bookingId;
    const bucket = getStorage(getOrInitApp()).bucket();
    const avatarPath = 'instructors/instructor-1.jpg';
    const avatar = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(avatarPath)}?alt=media`;
    await bucket.file(avatarPath).save(JPEG, { resumable: false, metadata: { contentType: 'image/jpeg' } });
    await db.doc('instructors/instructor-1').set({
      id: 'instructor-1', linkedAccountId: STORAGE_INSTRUCTOR_USER_ID, name: 'Coach Alex',
      avatarUrl: avatar, dataScope: 'live',
    });
    const participantIds = canonicalStorageBooking.party.participantIds.slice(0, 1);
    await mutate({
      auth: { uid: STORAGE_INSTRUCTOR_USER_ID },
      data: {
        operation: 'create', threadId, messageId: 'server-homework', context: 'instructor',
        message: { text: 'Practice turning' }, homework: { participantIds },
      },
    } as never);
    const message = await db.doc(`bookings/${threadId}/verified_chat_messages/server-homework`).get();
    expect(message.data()).toMatchObject({
      senderId: STORAGE_INSTRUCTOR_USER_ID, senderRole: 'instructor',
      senderInstructorId: 'instructor-1', senderName: 'Coach Alex', senderAvatar: avatar,
      isHomework: true, homeworkForParticipantIds: participantIds,
    });
  });

  it('pages verified messages before the archive and projects only neutral archive identity', async () => {
    const db = getAdminFirestore();
    const threadId = canonicalStorageBooking.bookingId;
    const archive = db.doc(`bookings/${threadId}/messages/archived-homework`);
    await archive.set({
      senderId: STORAGE_INSTRUCTOR_USER_ID,
      senderName: 'Historical display name',
      senderRole: 'admin',
      senderAvatar: 'https://example.test/archived-avatar',
      senderInstructorId: 'historical-instructor',
      text: 'Historical homework',
      timestamp: '2099-01-01T00:00:00.000Z',
      isHomework: true,
    });
    await createMutateChatMessage(db)({
      auth: { uid: STORAGE_USER_ID },
      data: {
        operation: 'create', threadId, messageId: 'verified-message', context: 'participant',
        message: { text: 'Verified message' },
      },
    } as never);
    const query = createQueryChatMessages(db);
    const read = (data: Record<string, unknown>) =>
      query({
        auth: { uid: STORAGE_USER_ID },
        data: { threadId, take: 1, includeArchivedHomework: true, ...data },
      } as never);
    const first = await read({});
    expect(first.messages).toMatchObject([{ id: 'verified-message', senderId: STORAGE_USER_ID }]);
    expect(first.hasMore).toBe(true);
    const second = await read({ cursor: first.cursor });
    expect(second.messages).toMatchObject([{
      id: 'archived-homework', senderId: '', senderRole: 'client',
      senderName: '', senderAvatar: '', archived: true, ownedByViewer: false, isHomework: true,
    }]);
    expect(second.messages[0]).not.toHaveProperty('senderInstructorId');
    expect(second.messages[0].timestamp).not.toBe('2099-01-01T00:00:00.000Z');
    expect(second.hasMore).toBe(false);
    expect((await archive.get()).get('senderRole')).toBe('admin');
    expect((await read({ homeworkOnly: true })).messages).toEqual(second.messages);
    expect((await read({ homeworkOnly: true, includeArchivedHomework: false })).messages)
      .toEqual([]);

    const output: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      set: vi.fn(),
      flushHeaders: vi.fn(),
      write: (frame: string) => output.push(frame),
      end: vi.fn(),
    });
    try {
      await handleChatMessagesStream({
        method: 'GET',
        query: { threadId, includeArchivedHomework: 'true' },
        get: () => `Bearer ${tokens.get(STORAGE_USER_ID)}`,
      } as never, response as never);
      await vi.waitFor(() => {
        expect(output[0]).toContain('verified-message');
        expect(output[0]).toContain('archived-homework');
        expect(output[0]).not.toContain('Historical display name');
      }, { timeout: 20_000 });
      const participantId = canonicalStorageBooking.party.participantIds[0];
      await db.doc(`participant_management_active_owner/${participantId}`).delete();
      await vi.waitFor(() => {
        expect(output.at(-1)).toContain('event: denied');
        expect(response.end).toHaveBeenCalledOnce();
      }, { timeout: 20_000 });
    } finally {
      response.emit('close');
    }
  });

  it('keeps page boundaries stable with tied timestamps and an incoming verified message', async () => {
    const db = getAdminFirestore();
    const threadId = canonicalStorageBooking.bookingId;
    const root = db.doc(`bookings/${threadId}`);
    const archive = root.collection('messages');
    const verified = root.collection('verified_chat_messages');
    const timestamp = '2026-11-21T10:00:00.000Z';
    const batch = db.batch();
    for (const id of ['old-a', 'old-b']) batch.set(archive.doc(id), { text: id, timestamp });
    for (const id of ['new-a', 'new-b'])
      batch.set(verified.doc(id), { text: id, timestamp, senderId: STORAGE_USER_ID });
    await batch.commit();

    const read = createQueryChatMessages(db);
    const page = (cursor?: unknown) =>
      read({
        auth: { uid: STORAGE_USER_ID },
        data: { threadId, take: 1, ...(cursor ? { cursor } : {}) },
      } as never);
    const first = await page();
    expect(first.messages.map(({ id }) => id)).toEqual(['new-b']);

    const mutate = createMutateChatMessage(db);
    await mutate({
      auth: { uid: STORAGE_USER_ID },
      data: {
        operation: 'create', threadId, messageId: 'incoming', context: 'participant',
        message: { text: 'Incoming' },
      },
    } as never);
    await expect(mutate({
      auth: { uid: STORAGE_USER_ID },
      data: {
        operation: 'create', threadId, messageId: 'old-b', context: 'participant',
        message: { text: 'Collision' },
      },
    } as never)).rejects.toMatchObject({ code: 'already-exists' });
    expect((await verified.doc('old-b').get()).exists).toBe(false);

    const seen = first.messages.map(({ id }) => id);
    let next = first;
    for (let i = 0; i < 3; i++) {
      expect(next.hasMore).toBe(true);
      next = await page(next.cursor);
      seen.push(...next.messages.map(({ id }) => id));
    }
    expect(seen).toEqual(['new-b', 'new-a', 'old-b', 'old-a']);
    expect(next.hasMore).toBe(false);
    expect((await page()).messages.map(({ id }) => id)).toEqual(['incoming']);

    await mutate({
      auth: { uid: STORAGE_ADMIN_ID },
      data: { operation: 'edit', threadId, messageId: 'old-b', text: 'Edited archive text' },
    } as never);
    await expect(mutate({
      auth: { uid: STORAGE_ADMIN_ID },
      data: {
        operation: 'edit', threadId, messageId: 'old-b', text: 'Unaccepted path',
        source: 'verified_chat_messages',
      },
    } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await archive.doc('old-b').get()).data()).toEqual({
      text: 'Edited archive text', timestamp,
    });
    expect((await verified.doc('old-b').get()).exists).toBe(false);
  });

  it('rejects enrollment-only homework threads while preserving existing legacy and course chats', async () => {
    await seedLegacyBookingChatFixtures(env);
    await seedCourseGroupChatFixtures(env);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'course_enrollments', 'enrollment-only'), {
        courseId: 'course-group-1', participantId: 'child', lifecycleStatus: 'active',
      });
      for (const id of ['enrollment-only', 'booking-chat-1', 'course-group-1']) {
        await setDoc(doc(db, 'bookings', id, 'messages', 'homework'), {
          text: id, timestamp: '2026-11-21T10:00:00Z', isHomework: true,
        });
        await setDoc(doc(db, 'bookings', id, 'messages', 'ordinary'), {
          text: 'ordinary', timestamp: '2026-11-22T10:00:00Z', isHomework: false,
        });
      }
    });
    const query = createQueryChatMessages(getAdminFirestore());
    const read = (threadId: string) => query({
      auth: { uid: STORAGE_USER_ID },
      data: { threadId, homeworkOnly: true, includeArchivedHomework: true, take: 1 },
    } as never);
    await expect(read('enrollment-only')).rejects.toMatchObject({
      code: 'permission-denied', message: 'Invalid media scope',
    });
    for (const id of ['booking-chat-1', 'course-group-1']) {
      await expect(read(id)).resolves.toMatchObject({
        messages: [{ id: 'homework', text: id }], hasMore: false,
      });
    }
    await seedStorageFirestore(env, async (db) => {
      await deleteDoc(doc(db, 'course_chat_access', STORAGE_USER_ID, 'courses', 'course-group-1'));
      await deleteDoc(doc(db, 'bookings', 'booking-chat-1'));
    });
    await expect(read('course-group-1')).rejects.toMatchObject({
      code: 'permission-denied', message: 'Not a current chat participant',
    });
    await expect(read('booking-chat-1')).rejects.toMatchObject({
      code: 'permission-denied', message: 'Invalid media scope',
    });
  });

  it('keeps chat readable for the eighth participant through server authorization', async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `chat_budget_participant_${index}`);
    const threadId = canonicalStorageBooking.bookingId;
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'bookings', threadId), {
        ...canonicalStorageBooking,
        party: { kind: 'family_group', participantIds: ids },
      });
      for (const [index, id] of ids.entries()) {
        await setDoc(doc(db, 'participant_management_active_owner', id), {
          accountId: index === 7 ? STORAGE_USER_ID : 'second-participant-owner',
        });
      }
      await setDoc(doc(db, 'bookings', threadId, 'messages', 'message'), {
        text: 'Visible',
        timestamp: '2026-11-21T10:00:00Z',
      });
    });
    const query = createQueryChatMessages(getAdminFirestore());
    await expect(
      query({ auth: { uid: STORAGE_USER_ID }, data: { threadId } } as never)
    ).resolves.toMatchObject({
      messages: [{ id: 'message', text: 'Visible' }],
    });
    await expect(
      query({ auth: { uid: STORAGE_OTHER_USER_ID }, data: { threadId } } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('revokes administrator and instructor links on the next request', async () => {
    expect((await request(STORAGE_ADMIN_ID)).status).toBe(200);
    expect((await request(STORAGE_INSTRUCTOR_USER_ID)).status).toBe(200);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'users', STORAGE_ADMIN_ID), { role: 'user' });
      await setDoc(doc(db, 'users', STORAGE_INSTRUCTOR_USER_ID), {
        role: 'user',
        isInstructor: false,
      });
    });
    expect((await request(STORAGE_ADMIN_ID)).status).toBe(403);
    expect((await request(STORAGE_INSTRUCTOR_USER_ID)).status).toBe(403);
  });

  it('rejects a Firebase Auth disabled principal even with an issued token', async () => {
    const auth = getAuth(getOrInitApp());
    await auth.updateUser(STORAGE_USER_ID, { disabled: true });
    try {
      expect((await request(STORAGE_USER_ID)).status).toBe(401);
    } finally {
      await auth.updateUser(STORAGE_USER_ID, { disabled: false });
    }
  });

  it.each([
    'chat/../photo.jpg',
    'chat/unknown/photo.jpg',
    'gs://foreign/chat/booking/photo.jpg',
    'chat/x/../../avatars/x',
  ])('denies a substituted thread, bucket or traversal path: %s', async (target) => {
    expect([400, 403]).toContain((await request(STORAGE_USER_ID, 'GET', target)).status);
  });

  it('preserves a committed response when temporary cleanup fails', async () => {
    const target = `${path}.cleanup`;
    expect(
      (
        await request(
          STORAGE_USER_ID,
          'POST',
          target,
          { op: 'chunk', index: '0', uploadId },
          JPEG
        )
      ).status
    ).toBe(204);
    const prototype = Object.getPrototypeOf(getStorage(getOrInitApp()).bucket().file(target));
    const remove = vi.spyOn(prototype, 'delete').mockRejectedValueOnce({ code: 503 });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        (
          await request(STORAGE_USER_ID, 'POST', target, {
            op: 'finish',
            count: '1',
            uploadId,
            type: 'image/jpeg',
          })
        ).status
      ).toBe(201);
      expect(log).toHaveBeenCalledWith('Chat media cleanup failed', { code: 503 });
      const [bytes] = await getStorage(getOrInitApp()).bucket().file(target).download();
      expect(Buffer.compare(bytes, JPEG)).toBe(0);
    } finally {
      remove.mockRestore();
      log.mockRestore();
    }
  });

  it('recovers a lost finish response, rejects conflicts and publishes without download tokens', async () => {
    const target = `${path}.retry`;
    expect(
      (
        await request(
          STORAGE_USER_ID,
          'POST',
          target,
          { op: 'chunk', index: '0', uploadId },
          JPEG
        )
      ).status
    ).toBe(204);
    const finish = { op: 'finish', count: '1', uploadId, type: 'image/jpeg' };
    expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
    expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
    const [metadata] = await getStorage(getOrInitApp()).bucket().file(target).getMetadata();
    expect(metadata.metadata).not.toHaveProperty('firebaseStorageDownloadTokens');
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', target, {
          ...finish,
          uploadId: '22222222-2222-4222-8222-222222222222',
        })
      ).status
    ).toBe(409);
    expect((await request(STORAGE_OTHER_USER_ID, 'POST', target, finish)).status).toBe(403);
    expect((await request(STORAGE_USER_ID, 'GET', target)).body).toEqual(JPEG);
  });

  it('counts denied requests before canonical reads', async () => {
    const { getAdminFirestore } = await import('../adminFirestore');
    await getAdminFirestore()
      .doc(`security_request_limits/chat_media_${STORAGE_OTHER_USER_ID}`)
      .set({ count: 119, resetAt: Date.now() + 60_000 });
    expect((await request(STORAGE_OTHER_USER_ID)).status).toBe(403);
    expect((await request(STORAGE_OTHER_USER_ID)).status).toBe(429);
  });

  it.each([
    STORAGE_USER_ID,
    'second-participant-owner',
    STORAGE_INSTRUCTOR_USER_ID,
    STORAGE_ADMIN_ID,
  ])('allows current principal %s to read existing media and publish image/video', async (uid) => {
    expect((await request(uid)).status).toBe(200);
    for (const type of ['image/jpeg', 'video/mp4']) {
      const target = `${path}.${type.startsWith('video') ? 'mp4' : 'jpg'}`;
      expect(
        (
          await request(
            uid,
            'POST',
            target,
            { op: 'chunk', index: '0', uploadId },
            type.startsWith('video') ? MP4 : JPEG
          )
        ).status
      ).toBe(204);
      expect(
        (await request(uid, 'POST', target, { op: 'finish', count: '1', uploadId, type })).status
      ).toBe(201);
      const media = await request(uid, 'GET', target);
      expect(media.status).toBe(200);
      expect(media.headers['Content-Type']).toBe(type);
      expect(media.headers['Cache-Control']).toBe('private, no-store');
      expect(media.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(media.headers['Content-Disposition']).toBe('attachment');
      await getStorage(getOrInitApp()).bucket().file(target).delete();
    }
  });

  it.each([STORAGE_OTHER_USER_ID, 'unassigned-instructor', null])(
    'denies foreign/payer/unassigned/anonymous %s',
    async (uid) => {
      expect((await request(uid)).status).toBe(uid ? 403 : 401);
      expect(
        (await request(uid, 'POST', path, { op: 'chunk', index: '0', uploadId }, Buffer.from('x')))
          .status
      ).toBe(uid ? 403 : 401);
    }
  );

  it.each([STORAGE_USER_ID, STORAGE_INSTRUCTOR_USER_ID, STORAGE_ADMIN_ID])(
    'revokes disabled account %s on repeat download and upload',
    async (uid) => {
      expect((await request(uid)).status).toBe(200);
      await seedStorageFirestore(env, async (db) => {
        await setDoc(doc(db, 'users', uid), { lifecycle: { status: 'disabled' } }, { merge: true });
      });
      expect((await request(uid)).status).toBe(403);
      expect(
        (await request(uid, 'POST', path, { op: 'chunk', index: '0', uploadId }, Buffer.from('x')))
          .status
      ).toBe(403);
    }
  );

  it.each([null, false, '', 0, { status: 'pending' }])(
    'denies malformed/inactive lifecycle %j',
    async (lifecycle) => {
      await seedStorageFirestore(env, async (db) => {
        await setDoc(doc(db, 'users', STORAGE_USER_ID), { lifecycle }, { merge: true });
      });
      expect((await request(STORAGE_USER_ID)).status).toBe(403);
    }
  );

  it('transfers Participant access through the current guard and removes former authority', async () => {
    expect((await request(STORAGE_USER_ID)).status).toBe(200);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(
        doc(
          db,
          'participant_management_active_owner',
          canonicalStorageBooking.party.participantIds[0]
        ),
        { accountId: STORAGE_OTHER_USER_ID, managementRevision: 2 },
        { merge: true }
      );
    });
    expect((await request(STORAGE_USER_ID)).status).toBe(403);
    expect((await request(STORAGE_OTHER_USER_ID)).status).toBe(200);
  });

  it('revokes removed party members without using payer, bookedBy or legacy fields', async () => {
    await seedStorageFirestore(env, async (db) => {
      const remaining = canonicalStorageBooking.party.participantIds.slice(1);
      await setDoc(
        doc(db, 'bookings', canonicalStorageBooking.bookingId),
        {
          party: { kind: 'family_group', participantIds: remaining },
          userId: STORAGE_USER_ID,
          instructorId: 'instructor-2',
        },
        { merge: true }
      );
    });
    expect((await request(STORAGE_USER_ID)).status).toBe(403);
    expect((await request('unassigned-instructor')).status).toBe(403);
    expect((await request('second-participant-owner')).status).toBe(200);
  });

  it('revokes the former instructor after reschedule and prevents completion of an old upload', async () => {
    const target = `${path}.rescheduled.mp4`;
    expect(
      (
        await request(
          STORAGE_INSTRUCTOR_USER_ID,
          'POST',
          target,
          { op: 'chunk', index: '0', uploadId },
          Buffer.from('x')
        )
      ).status
    ).toBe(204);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(
        doc(db, 'bookings', canonicalStorageBooking.bookingId),
        {
          occurrence: {
            ...canonicalStorageBooking.occurrence,
            instructorId: 'instructor-2',
            scheduleRevision: 2,
          },
          revision: 2,
        },
        { merge: true }
      );
    });
    expect((await request(STORAGE_INSTRUCTOR_USER_ID)).status).toBe(403);
    expect((await request('unassigned-instructor')).status).toBe(200);
    expect(
      (
        await request(STORAGE_INSTRUCTOR_USER_ID, 'POST', target, {
          op: 'finish',
          count: '1',
          uploadId,
          type: 'video/mp4',
        })
      ).status
    ).toBe(403);
    expect((await getStorage(getOrInitApp()).bucket().file(target).exists())[0]).toBe(false);
  });

  it('preserves course group and explicit historical Booking compatibility', async () => {
    await seedCourseGroupChatFixtures(env);
    await seedLegacyBookingChatFixtures(env);
    for (const target of ['chat/course-group-1/photo.jpg', 'chat/booking-chat-1/photo.jpg']) {
      await getStorage(getOrInitApp())
        .bucket()
        .file(target)
        .save(Buffer.from('legacy media'), {
          resumable: false,
          metadata: { contentType: 'image/jpeg' },
        });
      for (const uid of [STORAGE_USER_ID, STORAGE_INSTRUCTOR_USER_ID, STORAGE_ADMIN_ID])
        expect((await request(uid, 'GET', target)).status).toBe(200);
      expect((await request(STORAGE_OTHER_USER_ID, 'GET', target)).status).toBe(403);
    }
    await seedStorageFirestore(env, async (db) => {
      await deleteDoc(doc(db, 'course_chat_access', STORAGE_USER_ID, 'courses', 'course-group-1'));
    });
    expect((await request(STORAGE_USER_ID, 'GET', 'chat/course-group-1/photo.jpg')).status).toBe(
      403
    );
  });

  it('enforces active TEST session, membership, scope and namespace for canonical Bookings', async () => {
    await seedTestStorageIsolationFixtures(env);
    const testPath = `test-sessions/${STORAGE_TEST_SESSION_A}/booking-chat/booking_test_a/photo.jpg`;
    await seedStorageFirestore(env, async (db) => {
      const at = canonicalStorageBooking.updatedAt;
      const audit = canonicalStorageBooking.audit;
      const metadata = { revision: 1, createdAt: at, updatedAt: at, audit };
      await setDoc(
        doc(db, 'users', STORAGE_ADMIN_ID),
        { lifecycle: { status: 'active' } },
        { merge: true }
      );
      for (const uid of [STORAGE_TEST_ACTOR_ID, STORAGE_TEST_ACTOR_B_ID]) {
        await setDoc(
          doc(db, 'users', uid),
          { lifecycle: { status: 'active' }, dataScope: 'test' },
          { merge: true }
        );
        await setDoc(
          doc(db, 'test_actors', uid),
          TestActorSchema.parse({
            ...metadata,
            accountId: uid,
            participantIds: canonicalStorageBooking.party.participantIds,
            kind: 'test_parent',
            allowed: true,
            dataScope: 'test',
          })
        );
        await setDoc(
          doc(db, 'test_actor_assignments', uid),
          TestActorAssignmentSchema.parse({
            accountId: uid,
            activeTestSessionId: STORAGE_TEST_SESSION_A,
            revision: 1,
            updatedAt: at,
            audit,
          })
        );
      }
      await setDoc(
        doc(db, 'test_sessions', STORAGE_TEST_SESSION_A),
        TestSessionSchema.parse({
          ...metadata,
          testSessionId: STORAGE_TEST_SESSION_A,
          schemaVersion: 1,
          status: 'active',
          label: 'Chat media TEST',
          createdByAccountId: STORAGE_ADMIN_ID,
          config: { startingBalanceKzt: 0, clonedCourseIds: [] },
          inventoryRevision: 0,
        })
      );
      await setDoc(doc(db, 'bookings', 'booking_test_a'), {
        ...canonicalStorageBooking,
        bookingId: 'booking_test_a',
        dataScope: 'test',
        testSessionId: STORAGE_TEST_SESSION_A,
      });
      await setDoc(
        doc(
          db,
          'participant_management_active_owner',
          canonicalStorageBooking.party.participantIds[0]
        ),
        { accountId: STORAGE_TEST_ACTOR_ID },
        { merge: true }
      );
    });
    await getStorage(getOrInitApp())
      .bucket()
      .file(testPath)
      .save(Buffer.from('test media'), {
        resumable: false,
        metadata: { contentType: 'image/jpeg' },
      });
    expect((await request(STORAGE_TEST_ACTOR_ID, 'GET', testPath)).status).toBe(200);
    // Homework fallback uses a LIVE path and must not make TEST messages reachable.
    const homeworkQuery = createQueryChatMessages(getAdminFirestore());
    for (const uid of [STORAGE_TEST_ACTOR_ID, STORAGE_USER_ID, STORAGE_ADMIN_ID]) {
      await expect(homeworkQuery({
        auth: { uid }, data: { threadId: 'booking_test_a', homeworkOnly: true },
      } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await expect(homeworkQuery({
      auth: { uid: STORAGE_TEST_ACTOR_ID },
      data: { threadId: canonicalStorageBooking.bookingId, homeworkOnly: true },
    } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await request(STORAGE_ADMIN_ID, 'GET', testPath)).status).toBe(200);
    expect((await request(STORAGE_TEST_ACTOR_B_ID, 'GET', testPath)).status).toBe(403);
    expect((await request(STORAGE_USER_ID, 'GET', testPath)).status).toBe(403);
    expect((await request(STORAGE_TEST_ACTOR_ID)).status).toBe(403);
    const ownAvatar = `test-actors/${STORAGE_TEST_ACTOR_ID}/avatar`;
    const managedId = 'participant_test_managed_avatar';
    const managementId = 'management_test_managed_avatar';
    await seedStorageFirestore(env, async (db) => {
      const { createdAt, updatedAt, audit } = canonicalStorageBooking;
      const metadata = { revision: 1, createdAt, updatedAt, audit };
      await setDoc(
        doc(db, 'test_actors', STORAGE_TEST_ACTOR_ID),
        {
          participantIds: [managedId],
        },
        { merge: true }
      );
      await setDoc(doc(db, 'participants', managedId), {
        ...metadata,
        dataScope: 'test',
        participantId: managedId,
        displayName: 'Managed TEST fixture',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
      });
      await setDoc(doc(db, 'participant_management', managementId), {
        ...metadata,
        participantManagementId: managementId,
        accountId: STORAGE_TEST_ACTOR_ID,
        participantId: managedId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
      });
    });
    const managedUpload = (uid: string) =>
      request(
        uid,
        'POST',
        `participant-avatars/${managedId}/avatar.jpg`,
        {},
        JPEG,
        handleProtectedImages
      );
    expect(await managedUpload(STORAGE_TEST_ACTOR_ID)).toMatchObject({
      status: 201,
      body: { path: `test-actors/${managedId}/avatar.jpg` },
    });
    expect((await managedUpload(STORAGE_TEST_ACTOR_B_ID)).status).toBe(403);

    const participantId = 'participant_avatar_revocation';
    const instructorId = 'test-instructor-a';
    const participantAvatar = `test-actors/${participantId}/avatar.jpg`;
    const bookingId = 'booking_avatar_revocation';
    const booking = {
      ...canonicalStorageBooking,
      bookingId,
      dataScope: 'test',
      testSessionId: STORAGE_TEST_SESSION_A,
      party: { kind: 'individual', participantIds: [participantId] },
      occurrence: {
        ...canonicalStorageBooking.occurrence,
        instructorId,
        serviceParty: { participantIds: [participantId] },
      },
    };
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'participants', participantId), {
        participantId,
        displayName: 'Participant fixture',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'unmanaged_guest' },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        audit: booking.audit,
        dataScope: 'test',
        testSessionId: STORAGE_TEST_SESSION_A,
      });
      await setDoc(doc(db, 'instructors', instructorId), {
        id: instructorId,
        name: 'Instructor fixture',
        linkedAccountId: STORAGE_TEST_ACTOR_ID,
        pricePerHourKZT: 10_000,
        dataScope: 'test',
      });
      await setDoc(doc(db, 'bookings', bookingId), booking);
    });
    await getStorage(getOrInitApp())
      .bucket()
      .file(participantAvatar)
      .save(Buffer.from('avatar'), {
        resumable: false,
        metadata: { contentType: 'image/jpeg' },
      });
    const readAvatar = (uid: string) =>
      request(uid, 'GET', participantAvatar, {}, Buffer.alloc(0), handleProtectedImages);
    expect((await readAvatar(STORAGE_TEST_ACTOR_ID)).status).toBe(200);
    expect((await readAvatar(STORAGE_TEST_ACTOR_B_ID)).status).toBe(403);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'bookings', bookingId), {
        ...booking,
        lifecycle: {
          status: 'cancelled',
          cancelledAt: booking.updatedAt,
          reasonCode: 'account_owner_cancelled',
        },
      });
    });
    expect((await readAvatar(STORAGE_TEST_ACTOR_ID)).status).toBe(403);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'bookings', bookingId), booking);
      await setDoc(
        doc(db, 'instructors', instructorId),
        {
          linkedAccountId: STORAGE_TEST_ACTOR_B_ID,
        },
        { merge: true }
      );
    });
    expect((await readAvatar(STORAGE_TEST_ACTOR_ID)).status).toBe(403);
    expect((await readAvatar(STORAGE_ADMIN_ID)).status).toBe(200);

    const misc = `test-sessions/${STORAGE_TEST_SESSION_A}/misc/private-image.jpg`;
    const imageRequest = (uid: string, method: string, body = JPEG) =>
      request(uid, method, misc, {}, body, handleProtectedImages);
    expect((await imageRequest(STORAGE_TEST_ACTOR_ID, 'POST')).status).toBe(201);
    expect((await imageRequest(STORAGE_TEST_ACTOR_ID, 'GET')).status).toBe(200);
    await seedStorageFirestore(env, async (db) => {
      await setDoc(
        doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_TEST_ACTOR_B_ID),
        { accountId: STORAGE_TEST_ACTOR_B_ID }
      );
    });
    expect((await imageRequest(STORAGE_TEST_ACTOR_B_ID, 'GET')).status).toBe(403);
    expect((await imageRequest(STORAGE_TEST_ACTOR_B_ID, 'POST')).status).toBe(403);

    await seedStorageFirestore(env, async (db) => {
      await setDoc(
        doc(db, 'test_actors', STORAGE_TEST_ACTOR_ID),
        {
          accountId: STORAGE_TEST_ACTOR_B_ID,
        },
        { merge: true }
      );
    });
    await expect(
      authorizeProtectedImage(
        getAdminFirestore(),
        STORAGE_ADMIN_ID,
        ownAvatar,
        false,
        STORAGE_TEST_SESSION_A
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await seedStorageFirestore(env, async (db) => {
      await setDoc(
        doc(db, 'test_actors', STORAGE_TEST_ACTOR_ID),
        {
          accountId: STORAGE_TEST_ACTOR_ID,
        },
        { merge: true }
      );
      await deleteDoc(
        doc(db, 'test_sessions', STORAGE_TEST_SESSION_A, 'membership', STORAGE_TEST_ACTOR_B_ID)
      );
    });
    await expect(
      authorizeProtectedImage(getAdminFirestore(), STORAGE_TEST_ACTOR_ID, ownAvatar, true)
    ).resolves.toMatchObject({ sessionId: STORAGE_TEST_SESSION_A });
    await expect(
      authorizeProtectedImage(getAdminFirestore(), STORAGE_TEST_ACTOR_B_ID, ownAvatar, false)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await request(STORAGE_ADMIN_ID, 'GET', 'chat/booking_test_a/photo.jpg')).status).toBe(
      403
    );
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_A), { status: 'locked' });
    });
    expect((await request(STORAGE_ADMIN_ID, 'GET', testPath)).status).toBe(403);
    expect((await readAvatar(STORAGE_ADMIN_ID)).status).toBe(403);
    await expect(
      authorizeProtectedImage(getAdminFirestore(), STORAGE_TEST_ACTOR_ID, ownAvatar, false)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('enforces MIME, exact image limit, bounded chunks and private temporary paths', async () => {
    expect((await request(STORAGE_USER_ID, 'GET', '../users/x')).status).toBe(400);
    expect((await request(STORAGE_USER_ID, 'GET', '_chat-media-uploads/x/0')).status).toBe(400);
    expect(
      (
        await request(
          STORAGE_USER_ID,
          'POST',
          path,
          { op: 'chunk', index: '7', uploadId },
          Buffer.from('x')
        )
      ).status
    ).toBe(400);
    const target = `${path}.sized`;
    for (const size of [5 * 1024 * 1024 - 1, 5 * 1024 * 1024]) {
      expect(
        (
          await request(
            STORAGE_USER_ID,
            'POST',
            target,
            { op: 'chunk', index: '0', uploadId },
            padded(JPEG, size)
          )
        ).status
      ).toBe(204);
      expect(
        (
          await request(STORAGE_USER_ID, 'POST', target, {
            op: 'finish',
            count: '1',
            uploadId,
            type: 'image/jpeg',
          })
        ).status
      ).toBe(size < 5 * 1024 * 1024 ? 201 : 400);
      await getStorage(getOrInitApp()).bucket().file(target).delete({ ignoreNotFound: true });
    }
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', target, {
          op: 'finish',
          count: '1',
          uploadId,
          type: 'text/plain',
        })
      ).status
    ).toBe(400);
  });

  it('preserves the strict 50 MB video bound with chunked uploads and downloads', async () => {
    const chunkSize = 8 * 1024 * 1024;
    const target = `${path}.large.mp4`;
    for (const size of [50 * 1024 * 1024 - 1, 50 * 1024 * 1024]) {
      const count = Math.ceil(size / chunkSize);
      for (let i = 0; i < count; i++) {
        const length = Math.min(chunkSize, size - i * chunkSize);
        expect(
          (
            await request(
              STORAGE_USER_ID,
              'POST',
              target,
              { op: 'chunk', uploadId, index: String(i) },
              i === 0 ? padded(MP4, length) : Buffer.alloc(length)
            )
          ).status
        ).toBe(204);
      }
      expect(
        (
          await request(STORAGE_USER_ID, 'POST', target, {
            op: 'finish',
            uploadId,
            count: String(count),
            type: 'video/mp4',
          })
        ).status
      ).toBe(size < 50 * 1024 * 1024 ? 201 : 400);
      if (size < 50 * 1024 * 1024) {
        const first = await request(STORAGE_USER_ID, 'GET', target);
        expect(first.headers['X-Media-Size']).toBe(String(size));
        expect((first.body as Buffer).length).toBe(chunkSize);
        expect(
          ((await request(STORAGE_USER_ID, 'GET', target, { index: '6' })).body as Buffer).length
        ).toBe(size - 6 * chunkSize);
        await getStorage(getOrInitApp()).bucket().file(target).delete();
      }
    }
  }, 60_000);

  it('bounds abandoned uploads to seven objects per account and isolates upload IDs', async () => {
    for (const id of [uploadId, '22222222-2222-4222-8222-222222222222']) {
      expect(
        (
          await request(
            STORAGE_USER_ID,
            'POST',
            `${path}.aborted`,
            { op: 'chunk', uploadId: id, index: '0' },
            Buffer.from('x')
          )
        ).status
      ).toBe(204);
    }
    const [files] = await getStorage(getOrInitApp())
      .bucket()
      .getFiles({ prefix: `_chat-media-uploads/${STORAGE_USER_ID}/` });
    expect(files).toHaveLength(1);
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', `${path}.aborted`, {
          op: 'finish',
          uploadId,
          count: '1',
          type: 'image/jpeg',
        })
      ).status
    ).toBe(400);
  });
});

describe('CA-SEC-06B LIVE upload quotas', () => {
  const quota = (category: 'chat' | 'catalog' | 'avatar', uid = STORAGE_USER_ID) =>
    getAdminFirestore().doc(`security_request_limits/media_upload_${category}_${uid}`);
  const bucket = () => getStorage(getOrInitApp()).bucket();
  const chunkQuery = { op: 'chunk', index: '0', uploadId };
  const finish = { op: 'finish', count: '1', uploadId, type: 'image/jpeg' };

  it('uses three quota reads and writes per new operation and skips charging replayed work', async () => {
    const target = `${path}.quota-operation-count`;
    const db = getAdminFirestore();
    const quotaPath = quota('chat').path;
    const totals = { reads: 0, writes: 0 };
    const isQuotaRef = (ref: unknown) =>
      typeof ref === 'object' && ref !== null && 'path' in ref && ref.path === quotaPath;
    const runTransaction = db.runTransaction.bind(db);
    const monitor = vi.spyOn(db, 'runTransaction').mockImplementation((work, options) =>
      runTransaction(async (tx) => {
        const get = vi.spyOn(tx, 'get');
        const set = vi.spyOn(tx, 'set');
        const update = vi.spyOn(tx, 'update');
        try {
          return await work(tx);
        } finally {
          totals.reads += get.mock.calls.filter(([ref]) => isQuotaRef(ref)).length;
          totals.writes += [...set.mock.calls, ...update.mock.calls].filter(([ref]) =>
            isQuotaRef(ref)
          ).length;
        }
      }, options)
    );
    try {
      expect((await request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG)).status).toBe(204);
      expect(totals).toEqual({ reads: 3, writes: 3 });
      expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
      expect(totals).toEqual({ reads: 6, writes: 6 });
      expect(
        (await request(STORAGE_USER_ID, 'POST', target, { ...finish, checkOnly: 'true' })).status
      ).toBe(201);
      expect((await request(STORAGE_USER_ID, 'GET', target)).status).toBe(200);
      expect(totals).toEqual({ reads: 6, writes: 6 });
      expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
      expect(totals).toEqual({ reads: 8, writes: 8 });
      expect((await quota('chat').get()).data()).toMatchObject({
        bytes: { used: JPEG.length },
        uploads: { used: 1 },
        lease: null,
      });
    } finally {
      monitor.mockRestore();
    }
  });

  it('charges actual chunk bytes and one publication across identical retries', async () => {
    const target = `${path}.quota-replay`;
    const temporary = bucket().file(`_chat-media-uploads/${STORAGE_USER_ID}/0`);
    expect((await request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG)).status).toBe(204);
    const [first] = await temporary.getMetadata();
    expect((await request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG)).status).toBe(204);
    expect((await temporary.getMetadata())[0].generation).toBe(first.generation);
    expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
    expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
    expect((await temporary.exists())[0]).toBe(false);
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { ...finish, checkOnly: 'true' })).status
    ).toBe(201);
    const resumedChunk = { ...finish, ...chunkQuery, resume: 'true' };
    expect((await request(STORAGE_USER_ID, 'POST', target, resumedChunk, JPEG)).status).toBe(201);
    expect((await temporary.exists())[0]).toBe(false);
    expect((await quota('chat').get()).data()).toMatchObject({
      bytes: { used: JPEG.length },
      uploads: { used: 1 },
      lease: null,
    });
  });

  it('enforces byte quotas before Storage writes and keeps them after cancellation', async () => {
    const target = `${path}.quota-bytes`;
    const resetAt = Date.now() + 60_000;
    const used = 512 * 1024 * 1024 - JPEG.length;
    await quota('chat').set({ bytes: { used, resetAt } });
    const query = { ...chunkQuery, quotaOwner: STORAGE_OTHER_USER_ID };
    expect((await request(STORAGE_USER_ID, 'POST', target, query, JPEG)).status).toBe(204);
    expect((await request(STORAGE_USER_ID, 'DELETE', target, { uploadId })).status).toBe(204);
    const denied = await request(STORAGE_USER_ID, 'POST', target, query, JPEG);
    expect(denied).toMatchObject({
      status: 429,
      body: { error: 'resource-exhausted', quota: { reason: 'bytes', retryAt: resetAt } },
    });
    expect((await bucket().file(`_chat-media-uploads/${STORAGE_USER_ID}/0`).exists())[0]).toBe(
      false
    );
    expect((await quota('chat', STORAGE_OTHER_USER_ID).get()).exists).toBe(false);
    await quota('chat').update({ 'bytes.resetAt': Date.now() - 1 });
    expect((await request(STORAGE_USER_ID, 'POST', target, query, JPEG)).status).toBe(204);
    expect((await quota('chat').get()).data()?.bytes.used).toBe(JPEG.length);
  });

  it('rejects publication at the count limit and clears the matching temporary parts', async () => {
    const target = `${path}.quota-count`;
    const resetAt = Date.now() + 600_000;
    await quota('chat').set({ uploads: { used: 60, resetAt } });
    expect((await request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG)).status).toBe(204);
    expect((await quota('chat').get()).data()?.uploads).toEqual({ used: 60, resetAt });
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { ...finish, checkOnly: 'true' })).status
    ).toBe(204);
    expect(await request(STORAGE_USER_ID, 'POST', target, finish)).toMatchObject({
      status: 429,
      body: { quota: { reason: 'uploads', retryAt: resetAt } },
    });
    expect((await bucket().file(target).exists())[0]).toBe(false);
    expect((await bucket().file(`_chat-media-uploads/${STORAGE_USER_ID}/0`).exists())[0]).toBe(
      false
    );
    expect((await quota('chat').get()).data()).toMatchObject({
      uploads: { used: 60 },
      lease: null,
    });
  });

  it('serializes concurrent uploads and releases a failed Storage write for a retry', async () => {
    const target = `${path}.quota-concurrency`;
    const temporary = bucket().file(`_chat-media-uploads/${STORAGE_USER_ID}/0`);
    let startWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      startWrite = resolve;
    });
    let failWrite!: () => void;
    const failure = new Promise<void>((resolve) => {
      failWrite = resolve;
    });
    const save = vi
      .spyOn(Object.getPrototypeOf(temporary), 'save')
      .mockImplementationOnce(async () => {
        startWrite();
        await failure;
        throw { code: 503 };
      });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG);
    try {
      await Promise.race([
        writing,
        first.then(() => {
          throw new Error('Expected a Storage write');
        }),
      ]);
      const parallel = await request(STORAGE_USER_ID, 'POST', `${target}.other`, chunkQuery, JPEG);
      expect(parallel).toMatchObject({ status: 429, body: { quota: { reason: 'busy' } } });
      expect((await quota('chat').get()).data()?.bytes.used).toBe(JPEG.length);
    } finally {
      failWrite();
      await first;
      save.mockRestore();
      log.mockRestore();
    }
    expect((await first).status).toBe(500);
    expect((await quota('chat').get()).data()?.lease).toBeNull();
    expect((await request(STORAGE_USER_ID, 'POST', target, chunkQuery, JPEG)).status).toBe(204);
    expect((await request(STORAGE_USER_ID, 'POST', target, finish)).status).toBe(201);
  });

  it('keeps LIVE catalog quota administrator-only and replays or replaces the same object', async () => {
    const object = 'courses/quota-cover.jpg';
    const upload = (uid: string | null, body: Buffer) =>
      request(uid, 'POST', object, {}, body, handleProtectedImages);
    expect((await upload(null, JPEG)).status).toBe(401);
    expect((await upload(STORAGE_USER_ID, JPEG)).status).toBe(403);
    expect((await quota('catalog').get()).exists).toBe(false);
    expect((await upload(STORAGE_ADMIN_ID, JPEG)).status).toBe(201);
    const [initial] = await bucket().file(object).getMetadata();
    expect((await upload(STORAGE_ADMIN_ID, JPEG)).status).toBe(201);
    expect((await bucket().file(object).getMetadata())[0].generation).toBe(initial.generation);
    const replacement = await sharp(JPEG).negate().jpeg().toBuffer();
    expect((await upload(STORAGE_ADMIN_ID, replacement)).status).toBe(201);
    expect((await bucket().file(object).download())[0]).toEqual(replacement);
    expect((await quota('catalog', STORAGE_ADMIN_ID).get()).data()).toMatchObject({
      uploads: { used: 2 },
      bytes: { used: JPEG.length + replacement.length },
    });
    await getAdminFirestore()
      .doc(`users/${STORAGE_ADMIN_ID}`)
      .update({ lifecycle: { status: 'disabled' } });
    expect((await upload(STORAGE_ADMIN_ID, replacement)).status).toBe(403);
  });

  it('closes the image quota to non-owners and rejects an avatar above its own byte budget', async () => {
    const participantId = 'quota-avatar';
    const participantManagementId = 'quota-avatar-management';
    const avatar = `participant-avatars/${participantId}/avatar.jpg`;
    const upload = (uid: string) => request(uid, 'POST', avatar, {}, JPEG, handleProtectedImages);
    await seedStorageFirestore(env, async (db) => {
      const { createdAt, updatedAt, audit } = canonicalStorageBooking;
      const metadata = { revision: 1, createdAt, updatedAt, audit };
      await setDoc(doc(db, 'participants', participantId), {
        ...metadata,
        participantId,
        displayName: 'Quota avatar fixture',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId },
        lifecycle: { status: 'active' },
      });
      await setDoc(doc(db, 'participant_management', participantManagementId), {
        ...metadata,
        participantId,
        participantManagementId,
        accountId: STORAGE_USER_ID,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
      });
    });
    expect((await upload(STORAGE_OTHER_USER_ID)).status).toBe(403);
    expect((await quota('avatar', STORAGE_OTHER_USER_ID).get()).exists).toBe(false);
    const resetAt = Date.now() + 60_000;
    await quota('avatar').set({ bytes: { used: 64 * 1024 * 1024, resetAt } });
    expect(await upload(STORAGE_USER_ID)).toMatchObject({
      status: 429,
      body: { quota: { reason: 'bytes', retryAt: resetAt } },
    });
    expect((await bucket().file(avatar).exists())[0]).toBe(false);
  });
});

describe('CA-SEC-06A media upload security', () => {
  const exists = async (target: string) =>
    (await getStorage(getOrInitApp()).bucket().file(target).exists())[0];

  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
    ['video/mp4', MP4],
    ['video/webm', WEBM],
  ])('publishes an allowlisted %s payload that matches its bytes', async (type, body) => {
    const target = `chat/${canonicalStorageBooking.bookingId}/allowlisted-${type.split('/')[1]}.bin`;
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { op: 'chunk', index: '0', uploadId }, body))
        .status
    ).toBe(204);
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { op: 'finish', count: '1', uploadId, type }))
        .status
    ).toBe(201);
    const media = await request(STORAGE_USER_ID, 'GET', target);
    expect(media.status).toBe(200);
    expect(media.headers['Content-Type']).toBe(type);
    expect(media.headers['X-Content-Type-Options']).toBe('nosniff');
    // Bearer-only bytes: never rendered as a document on the Functions origin.
    expect(media.headers['Content-Disposition']).toBe('attachment');
    expect(media.headers['Cache-Control']).toBe('private, no-store');
  });

  it.each([
    { label: 'SVG declared as SVG', type: 'image/svg+xml', body: SVG },
    { label: 'SVG declared as PNG', type: 'image/png', body: SVG },
    { label: 'SVG declared as JPEG', type: 'image/jpeg', body: SVG },
    { label: 'HTML declared as WebP', type: 'image/webp', body: HTML },
    { label: 'HTML declared as PNG', type: 'image/png', body: HTML },
    { label: 'WebM bytes declared as MP4', type: 'video/mp4', body: WEBM },
    { label: 'MP4 bytes declared as WebM', type: 'video/webm', body: MP4 },
    { label: 'HTML declared as WebM', type: 'video/webm', body: HTML },
    { label: 'truncated JPEG', type: 'image/jpeg', body: Buffer.from([0xff, 0xd8, 0x00]) },
  ])('rejects spoofed content: $label', async ({ type, body }) => {
    const slug = type.replace(/[^a-zA-Z0-9]+/g, '-');
    const target = `chat/${canonicalStorageBooking.bookingId}/spoofed-${slug}-${body.length}.jpg`;
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { op: 'chunk', index: '0', uploadId }, body))
        .status
    ).toBe(204);
    expect(
      await request(STORAGE_USER_ID, 'POST', target, { op: 'finish', count: '1', uploadId, type })
    ).toMatchObject({ status: 400, body: { error: 'invalid-argument' } });
    expect(await exists(target)).toBe(false);
    const [remaining] = await getStorage(getOrInitApp())
      .bucket()
      .getFiles({ prefix: `_chat-media-uploads/${STORAGE_USER_ID}/` });
    expect(remaining).toHaveLength(0);
  });

  it.each([
    'image/svg+xml',
    'image/gif',
    'image/heic',
    'image/avif',
    'text/html',
    'application/pdf',
    'application/octet-stream',
  ])('denies the unsupported declared upload type %s', async (type) => {
    const target = `chat/${canonicalStorageBooking.bookingId}/unsupported-${type.replace(/[^a-zA-Z0-9]+/g, '-')}`;
    expect(
      (await request(STORAGE_USER_ID, 'POST', target, { op: 'chunk', index: '0', uploadId }, JPEG))
        .status
    ).toBe(204);
    expect(
      await request(STORAGE_USER_ID, 'POST', target, { op: 'finish', count: '1', uploadId, type })
    ).toMatchObject({ status: 400, body: { error: 'invalid-argument' } });
    expect(await exists(target)).toBe(false);
  });

  it('ignores the file name extension in both directions', async () => {
    // A real image keeps its bytes when the stored name is not an image name.
    const disguised = `chat/${canonicalStorageBooking.bookingId}/payload.txt`;
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', disguised, { op: 'chunk', index: '0', uploadId }, JPEG)
      ).status
    ).toBe(204);
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', disguised, {
          op: 'finish',
          count: '1',
          uploadId,
          type: 'image/jpeg',
        })
      ).status
    ).toBe(201);
    // An .jpg name never authorizes SVG bytes.
    const imageNamed = `chat/${canonicalStorageBooking.bookingId}/payload.jpg`;
    await request(STORAGE_USER_ID, 'POST', imageNamed, { op: 'chunk', index: '0', uploadId }, SVG);
    expect(
      (
        await request(STORAGE_USER_ID, 'POST', imageNamed, {
          op: 'finish',
          count: '1',
          uploadId,
          type: 'image/jpeg',
        })
      ).status
    ).toBe(400);
    expect(await exists(imageNamed)).toBe(false);
  });

  it('requires current chat authority before the type is even classified', async () => {
    const target = `chat/${canonicalStorageBooking.bookingId}/foreign.svg`;
    expect(
      (
        await request(
          STORAGE_OTHER_USER_ID,
          'POST',
          target,
          { op: 'chunk', index: '0', uploadId },
          SVG
        )
      ).status
    ).toBe(403);
    expect(
      (
        await request(STORAGE_OTHER_USER_ID, 'POST', target, {
          op: 'finish',
          count: '1',
          uploadId,
          type: 'image/svg+xml',
        })
      ).status
    ).toBe(403);
    expect(await exists(target)).toBe(false);
  });

  it('keeps already published legacy active payloads readable but inert', async () => {
    const legacy = `chat/${canonicalStorageBooking.bookingId}/legacy-hostile.svg`;
    await getStorage(getOrInitApp())
      .bucket()
      .file(legacy)
      .save(SVG, { resumable: false, metadata: { contentType: 'image/svg+xml' } });
    const media = await request(STORAGE_USER_ID, 'GET', legacy);
    expect(media.status).toBe(200);
    expect(media.headers['Content-Type']).toBe('image/svg+xml');
    expect(media.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(media.headers['Content-Disposition']).toBe('attachment');
  });

  it('applies the same byte classification to protected LIVE catalog images', async () => {
    const target = 'instructors/instructor_media_security.jpg';
    const upload = (body: Buffer) =>
      request(STORAGE_ADMIN_ID, 'POST', target, {}, body, handleProtectedImages);
    expect((await upload(JPEG)).status).toBe(201);
    // A rejected re-upload must not replace the previously published image.
    expect(await upload(SVG)).toMatchObject({ status: 400, body: { error: 'invalid-argument' } });
    expect((await upload(HTML)).status).toBe(400);
    const [stored] = await getStorage(getOrInitApp()).bucket().file(target).download();
    expect(Buffer.compare(stored, JPEG)).toBe(0);
    await expect(
      request(STORAGE_USER_ID, 'POST', target, {}, JPEG, handleProtectedImages)
    ).resolves.toMatchObject({ status: 403 });
  });

  it('denies GIF on LIVE public protected images', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .gif()
      .toBuffer();
    // TEST session misc images keep their historical GIF support (unit-tested in
    // mediaTypePolicy); LIVE public participant/catalog images do not.
    for (const target of ['instructors/instructor_media_gif.jpg', 'courses/course_media_gif.webp']) {
      expect(
        await request(STORAGE_ADMIN_ID, 'POST', target, {}, gif, handleProtectedImages)
      ).toMatchObject({ status: 400, body: { error: 'invalid-argument' } });
      expect((await getStorage(getOrInitApp()).bucket().file(target).exists())[0]).toBe(false);
    }
  });
});
