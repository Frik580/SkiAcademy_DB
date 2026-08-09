import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOTS_COLLECTION, toAvailabilitySlot } from '../../src/lib/availabilitySlots';
import {
  BookingSlotOverlapError,
  InsufficientFundsError,
  cancelBookingWithRefund,
  createBookingWithPayment,
  rescheduleBooking,
} from '../../src/lib/bookingTransactions';
import { addHourLocksToBatch } from '../helpers/hourLockFixtures';
import type { Booking } from '../../src/types';
import {
  INSTRUCTOR_ID,
  OWNER_ID,
  OTHER_USER_ID,
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedBookingUser,
  seedInstructor,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

const lessonBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-lesson-1',
  userId: USER_ID,
  instructorId: INSTRUCTOR_ID,
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: '2026-12-02',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

describe('booking transactions', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(true);
    await seedBookingUser(100);
    await seedInstructor(50);
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('creates a booking, deducts balance, and writes a synchronized availability slot', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking();

    const { newBalance, totalPrice } = await createBookingWithPayment(userDb, USER_ID, booking);

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(newBalance).toBe(0);
    expect(totalPrice).toBe(100);
    expect(userDoc.data()?.balanceUSD).toBe(0);
    expect(bookingDoc.data()?.status).toBe('confirmed');
    expect(slotDoc.data()).toEqual(toAvailabilitySlot(booking));
  });

  it('charges the instructor rate even when the client sends a manipulated totalPrice', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking({ id: 'booking-price-tamper', totalPrice: 0 });

    const { newBalance, totalPrice } = await createBookingWithPayment(userDb, USER_ID, booking);

    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));

    expect(totalPrice).toBe(100);
    expect(newBalance).toBe(0);
    expect(bookingDoc.data()?.totalPrice).toBe(100);
  });

  it('rejects booking creation when the instructor slot already overlaps', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const otherUserDb = integrationTestEnv()
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();

    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', OTHER_USER_ID), {
        ...userProfile(OTHER_USER_ID, 'other@example.com', 'user'),
        balanceUSD: 100,
      });
    });

    const firstBooking = lessonBooking({ id: 'booking-first' });
    await createBookingWithPayment(userDb, USER_ID, firstBooking);

    const overlappingBooking = lessonBooking({
      id: 'booking-overlap',
      userId: OTHER_USER_ID,
      time: '11:00',
      durationHours: 2,
    });

    await expect(
      createBookingWithPayment(otherUserDb, OTHER_USER_ID, overlappingBooking)
    ).rejects.toBeInstanceOf(BookingSlotOverlapError);

    const overlapDoc = await getDoc(doc(otherUserDb, 'bookings', overlappingBooking.id));
    const otherUserDoc = await getDoc(doc(otherUserDb, 'users', OTHER_USER_ID));

    expect(overlapDoc.exists()).toBe(false);
    expect(otherUserDoc.data()?.balanceUSD).toBe(100);
  });

  it('rejects booking creation when the user has insufficient balance', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking({ id: 'booking-too-expensive', durationHours: 3 });

    await expect(createBookingWithPayment(userDb, USER_ID, booking)).rejects.toBeInstanceOf(
      InsufficientFundsError
    );

    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const bookingDoc = await getDoc(doc(adminDb, 'bookings', booking.id));
    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));

    expect(bookingDoc.exists()).toBe(false);
    expect(userDoc.data()?.balanceUSD).toBe(100);
  });

  it('cancels a lesson booking, refunds balance, and removes the availability slot', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking();

    await createBookingWithPayment(userDb, USER_ID, booking);
    const { refunded } = await cancelBookingWithRefund(userDb, booking.id);

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(refunded).toBe(100);
    expect(userDoc.data()?.balanceUSD).toBe(100);
    expect(bookingDoc.data()?.status).toBe('cancelled');
    expect(slotDoc.exists()).toBe(false);
  });

  it('restores a course seat when a course booking is cancelled', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const courseBookingId = `booking_course_${USER_ID}_course-1`;
    const courseBooking = lessonBooking({
      id: courseBookingId,
      instructorId: 'course_course-1',
      instructorName: 'Group Course',
      totalPrice: 200,
    });

    await seedData(async (context) => {
      const db = context.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'courses', 'course-1'), {
        title: 'Course',
        totalSeats: 5,
        availableSeats: 2,
        price: 200,
      });
      batch.set(doc(db, 'bookings', courseBookingId), courseBooking);
      await batch.commit();
    });

    await cancelBookingWithRefund(userDb, courseBookingId);

    const courseDoc = await getDoc(doc(userDb, 'courses', 'course-1'));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', courseBookingId));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, courseBookingId));

    expect(courseDoc.data()?.availableSeats).toBe(3);
    expect(bookingDoc.data()?.status).toBe('cancelled');
    expect(slotDoc.exists()).toBe(false);
  });

  it('allows an admin to cancel another user course booking, refund balance, and restore the seat', async () => {
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const courseBookingId = `booking_course_${USER_ID}_course-1`;
    const courseBooking = lessonBooking({
      id: courseBookingId,
      instructorId: 'course_course-1',
      instructorName: 'Group Course',
      totalPrice: 200,
    });

    await seedData(async (context) => {
      const db = context.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com', 'user'),
        balanceUSD: 0,
      });
      batch.set(doc(db, 'courses', 'course-1'), {
        title: 'Course',
        totalSeats: 5,
        availableSeats: 2,
        price: 200,
      });
      batch.set(doc(db, 'bookings', courseBookingId), courseBooking);
      await batch.commit();
    });

    const { refunded } = await cancelBookingWithRefund(adminDb, courseBookingId);

    const userDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    const courseDoc = await getDoc(doc(adminDb, 'courses', 'course-1'));
    const bookingDoc = await getDoc(doc(adminDb, 'bookings', courseBookingId));

    expect(refunded).toBe(200);
    expect(userDoc.data()?.balanceUSD).toBe(200);
    expect(courseDoc.data()?.availableSeats).toBe(3);
    expect(bookingDoc.data()?.status).toBe('cancelled');
  });

  it('allows an admin to cancel another user lesson booking and refund balance', async () => {
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const booking = lessonBooking();

    await seedData(async (context) => {
      const db = context.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com', 'user'),
        balanceUSD: 0,
      });
      batch.set(doc(db, 'bookings', booking.id), booking);
      addHourLocksToBatch(batch, db, booking);
      batch.set(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id), toAvailabilitySlot(booking));
      await batch.commit();
    });

    const { refunded } = await cancelBookingWithRefund(adminDb, booking.id);

    const userDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    const bookingDoc = await getDoc(doc(adminDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(refunded).toBe(100);
    expect(userDoc.data()?.balanceUSD).toBe(100);
    expect(bookingDoc.data()?.status).toBe('cancelled');
    expect(slotDoc.exists()).toBe(false);
  });

  it('skips balance refund for guest bookings during admin cancellation', async () => {
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();
    const guestBooking = lessonBooking({
      id: 'booking-guest-1',
      userId: 'guest_abc123',
      isGuest: true,
      guestName: 'Walk-in Guest',
      totalPrice: 80,
    });

    await seedData(async (context) => {
      const db = context.firestore();
      const batch = writeBatch(db);
      batch.set(doc(db, 'bookings', guestBooking.id), guestBooking);
      addHourLocksToBatch(batch, db, guestBooking);
      batch.set(
        doc(db, AVAILABILITY_SLOTS_COLLECTION, guestBooking.id),
        toAvailabilitySlot(guestBooking)
      );
      await batch.commit();
    });

    const { refunded } = await cancelBookingWithRefund(adminDb, guestBooking.id);

    const bookingDoc = await getDoc(doc(adminDb, 'bookings', guestBooking.id));
    const slotDoc = await getDoc(doc(adminDb, AVAILABILITY_SLOTS_COLLECTION, guestBooking.id));

    expect(refunded).toBe(80);
    expect(bookingDoc.data()?.status).toBe('cancelled');
    expect(slotDoc.exists()).toBe(false);
  });

  it('keeps booking and slot updates synchronized during reschedule', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking();

    await createBookingWithPayment(userDb, USER_ID, booking);

    await rescheduleBooking(userDb, booking.id, { date: '2026-12-03', time: '11:00' });

    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(bookingDoc.data()).toMatchObject({
      date: '2026-12-03',
      time: '11:00',
    });
    expect(slotDoc.data()).toEqual(
      toAvailabilitySlot({ ...booking, date: '2026-12-03', time: '11:00' })
    );
  });

  it('rejects reschedule when the new slot overlaps another booking', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com', 'user'),
        balanceUSD: 300,
      });
    });

    await createBookingWithPayment(userDb, USER_ID, lessonBooking({ id: 'booking-occupied' }));
    const movable = lessonBooking({
      id: 'booking-movable',
      date: '2026-12-03',
      time: '08:00',
    });
    await createBookingWithPayment(userDb, USER_ID, movable);

    await expect(
      rescheduleBooking(userDb, movable.id, { date: '2026-12-02', time: '11:00' })
    ).rejects.toBeInstanceOf(BookingSlotOverlapError);

    const bookingDoc = await getDoc(doc(userDb, 'bookings', movable.id));
    expect(bookingDoc.data()).toMatchObject({ date: '2026-12-03', time: '08:00' });
  });
});
