import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cancelBookingWithRefund } from '../../src/features/bookings/bookingTransactions';
import { enrollInCourse } from '../../src/features/courses/courseTransactions';
import {
  OWNER_ID,
  USER_ID,
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

const courseId = 'course-1';

async function withPrivilegedDb<T>(run: (db: Firestore) => Promise<T>): Promise<T> {
  return seedData((context) => run(context.firestore()));
}

const seedCourse = async (availableSeats = 5, price = 200) => {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'courses', courseId), {
      title: 'Freeride Camp',
      duration: '5 days',
      description: 'Advanced freeride program',
      dates: '2026-12-01 - 2026-12-05, 09:00 - 15:00',
      totalSeats: 5,
      availableSeats,
      price,
      bgImageUrl: 'https://example.com/course.jpg',
    });
  });
};

describe('course enrollment end-to-end flow', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(true);
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com', 'user'),
        balanceUSD: 500,
      });
    });
    await seedCourse();
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('enrolls a client on a course and lets an admin cancel the booking with refund', async () => {
    const userDb = integrationTestEnv()
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const adminDb = integrationTestEnv().authenticatedContext(OWNER_ID).firestore();

    const { newBalance, bookingId } = await withPrivilegedDb((db) =>
      enrollInCourse(db, USER_ID, courseId, 'en')
    );

    expect(newBalance).toBe(300);
    expect(bookingId).toBe(`booking_course_${USER_ID}_${courseId}`);

    const enrolledUserDoc = await getDoc(doc(userDb, 'users', USER_ID));
    const enrolledCourseDoc = await getDoc(doc(userDb, 'courses', courseId));
    const enrolledBookingDoc = await getDoc(doc(userDb, 'bookings', bookingId));

    expect(enrolledUserDoc.data()?.balanceUSD).toBe(300);
    expect(enrolledCourseDoc.data()?.availableSeats).toBe(4);
    expect(enrolledBookingDoc.data()).toMatchObject({
      userId: USER_ID,
      instructorId: `course_${courseId}`,
      status: 'confirmed',
      totalPrice: 200,
    });

    const { refunded } = await seedData((context) =>
      cancelBookingWithRefund(context.firestore(), bookingId)
    );

    const refundedUserDoc = await getDoc(doc(adminDb, 'users', USER_ID));
    const restoredCourseDoc = await getDoc(doc(adminDb, 'courses', courseId));
    const cancelledBookingDoc = await getDoc(doc(adminDb, 'bookings', bookingId));

    expect(refunded).toBe(200);
    expect(refundedUserDoc.data()?.balanceUSD).toBe(500);
    expect(restoredCourseDoc.data()?.availableSeats).toBe(5);
    expect(cancelledBookingDoc.data()?.status).toBe('cancelled');
  });
});
