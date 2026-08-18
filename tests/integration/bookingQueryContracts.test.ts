import { doc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getBookingHistoryPage } from '../../src/features/bookings/bookingHistoryService';
import { getRealtimeBookingsQuery } from '../../src/features/bookings/bookingRealtimeService';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
} from './helpers';

const NOW = new Date('2026-01-08T12:00:00.000Z');
const USER_ID = 'student-a';
const OTHER_USER_ID = 'student-b';
const INSTRUCTOR_ID = 'instructor-a';
const OTHER_INSTRUCTOR_ID = 'instructor-b';

const booking = (
  id: string,
  overrides: Partial<{ userId: string; instructorId: string; status: string; date: string }> = {}
) => ({
  id,
  userId: USER_ID,
  instructorId: INSTRUCTOR_ID,
  status: 'pending',
  date: '2026-01-02',
  time: '10:00',
  durationHours: 1,
  totalPrice: 100,
  difficulty: 'beginner',
  ...overrides,
});

const ids = (snapshot: Awaited<ReturnType<typeof getDocs>>) => snapshot.docs.map((item) => item.id);

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

  it('keeps realtime bookings inside student, instructor, and admin scopes', async () => {
    await seedBookings([
      booking('student-pending'),
      booking('student-confirmed', { status: 'confirmed', date: '2026-01-03' }),
      booking('other-student', { userId: OTHER_USER_ID, date: '2026-01-04' }),
      booking('other-instructor', {
        userId: OTHER_USER_ID,
        instructorId: OTHER_INSTRUCTOR_ID,
        date: '2026-01-05',
      }),
    ]);
    const firestore = integrationTestEnv().authenticatedContext('owner-1').firestore();

    expect(
      ids(
        await getDocs(
          getRealtimeBookingsQuery(firestore, { kind: 'student', userId: USER_ID }, NOW)
        )
      )
    ).toEqual(['student-confirmed', 'student-pending']);
    expect(
      ids(
        await getDocs(
          getRealtimeBookingsQuery(
            firestore,
            { kind: 'instructor', instructorId: INSTRUCTOR_ID },
            NOW
          )
        )
      )
    ).toEqual(['other-student', 'student-confirmed', 'student-pending']);
    expect(ids(await getDocs(getRealtimeBookingsQuery(firestore, { kind: 'admin' }, NOW)))).toEqual(
      ['other-instructor', 'other-student', 'student-confirmed', 'student-pending']
    );
  });

  it('keeps only pending and confirmed bookings in the seven-day hot window, including its boundary', async () => {
    await seedBookings([
      booking('cutoff', { date: '2026-01-01' }),
      booking('old', { date: '2025-12-31' }),
      booking('completed', { status: 'completed' }),
      booking('cancelled', { status: 'cancelled' }),
      booking('confirmed', { status: 'confirmed' }),
    ]);
    const firestore = integrationTestEnv().authenticatedContext('owner-1').firestore();

    expect(ids(await getDocs(getRealtimeBookingsQuery(firestore, { kind: 'admin' }, NOW)))).toEqual(
      ['confirmed', 'cancelled', 'completed', 'cutoff'].filter((id) =>
        ['confirmed', 'cutoff'].includes(id)
      )
    );
  });

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
