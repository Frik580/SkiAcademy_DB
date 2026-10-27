import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
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
import {
  TestActorSchema,
  TestActorAssignmentSchema,
  TestSessionSchema,
} from '@ski-academy/shared-domain';

let env: RulesTestEnvironment;
const tokens = new Map<string, string>();
const path = `chat/${canonicalStorageBooking.bookingId}/photo.jpg`;
const uploadId = '11111111-1111-4111-8111-111111111111';

async function request(
  uid: string | null,
  method = 'GET',
  target = path,
  query: Record<string, string> = {},
  body = Buffer.alloc(0)
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
  await handleBookingChatMedia(
    {
      method,
      query: { path: target, ...query },
      rawBody: body,
      get: () => (uid ? `Bearer ${tokens.get(uid)}` : undefined),
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
          Buffer.from('media')
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
      expect(bytes.toString()).toBe('media');
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
          Buffer.from('media')
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
    expect((await request(STORAGE_USER_ID, 'GET', target)).body).toEqual(Buffer.from('media'));
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
            Buffer.from('media')
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
        await setDoc(doc(db, 'users', uid), { lifecycle: { status: 'active' } }, { merge: true });
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
    expect((await request(STORAGE_ADMIN_ID, 'GET', testPath)).status).toBe(200);
    expect((await request(STORAGE_TEST_ACTOR_B_ID, 'GET', testPath)).status).toBe(403);
    expect((await request(STORAGE_USER_ID, 'GET', testPath)).status).toBe(403);
    expect((await request(STORAGE_TEST_ACTOR_ID)).status).toBe(403);
    expect((await request(STORAGE_ADMIN_ID, 'GET', 'chat/booking_test_a/photo.jpg')).status).toBe(
      403
    );
    await seedStorageFirestore(env, async (db) => {
      await setDoc(doc(db, 'test_sessions', STORAGE_TEST_SESSION_A), { status: 'locked' });
    });
    expect((await request(STORAGE_ADMIN_ID, 'GET', testPath)).status).toBe(403);
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
            Buffer.alloc(size)
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
        expect(
          (
            await request(
              STORAGE_USER_ID,
              'POST',
              target,
              { op: 'chunk', uploadId, index: String(i) },
              Buffer.alloc(Math.min(chunkSize, size - i * chunkSize))
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
