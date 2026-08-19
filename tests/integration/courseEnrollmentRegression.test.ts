import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enrollInCourse } from '../../src/features/courses/courseTransactions';
import {
  PROD_COURSE_ID,
  PROD_USER_ID,
  buildCourseEnrollmentBooking,
  buildProdCourseSeed,
  prodBookingId,
} from '../helpers/courseEnrollmentFixtures';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  seedOwnerAndMigrationFlag,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

const bookingId = prodBookingId(PROD_USER_ID, PROD_COURSE_ID);

async function withPrivilegedDb<T>(run: (db: Firestore) => Promise<T>): Promise<T> {
  return seedData((context) => run(context.firestore()));
}

const seedProdUser = async (balanceUSD = 3860) => {
  await seedData(async (context) => {
    await setDoc(doc(context.firestore(), 'users', PROD_USER_ID), {
      ...userProfile(PROD_USER_ID, 'user@example.com', 'user'),
      balanceUSD,
    });
  });
};

const seedProdCourse = async (availableSeats = 3) => {
  await seedData(async (context) => {
    await setDoc(
      doc(context.firestore(), 'courses', PROD_COURSE_ID),
      buildProdCourseSeed(PROD_COURSE_ID, availableSeats)
    );
  });
};

const seedLegacyCancelledBooking = async () => {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(db, 'bookings', bookingId),
      buildCourseEnrollmentBooking(PROD_USER_ID, PROD_COURSE_ID, {
        status: 'cancelled',
      })
    );
    await setDoc(doc(db, 'availability_slots', bookingId), {
      bookingId,
      instructorId: `course_${PROD_COURSE_ID}`,
      date: '2026-12-02',
      time: '09:00',
      durationHours: 20,
      slotType: 'lesson',
    });
  });
};

describe('course enrollment production regressions', () => {
  beforeAll(async () => {
    await setupIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedOwnerAndMigrationFlag(true);
    await seedProdUser();
    await seedProdCourse();
  });

  afterAll(async () => {
    await teardownIntegrationTestEnvironment();
  });

  it('enrolls via enrollInCourse when a legacy cancelled booking document already exists', async () => {
    await seedLegacyCancelledBooking();

    const userDb = integrationTestEnv()
      .authenticatedContext(PROD_USER_ID, { email: 'user@example.com' })
      .firestore();

    const { newBalance, bookingId: createdBookingId } = await withPrivilegedDb((db) =>
      enrollInCourse(db, PROD_USER_ID, PROD_COURSE_ID, 'ru')
    );

    const userDoc = await getDoc(doc(userDb, 'users', PROD_USER_ID));
    const courseDoc = await getDoc(doc(userDb, 'courses', PROD_COURSE_ID));
    const bookingDoc = await getDoc(doc(userDb, 'bookings', createdBookingId));

    expect(createdBookingId).toBe(bookingId);
    expect(newBalance).toBe(3860 - 199);
    expect(userDoc.data()?.balanceUSD).toBe(3661);
    expect(courseDoc.data()?.availableSeats).toBe(2);
    expect(bookingDoc.data()).toMatchObject({
      userId: PROD_USER_ID,
      instructorId: `course_${PROD_COURSE_ID}`,
      status: 'confirmed',
      totalPrice: 199,
    });
  });

  it('enrolls when the course document is missing totalSeats and bgImageUrl', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'courses', PROD_COURSE_ID), {
        title: 'Legacy course',
        availableSeats: 2,
        price: 199,
        duration: '5 days',
        dates: 'Dec 2026',
        description: 'Legacy',
      });
    });

    await expect(
      withPrivilegedDb((db) => enrollInCourse(db, PROD_USER_ID, PROD_COURSE_ID, 'en'))
    ).resolves.toMatchObject({
      bookingId,
      newBalance: 3860 - 199,
    });
  });
});
