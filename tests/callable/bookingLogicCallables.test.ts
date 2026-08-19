import { FirebaseError } from 'firebase/app';
import { doc, getDoc } from 'firebase/firestore';
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
  promoteCallableUserToAdmin,
  readCallableUserBalance,
  seedCallableBaseFixtures,
  seedCallableUserProfile,
  setupCallableIntegrationEnvironment,
  teardownCallableIntegrationEnvironment,
} from './callableTestEnv';

const lessonPayload = (overrides: Record<string, unknown> = {}) => ({
  instructorId: CALLABLE_INSTRUCTOR_ID,
  instructorName: 'Callable Instructor',
  instructorAvatar: '',
  date: '2026-12-04',
  time: '10:00',
  durationHours: 2,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

describe('bookingLogic callable transactions', { timeout: 30_000 }, () => {
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

  it('rejects a reused booking ID with a different payload and a new idempotency key', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking(
      lessonPayload({ id: 'booking-id-reuse', idempotencyKey: 'create-original' })
    );

    await expect(
      createBooking(
        lessonPayload({
          id: 'booking-id-reuse',
          time: '14:00',
          idempotencyKey: 'create-overwrite',
        })
      )
    ).rejects.toMatchObject({
      code: 'functions/already-exists',
      message: expect.stringContaining('A booking with this ID already exists'),
    } satisfies Partial<FirebaseError>);

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', 'booking-id-reuse'));
    expect(booking.data()?.time).toBe('10:00');
    expect(await readCallableUserBalance()).toBe(400);
  });

  it('does not let createGuestBooking overwrite an existing paid booking', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');

    await createBooking(
      lessonPayload({ id: 'booking-paid-protected', idempotencyKey: 'paid-protected' })
    );

    await expect(
      createGuestBooking({
        id: 'booking-paid-protected',
        userId: 'guest_overwrite',
        instructorId: CALLABLE_INSTRUCTOR_ID,
        instructorName: 'Callable Instructor',
        date: '2026-12-04',
        time: '15:00',
        durationHours: 1,
        difficulty: 'beginner',
        idempotencyKey: 'guest-overwrite',
      })
    ).rejects.toMatchObject({
      code: 'functions/already-exists',
    } satisfies Partial<FirebaseError>);

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', 'booking-paid-protected'));
    expect(booking.data()?.userId).toBe(getCallableUserId());
    expect(booking.data()?.isGuest).not.toBe(true);
    expect(booking.data()?.time).toBe('10:00');
    expect(booking.data()?.status).toBe('confirmed');
  });

  it('links a confirmed guest booking once and does not charge again on repeat', async () => {
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const linkGuestBooking = httpsCallable(getCallableFunctions(), 'linkGuestBooking');
    const targetUserId = getCallableUserId();

    await createGuestBooking({
      id: 'booking-guest-link',
      userId: 'guest_link_user',
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      date: '2026-12-05',
      time: '09:00',
      durationHours: 2,
      difficulty: 'beginner',
      idempotencyKey: 'guest-link-create',
    });

    await promoteCallableUserToAdmin(500);
    await confirmBooking({ bookingId: 'booking-guest-link', idempotencyKey: 'guest-link-confirm' });

    const first = await linkGuestBooking({
      bookingId: 'booking-guest-link',
      targetUserId,
      idempotencyKey: 'guest-link-1',
    });
    expect(first.data).toEqual({ newBalance: 400 });
    expect(await readCallableUserBalance()).toBe(400);

    const second = await linkGuestBooking({
      bookingId: 'booking-guest-link',
      targetUserId,
      idempotencyKey: 'guest-link-2',
    });
    expect(second.data).toEqual({ newBalance: 400 });
    expect(await readCallableUserBalance()).toBe(400);

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', 'booking-guest-link'));
    expect(booking.data()).toMatchObject({
      userId: targetUserId,
      isGuest: false,
      status: 'confirmed',
    });
  });

  it('releases hour locks when an admin completes a lesson', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    const completeBooking = httpsCallable(getCallableFunctions(), 'completeBooking');
    const db = getCallableFirestore();
    const bookingId = 'booking-complete-locks';

    await createBooking(lessonPayload({ id: bookingId, idempotencyKey: 'complete-create' }));
    await promoteCallableUserToAdmin(400);

    const lockIds = buildHourLockIds({
      instructorId: CALLABLE_INSTRUCTOR_ID,
      date: '2026-12-04',
      time: '10:00',
      durationHours: 2,
    });
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      true
    );

    const first = await completeBooking({ bookingId, idempotencyKey: 'complete-1' });
    expect(first.data).toEqual({ bookingId, status: 'completed' });

    expect((await getDoc(doc(db, 'bookings', bookingId))).data()?.status).toBe('completed');
    expect((await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId))).exists()).toBe(false);
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      false
    );
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[1]))).exists()).toBe(
      false
    );

    const second = await completeBooking({ bookingId, idempotencyKey: 'complete-2' });
    expect(second.data).toEqual({ bookingId, status: 'completed' });
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      false
    );
  });
});
