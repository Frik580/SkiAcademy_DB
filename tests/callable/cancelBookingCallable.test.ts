import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOTS_COLLECTION } from '../../src/domain/availability';
import {
  clearCallableFirestore,
  ensureCallableSignedInUser,
  getCallableFirestore,
  getCallableFunctions,
  getCallableUserId,
  readCallableUserBalance,
  seedCallableBaseFixtures,
  seedCallableUserProfile,
  setupCallableIntegrationEnvironment,
  teardownCallableIntegrationEnvironment,
} from './callableTestEnv';

const BOOKING_ID = 'booking-callable-cancel';

describe('cancelBooking callable', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await setupCallableIntegrationEnvironment();
    await ensureCallableSignedInUser();
    await seedCallableBaseFixtures();
    await seedCallableUserProfile(500);
  }, 60_000);

  beforeEach(async () => {
    await clearCallableFirestore();
    await ensureCallableSignedInUser();
    await seedCallableBaseFixtures();
    await seedCallableUserProfile(500);

    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking({
      id: BOOKING_ID,
      instructorId: 'callable-instructor-1',
      instructorName: 'Callable Instructor',
      instructorAvatar: '',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      status: 'confirmed',
      difficulty: 'beginner',
    });
  });

  afterAll(async () => {
    await teardownCallableIntegrationEnvironment();
  });

  it('cancels, refunds, removes availability, and is idempotent', async () => {
    const cancelBooking = httpsCallable(getCallableFunctions(), 'cancelBooking');

    const { data } = await cancelBooking({ bookingId: BOOKING_ID });
    expect(data).toEqual({ refunded: 100, alreadyCancelled: false });
    expect(await readCallableUserBalance()).toBe(500);

    const db = getCallableFirestore();
    expect((await getDoc(doc(db, 'bookings', BOOKING_ID))).data()?.status).toBe('cancelled');
    expect((await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, BOOKING_ID))).exists()).toBe(false);
    expect(
      (await getDoc(doc(db, 'wallet_ledger', `wl_refund_${BOOKING_ID}`))).data()
    ).toMatchObject({
      userId: getCallableUserId(),
      amount: 100,
      type: 'refund',
    });

    const second = await cancelBooking({ bookingId: BOOKING_ID });
    expect(second.data).toEqual({ refunded: 0, alreadyCancelled: true });
    expect(await readCallableUserBalance()).toBe(500);
  });
});
