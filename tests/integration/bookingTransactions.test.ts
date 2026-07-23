import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  toAvailabilitySlot,
} from '../../src/lib/availabilitySlots';
import {
  InsufficientFundsError,
  cancelBookingWithRefund,
  createBookingWithPayment,
} from '../../src/lib/bookingTransactions';
import type { Booking } from '../../src/types';
import {
  INSTRUCTOR_ID,
  OWNER_ID,
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedBookingUser,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
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
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('creates a booking, deducts balance, and writes a synchronized availability slot', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking();

    const newBalance = await createBookingWithPayment(userDb, USER_ID, booking, 100);

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(newBalance).toBe(0);
    expect(userDoc.data()?.balanceUSD).toBe(0);
    expect(bookingDoc.data()?.status).toBe('confirmed');
    expect(slotDoc.data()).toEqual(toAvailabilitySlot(booking));
  });

  it('rejects booking creation when the user has insufficient balance', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking({ id: 'booking-too-expensive', totalPrice: 150 });

    await expect(
      createBookingWithPayment(userDb, USER_ID, booking, 150)
    ).rejects.toBeInstanceOf(InsufficientFundsError);

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

    await createBookingWithPayment(userDb, USER_ID, booking, 100);
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

  it('keeps booking and slot updates synchronized during reschedule', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const booking = lessonBooking();

    await createBookingWithPayment(userDb, USER_ID, booking, 100);

    const rescheduledBooking = { ...booking, date: '2026-12-03', time: '11:00' };
    const batch = writeBatch(userDb);
    batch.update(doc(userDb, 'bookings', booking.id), {
      date: rescheduledBooking.date,
      time: rescheduledBooking.time,
    });
    if (blocksInstructorAvailability(rescheduledBooking)) {
      batch.set(
        doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id),
        toAvailabilitySlot(rescheduledBooking)
      );
    }
    await batch.commit();

    const bookingDoc = await getDoc(doc(userDb, 'bookings', booking.id));
    const slotDoc = await getDoc(doc(userDb, AVAILABILITY_SLOTS_COLLECTION, booking.id));

    expect(bookingDoc.data()).toMatchObject({
      date: '2026-12-03',
      time: '11:00',
    });
    expect(slotDoc.data()).toEqual(toAvailabilitySlot(rescheduledBooking));
  });
});
