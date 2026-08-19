import { FirebaseError } from 'firebase/app';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOTS_COLLECTION } from '../../src/domain/availability';
import { AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockIds } from '@ski-academy/shared-domain';
import {
  CALLABLE_INSTRUCTOR_ID,
  clearCallableFirestore,
  ensureCallableSignedInUser,
  getCallableFirestore,
  getCallableFunctions,
  getCallableUserId,
  getRulesTestEnv,
  seedCallableBaseFixtures,
  seedCallableUserProfile,
  setupCallableIntegrationEnvironment,
  teardownCallableIntegrationEnvironment,
} from './callableTestEnv';

const BOOKING_ID = 'booking-callable-lifecycle';

async function promoteCallableUserToAdmin() {
  const uid = getCallableUserId();
  await getRulesTestEnv().withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'users', uid),
      {
        uid,
        email: 'callable-user@example.com',
        displayName: 'Callable Admin',
        role: 'admin',
        avatarUrl: '',
        balanceUSD: 500,
      },
      { merge: true }
    );
  });
}

describe('booking lifecycle callables', { timeout: 30_000 }, () => {
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
  });

  afterAll(async () => {
    await teardownCallableIntegrationEnvironment();
  });

  it('rejects student completion and lets an admin delete hour locks', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking({
      id: BOOKING_ID,
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      instructorAvatar: '',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      status: 'confirmed',
      difficulty: 'beginner',
    });

    const completeBooking = httpsCallable(getCallableFunctions(), 'completeBooking');
    await expect(completeBooking({ bookingId: BOOKING_ID })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    } satisfies Partial<FirebaseError>);

    await promoteCallableUserToAdmin();

    const db = getCallableFirestore();
    const lockIds = buildHourLockIds({
      instructorId: CALLABLE_INSTRUCTOR_ID,
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
    });
    expect((await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, BOOKING_ID))).exists()).toBe(true);
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      true
    );

    const deleteBooking = httpsCallable(getCallableFunctions(), 'deleteBooking');
    const { data } = await deleteBooking({ bookingId: BOOKING_ID });
    expect(data).toMatchObject({ bookingId: BOOKING_ID, isDeletedDoc: true });

    expect((await getDoc(doc(db, 'bookings', BOOKING_ID))).exists()).toBe(false);
    expect((await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, BOOKING_ID))).exists()).toBe(false);
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      false
    );
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[1]))).exists()).toBe(
      false
    );
  });

  it('lets the owner request cancellation', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking({
      id: BOOKING_ID,
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      instructorAvatar: '',
      date: '2026-12-03',
      time: '11:00',
      durationHours: 1,
      status: 'confirmed',
      difficulty: 'beginner',
    });

    const requestBookingCancellation = httpsCallable(
      getCallableFunctions(),
      'requestBookingCancellation'
    );
    const { data } = await requestBookingCancellation({
      bookingId: BOOKING_ID,
      reason: 'schedule conflict',
    });
    expect(data).toEqual({ bookingId: BOOKING_ID, status: 'pending_cancellation' });

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', BOOKING_ID));
    expect(booking.data()?.status).toBe('pending_cancellation');
    expect(booking.data()?.cancellationReason).toBe('schedule conflict');
  });
});
