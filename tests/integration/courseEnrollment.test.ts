import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cancelBookingWithRefund } from '../../src/features/bookings/bookingTransactions';
import { CourseEnrollmentError, enrollInCourse } from '../../src/features/courses/courseTransactions';
import {
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

const courseId = 'course-1';
const bookingId = `booking_course_${USER_ID}_${courseId}`;

const seedCourse = async (availableSeats = 3, price = 150) => {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'courses', courseId), {
      title: 'Beginner Camp',
      duration: '3 days',
      description: 'Intro program',
      dates: '2026-12-10 - 2026-12-12, 10:00 - 14:00',
      totalSeats: 3,
      availableSeats,
      price,
      bgImageUrl: 'https://example.com/course.jpg',
    });
  });
};

describe('course enrollment transactions', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(true);
    await seedBookingUser(300);
    await seedCourse();
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('creates a course booking, deducts balance, and decrements available seats atomically', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    const { newBalance, bookingId: createdBookingId } = await enrollInCourse(
      userDb,
      USER_ID,
      courseId,
      'en'
    );

    const userDoc = await getDoc(doc(userDb, 'users', USER_ID));
    const courseDoc = await getDoc(doc(userDb, 'courses', courseId));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', createdBookingId));

    expect(newBalance).toBe(150);
    expect(createdBookingId).toBe(bookingId);
    expect(userDoc.data()?.balanceUSD).toBe(150);
    expect(courseDoc.data()?.availableSeats).toBe(2);
    expect(bookingDoc.data()).toMatchObject({
      userId: USER_ID,
      instructorId: `course_${courseId}`,
      status: 'confirmed',
      totalPrice: 150,
    });
  });

  it('rejects enrollment when the course is full', async () => {
    await seedCourse(0, 150);
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await expect(enrollInCourse(userDb, USER_ID, courseId, 'en')).rejects.toMatchObject({
      message: 'COURSE_FULL',
    });
  });

  it('rejects enrollment when the user has insufficient balance', async () => {
    await seedCourse(3, 400);
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await expect(enrollInCourse(userDb, USER_ID, courseId, 'en')).rejects.toMatchObject({
      message: 'INSUFFICIENT_FUNDS',
    });
  });

  it('allows re-enrollment after a cancelled course booking', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();

    await enrollInCourse(userDb, USER_ID, courseId, 'en');
    await cancelBookingWithRefund(adminDb, bookingId);

    const { newBalance } = await enrollInCourse(userDb, USER_ID, courseId, 'en');

    const bookingDoc = await getDoc(doc(userDb, 'bookings', bookingId));
    expect(newBalance).toBe(150);
    expect(bookingDoc.data()?.status).toBe('confirmed');
  });

  it('rejects duplicate enrollment for the same active course booking', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await enrollInCourse(userDb, USER_ID, courseId, 'en');

    await expect(enrollInCourse(userDb, USER_ID, courseId, 'en')).rejects.toBeInstanceOf(
      CourseEnrollmentError
    );
    await expect(enrollInCourse(userDb, USER_ID, courseId, 'en')).rejects.toMatchObject({
      message: 'ALREADY_ENROLLED',
    });
  });
});
