import { doc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getBookingHistoryPage } from '../../src/features/bookings/bookingHistoryService';
import { createRequire } from 'node:module';
const adminRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = adminRequire('firebase-admin/app');
const { getFirestore } = adminRequire('firebase-admin/firestore');
import { createQueryScopedClientDocuments } from '../../functions/src/security/scopedClientReads';
import {
  clearIntegrationFirestore,
  PROJECT_ID,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

const USER_ID = 'student-a';
const OTHER_USER_ID = 'student-b';
const INSTRUCTOR_ID = 'instructor-a';

const booking = (
  id: string,
  overrides: Partial<{ userId: string; instructorId: string; status: string; date: string }> = {}
) => ({
  id,
  userId: USER_ID,
  instructorId: INSTRUCTOR_ID,
  instructorName: 'Instructor A',
  instructorAvatar: '',
  status: 'pending',
  date: '2026-01-02',
  time: '10:00',
  durationHours: 1,
  totalPrice: 100,
  difficulty: 'beginner',
  ...overrides,
});

describe('booking query contracts', () => {
  let app: ReturnType<typeof initializeApp>;
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
    app = initializeApp({ projectId: PROJECT_ID }, 'scoped-client-query-tests');
  });
  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag();
    await seedData(async (context) => {
      for (const uid of [USER_ID, OTHER_USER_ID]) {
        await setDoc(
          doc(context.firestore(), 'users', uid),
          userProfile(uid, `${uid}@example.com`)
        );
      }
    });
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
    await teardownIntegrationTestEnvironment();
  });

  it('hides a known TEST id like a missing public document and keeps legacy LIVE visible', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'courses', 'hidden'), { dataScope: 'test', testSessionId: 'session-a' });
      await setDoc(doc(db, 'courses', 'legacy-live'), { title: 'Live course' });
    });
    const handler = createQueryScopedClientDocuments(getFirestore(app), 'local-test-key');
    const read = (id: string) =>
      handler({
        data: {
          collection: 'courses',
          take: 1,
          where: [{ field: '__name__', op: '==', value: id }],
        },
      } as never);
    expect(await read('hidden')).toEqual(await read('missing'));
    expect((await read('legacy-live')).docs.map((row) => row.id)).toEqual(['legacy-live']);
  });

  it('denies a TEST-stamped Account whose registry is absent', async () => {
    await seedData(async (context) =>
      setDoc(doc(context.firestore(), 'users', USER_ID), {
        ...userProfile(USER_ID, 'student@example.com'),
        dataScope: 'test',
      })
    );
    const handler = createQueryScopedClientDocuments(getFirestore(app), 'local-test-key');
    await expect(
      handler({ auth: { uid: USER_ID }, data: { collection: 'courses', take: 1 } } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  async function seedBookings(records: ReturnType<typeof booking>[]) {
    await seedData(async (context) => {
      const firestore = context.firestore();
      await Promise.all(
        records.map((record) => setDoc(doc(firestore, 'bookings', record.id), record))
      );
    });
  }

  it('paginates historical statuses without duplicates and keeps other users out', async () => {
    await seedBookings([
      ...Array.from({ length: 22 }, (_, index) =>
        booking(`history-${String(index).padStart(2, '0')}`, {
          status: index % 2 === 0 ? 'completed' : 'pending_cancellation',
          date: `2025-12-${String(30 - index).padStart(2, '0')}`,
        })
      ),
      booking('wrong-user', { userId: OTHER_USER_ID, status: 'completed', date: '2025-12-31' }),
      booking('not-history', { status: 'confirmed', date: '2025-12-31' }),
    ]);
    const handler = createQueryScopedClientDocuments(getFirestore(app), 'local-test-key');
    const readPage: NonNullable<Parameters<typeof getBookingHistoryPage>[2]> = (input, cursor) =>
      handler({
        auth: { uid: USER_ID },
        data: { ...input, ...(cursor ? { cursor } : {}) },
      } as never) as ReturnType<NonNullable<Parameters<typeof getBookingHistoryPage>[2]>>;

    const first = await getBookingHistoryPage({ kind: 'student', userId: USER_ID }, null, readPage);
    const second = await getBookingHistoryPage(
      { kind: 'student', userId: USER_ID },
      first.cursor,
      readPage
    );
    const receivedIds = [...first.bookings, ...second.bookings].map((item) => item.id);

    expect(first.bookings).toHaveLength(20);
    expect(second.bookings).toHaveLength(2);
    expect(new Set(receivedIds)).toHaveLength(22);
    expect(receivedIds).not.toContain('wrong-user');
    expect(receivedIds).not.toContain('not-history');
  });
});
