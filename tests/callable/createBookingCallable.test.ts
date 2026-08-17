import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOTS_COLLECTION } from '../../src/domain/availability';
import type { Booking } from '../../src/types';
import {
  CALLABLE_INSTRUCTOR_ID,
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

const lessonBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-callable-1',
  userId: getCallableUserId(),
  instructorId: CALLABLE_INSTRUCTOR_ID,
  instructorName: 'Callable Instructor',
  instructorAvatar: 'https://example.com/instructor.jpg',
  date: '2026-12-02',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

const createBookingPayload = (booking: Booking) => ({
  id: booking.id,
  instructorId: booking.instructorId,
  instructorName: booking.instructorName,
  instructorAvatar: booking.instructorAvatar,
  date: booking.date,
  time: booking.time,
  durationHours: booking.durationHours,
  status: booking.status,
  difficulty: booking.difficulty,
});

describe('createBooking callable', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await setupCallableIntegrationEnvironment();
    await ensureCallableSignedInUser();
    await seedCallableBaseFixtures();
    await seedCallableUserProfile(500);

    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking(createBookingPayload(lessonBooking({ id: 'warmup-booking' })));
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

  it('creates a booking through the createBooking Cloud Function', async () => {
    const booking = lessonBooking();
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');

    const { data } = await createBooking(createBookingPayload(booking));

    const result = data as { bookingId: string; totalPrice: number; newBalance: number };

    expect(result.bookingId).toBe(booking.id);
    expect(result.totalPrice).toBe(100);
    expect(result.newBalance).toBe(400);
    expect(await readCallableUserBalance()).toBe(400);

    const bookingDoc = await getDoc(doc(getCallableFirestore(), 'bookings', booking.id));
    const slotDoc = await getDoc(
      doc(getCallableFirestore(), AVAILABILITY_SLOTS_COLLECTION, booking.id)
    );

    expect(bookingDoc.data()).toMatchObject({
      userId: getCallableUserId(),
      instructorId: CALLABLE_INSTRUCTOR_ID,
      status: 'confirmed',
      totalPrice: 100,
    });
    expect(slotDoc.exists()).toBe(true);
  });

  it('creates a booking when instructorAvatar is empty', async () => {
    const booking = lessonBooking({ id: 'booking-callable-empty-avatar', instructorAvatar: '' });
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');

    const { data } = await createBooking(createBookingPayload(booking));

    const result = data as { bookingId: string; totalPrice: number; newBalance: number };
    expect(result.bookingId).toBe(booking.id);
    expect(result.totalPrice).toBe(100);
  });

  it('maps insufficient funds to failed-precondition', async () => {
    await seedCallableUserProfile(50);
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');

    await expect(
      createBooking(createBookingPayload(lessonBooking({ id: 'booking-callable-insufficient' })))
    ).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    } satisfies Partial<FirebaseError>);
  });

  it('maps overlapping slots to aborted', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    const first = lessonBooking({ id: 'booking-callable-first' });
    const overlapping = lessonBooking({
      id: 'booking-callable-overlap',
      time: '11:00',
    });

    await createBooking(createBookingPayload(first));

    await expect(createBooking(createBookingPayload(overlapping))).rejects.toMatchObject({
      code: 'functions/aborted',
    } satisfies Partial<FirebaseError>);
  });
});
