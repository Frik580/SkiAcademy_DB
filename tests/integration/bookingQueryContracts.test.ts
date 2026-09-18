import { doc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getBookingHistoryPage } from '../../src/features/bookings/bookingHistoryService';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
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
  beforeAll(setupIntegrationTestEnvironment);
  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag();
  });
  afterAll(teardownIntegrationTestEnvironment);

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
    const firestore = integrationTestEnv().authenticatedContext('owner-1').firestore();

    const first = await getBookingHistoryPage(
      { kind: 'student', userId: USER_ID },
      null,
      firestore
    );
    const second = await getBookingHistoryPage(
      { kind: 'student', userId: USER_ID },
      first.cursor,
      firestore
    );
    const receivedIds = [...first.bookings, ...second.bookings].map((item) => item.id);

    expect(first.bookings).toHaveLength(20);
    expect(second.bookings).toHaveLength(2);
    expect(new Set(receivedIds)).toHaveLength(22);
    expect(receivedIds).not.toContain('wrong-user');
    expect(receivedIds).not.toContain('not-history');
  });
});
