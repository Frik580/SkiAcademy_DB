import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'ski-academy-rules-test';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ADMIN_ID = 'admin-1';
const SUPER_ADMIN_ID = 'super-admin-1';
const SUPER_ADMIN_EMAIL = 'gerasimchuk.arseniy@gmail.com';

let testEnv: RulesTestEnvironment;

const userProfile = (uid: string, email: string, role: 'user' | 'admin' = 'user') => ({
  uid,
  email,
  displayName: uid,
  role,
  avatarUrl: '',
  balanceUSD: 100,
});

async function seedData(callback: (context: RulesTestContext) => Promise<void>) {
  await testEnv.withSecurityRulesDisabled(callback);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('bookings', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', 'booking-1'), {
        id: 'booking-1',
        userId: USER_ID,
        instructorId: 'instructor-1',
        durationHours: 1,
        totalPrice: 50,
        status: 'confirmed',
      });
    });
  });

  it('denies anonymous reads and allows authenticated schedule reads', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const authenticatedDb = testEnv.authenticatedContext(OTHER_USER_ID).firestore();

    await assertFails(getDoc(doc(anonymousDb, 'bookings', 'booking-1')));
    await assertSucceeds(getDoc(doc(authenticatedDb, 'bookings', 'booking-1')));
  });
});

describe('user profiles and roles', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com'));
      await setDoc(doc(db, 'users', OTHER_USER_ID), userProfile(OTHER_USER_ID, 'other@example.com'));
      await setDoc(doc(db, 'users', ADMIN_ID), userProfile(ADMIN_ID, 'admin@example.com', 'admin'));
    });
  });

  it('allows safe self-service fields but blocks self-promotion', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertSucceeds(updateDoc(profileRef, { avatarUrl: 'https://example.com/avatar.jpg' }));
    await assertFails(updateDoc(profileRef, { role: 'admin' }));
  });

  it('allows only a super-admin to change another user role', async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_ID, { email: 'admin@example.com' }).firestore();
    const superAdminDb = testEnv
      .authenticatedContext(SUPER_ADMIN_ID, { email: SUPER_ADMIN_EMAIL })
      .firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(superAdminDb, 'users', OTHER_USER_ID), { role: 'admin' }));
  });
});

describe('resort configuration and error logs', () => {
  it('allows only admins to write resort configuration', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const superAdminDb = testEnv
      .authenticatedContext(SUPER_ADMIN_ID, { email: SUPER_ADMIN_EMAIL })
      .firestore();

    await assertFails(setDoc(doc(userDb, 'resort_data', 'config'), { nameEn: 'Unsafe update' }));
    await assertSucceeds(setDoc(doc(superAdminDb, 'resort_data', 'config'), { nameEn: 'Chamonix' }));
  });

  it('accepts bounded logs only from the authenticated owner', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const validLog = {
      userId: USER_ID,
      userEmail: 'user@example.com',
      message: 'Test error',
      stack: '',
    };

    await assertFails(setDoc(doc(anonymousDb, 'error_logs', 'anonymous-log'), validLog));
    await assertSucceeds(setDoc(doc(userDb, 'error_logs', 'owned-log'), validLog));
    await assertFails(
      setDoc(doc(userDb, 'error_logs', 'spoofed-log'), {
        ...validLog,
        userEmail: 'other@example.com',
      })
    );
  });
});

describe('notifications', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'notifications', 'notification-1'), {
        userId: USER_ID,
        title: 'Lesson update',
        message: 'Your lesson changed',
      });
    });
  });

  it('allows owners to delete their notifications and rejects other users', async () => {
    const otherDb = testEnv.authenticatedContext(OTHER_USER_ID).firestore();
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();

    await assertFails(deleteDoc(doc(otherDb, 'notifications', 'notification-1')));
    await assertSucceeds(deleteDoc(doc(ownerDb, 'notifications', 'notification-1')));
  });
});

describe('course enrollment transactions', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'courses', 'course-1'), {
        title: 'Course',
        totalSeats: 2,
        availableSeats: 2,
        price: 100,
      });
    });
  });

  it('rejects standalone seat changes and allows an atomic enrollment', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore();
    const courseRef = doc(db, 'courses', 'course-1');
    const bookingRef = doc(db, 'bookings', `booking_course_${USER_ID}_course-1`);

    await assertFails(updateDoc(courseRef, { availableSeats: 1 }));

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        const courseSnapshot = await transaction.get(courseRef);
        expect(courseSnapshot.exists()).toBe(true);

        transaction.update(courseRef, { availableSeats: 1 });
        transaction.set(bookingRef, {
          id: bookingRef.id,
          userId: USER_ID,
          instructorId: 'course_course-1',
          instructorName: 'Course',
          instructorAvatar: '',
          date: '2026-12-01',
          time: '09:00',
          durationHours: 2,
          totalPrice: 100,
          status: 'confirmed',
          difficulty: 'intermediate',
          notes: '',
        });
      })
    );
  });
});
