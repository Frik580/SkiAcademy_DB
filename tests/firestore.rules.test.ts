import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PROD_COURSE_ID,
  PROD_USER_ID,
  buildCourseEnrollmentBooking,
  buildProdCourseSeed,
  prodBookingId,
} from './helpers/courseEnrollmentFixtures';

const PROJECT_ID = 'ski-academy-rules-test';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ADMIN_ID = 'admin-1';
const OWNER_ID = 'owner-1';
const INSTRUCTOR_USER_ID = 'instructor-user-1';

let testEnv: RulesTestEnvironment;

const userProfile = (
  uid: string,
  email: string,
  role: 'user' | 'admin' = 'user',
  systemRole?: 'owner'
) => ({
  uid,
  email,
  displayName: uid,
  role,
  avatarUrl: '',
  balanceUSD: 100,
  ...(systemRole ? { systemRole } : {}),
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
  await seedData(async (context) => {
    await setDoc(
      doc(context.firestore(), 'users', OWNER_ID),
      userProfile(OWNER_ID, 'owner@example.com', 'admin', 'owner')
    );
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('bookings', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'bookings', 'booking-1'), {
        id: 'booking-1',
        userId: USER_ID,
        instructorId: 'instructor-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 1,
        totalPrice: 50,
        status: 'confirmed',
      });
      await setDoc(doc(db, 'availability_slots', 'booking-1'), {
        bookingId: 'booking-1',
        instructorId: 'instructor-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 1,
        slotType: 'lesson',
      });
      await setDoc(doc(db, 'settings', 'availability_slots_migration'), {
        complete: true,
      });
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID), {
        ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
        instructorId: 'instructor-1',
      });
    });
  });

  it('keeps bookings private and exposes only anonymized availability', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const otherDb = testEnv.authenticatedContext(OTHER_USER_ID).firestore();
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();
    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();

    await assertFails(getDoc(doc(anonymousDb, 'bookings', 'booking-1')));
    await assertFails(getDoc(doc(otherDb, 'bookings', 'booking-1')));
    await assertSucceeds(getDoc(doc(ownerDb, 'bookings', 'booking-1')));
    await assertFails(getDocs(collection(otherDb, 'bookings')));
    await assertSucceeds(
      getDocs(query(collection(ownerDb, 'bookings'), where('userId', '==', USER_ID)))
    );
    await assertSucceeds(
      getDocs(
        query(collection(instructorDb, 'bookings'), where('instructorId', '==', 'instructor-1'))
      )
    );
    await assertSucceeds(getDocs(collection(adminDb, 'bookings')));
    await assertSucceeds(getDoc(doc(anonymousDb, 'availability_slots', 'booking-1')));
  });

  it('requires lesson bookings and availability slots to change atomically', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore();
    const bookingRef = doc(db, 'bookings', 'booking-2');
    const slotRef = doc(db, 'availability_slots', 'booking-2');
    const booking = {
      id: 'booking-2',
      userId: USER_ID,
      instructorId: 'instructor-1',
      instructorName: 'Instructor',
      instructorAvatar: '',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      totalPrice: 100,
      status: 'confirmed',
      difficulty: 'beginner',
    };

    await assertFails(setDoc(bookingRef, booking));

    const createBatch = writeBatch(db);
    createBatch.set(bookingRef, booking);
    createBatch.set(slotRef, {
      bookingId: 'booking-2',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      slotType: 'lesson',
    });
    await assertSucceeds(createBatch.commit());

    await assertFails(updateDoc(bookingRef, { date: '2026-12-03' }));

    const rescheduleBatch = writeBatch(db);
    rescheduleBatch.update(bookingRef, { date: '2026-12-03' });
    rescheduleBatch.update(slotRef, { date: '2026-12-03' });
    await assertSucceeds(rescheduleBatch.commit());

    const cancelBatch = writeBatch(db);
    cancelBatch.update(bookingRef, { status: 'cancelled' });
    cancelBatch.delete(slotRef);
    await assertSucceeds(cancelBatch.commit());
  });
});

describe('user profiles and roles', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com'));
      await setDoc(
        doc(db, 'users', OTHER_USER_ID),
        userProfile(OTHER_USER_ID, 'other@example.com')
      );
      await setDoc(doc(db, 'users', ADMIN_ID), userProfile(ADMIN_ID, 'admin@example.com', 'admin'));
    });
  });

  it('allows safe self-service fields but blocks self-promotion', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertSucceeds(updateDoc(profileRef, { avatarUrl: 'https://example.com/avatar.jpg' }));
    await assertFails(updateDoc(profileRef, { role: 'admin' }));
    await assertFails(updateDoc(profileRef, { systemRole: 'owner' }));
  });

  it('blocks direct client balance inflation', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertFails(updateDoc(profileRef, { balanceUSD: 999999 }));
    await assertFails(updateDoc(profileRef, { balanceUSD: 200 }));
  });

  it('allows balance decreases for client payments', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertSucceeds(updateDoc(profileRef, { balanceUSD: 50 }));
  });

  it('allows wallet credits through pendingWalletCredit staging', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertSucceeds(updateDoc(profileRef, { pendingWalletCredit: 100 }));
    await assertSucceeds(
      updateDoc(profileRef, {
        balanceUSD: 200,
        pendingWalletCredit: 0,
      })
    );
  });

  it('allows only the system owner to change another user role', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { role: 'admin' }));
  });
});

describe('resort configuration and error logs', () => {
  it('allows only admins to write resort configuration', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertFails(setDoc(doc(userDb, 'resort_data', 'config'), { nameEn: 'Unsafe update' }));
    await assertSucceeds(setDoc(doc(ownerDb, 'resort_data', 'config'), { nameEn: 'Chamonix' }));
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

describe('activity_logs', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com'));
      await setDoc(
        doc(db, 'users', OTHER_USER_ID),
        userProfile(OTHER_USER_ID, 'other@example.com')
      );
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID), {
        ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
        instructorId: 'instructor-1',
      });
      await setDoc(doc(db, 'activity_logs', 'activity-1'), {
        userId: USER_ID,
        actorId: INSTRUCTOR_USER_ID,
        type: 'booking_completed',
        timestamp: '2026-07-28T12:00:00.000Z',
      });
    });
  });

  it('allows the student to read their activity logs and rejects other users', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const otherDb = testEnv.authenticatedContext(OTHER_USER_ID).firestore();

    await assertSucceeds(getDoc(doc(ownerDb, 'activity_logs', 'activity-1')));
    await assertFails(getDoc(doc(otherDb, 'activity_logs', 'activity-1')));
  });

  it('allows instructors to create activity logs for students', async () => {
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();

    await assertSucceeds(
      setDoc(doc(instructorDb, 'activity_logs', 'activity-2'), {
        userId: USER_ID,
        actorId: INSTRUCTOR_USER_ID,
        type: 'level_up',
        timestamp: '2026-07-28T12:00:00.000Z',
      })
    );
  });

  it('rejects updates and deletes', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();

    await assertFails(
      updateDoc(doc(ownerDb, 'activity_logs', 'activity-1'), { type: 'review_created' })
    );
    await assertFails(deleteDoc(doc(ownerDb, 'activity_logs', 'activity-1')));
  });
});

describe('booking chat messages', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com'));
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID), {
        ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
        instructorId: 'instructor-1',
      });
      await setDoc(doc(db, 'bookings', 'booking-chat-1'), {
        id: 'booking-chat-1',
        userId: USER_ID,
        instructorId: 'instructor-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 1,
        totalPrice: 50,
        status: 'confirmed',
      });
      await setDoc(doc(db, 'settings', 'availability_slots_migration'), { complete: true });
    });
  });

  it('allows booking participants to read and create chat messages', async () => {
    const ownerDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const instructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const otherDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();
    const messageRef = doc(ownerDb, 'bookings', 'booking-chat-1', 'messages', 'message-1');
    const message = {
      id: 'message-1',
      bookingId: 'booking-chat-1',
      senderId: USER_ID,
      senderName: USER_ID,
      senderAvatar: '',
      text: 'See you on the slope',
      timestamp: '2026-12-01T09:00:00.000Z',
    };

    await assertSucceeds(setDoc(messageRef, message));
    await assertSucceeds(
      getDoc(doc(instructorDb, 'bookings', 'booking-chat-1', 'messages', 'message-1'))
    );
    await assertFails(getDoc(doc(otherDb, 'bookings', 'booking-chat-1', 'messages', 'message-1')));
    await assertFails(
      setDoc(doc(otherDb, 'bookings', 'booking-chat-1', 'messages', 'message-2'), {
        ...message,
        id: 'message-2',
        senderId: OTHER_USER_ID,
      })
    );
  });

  it('allows admins to manage chat messages and blocks participant edits', async () => {
    const ownerDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const messageRef = doc(ownerDb, 'bookings', 'booking-chat-1', 'messages', 'message-admin');

    await assertSucceeds(
      setDoc(messageRef, {
        id: 'message-admin',
        bookingId: 'booking-chat-1',
        senderId: USER_ID,
        senderName: USER_ID,
        senderAvatar: '',
        text: 'Original text',
        timestamp: '2026-12-01T09:00:00.000Z',
      })
    );

    await assertFails(updateDoc(messageRef, { text: 'Edited by participant' }));
    await assertSucceeds(
      updateDoc(doc(adminDb, 'bookings', 'booking-chat-1', 'messages', 'message-admin'), {
        text: 'Edited by admin',
      })
    );
    await assertSucceeds(
      deleteDoc(doc(adminDb, 'bookings', 'booking-chat-1', 'messages', 'message-admin'))
    );
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
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const courseRef = doc(db, 'courses', 'course-1');
    const bookingRef = doc(db, 'bookings', `booking_course_${USER_ID}_course-1`);
    const userRef = doc(db, 'users', USER_ID);

    await seedData(async (context) => {
      await setDoc(
        doc(context.firestore(), 'users', USER_ID),
        userProfile(USER_ID, 'user@example.com', 'user')
      );
    });

    await assertFails(updateDoc(courseRef, { availableSeats: 1 }));

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        const courseSnapshot = await transaction.get(courseRef);
        expect(courseSnapshot.exists()).toBe(true);

        transaction.update(userRef, { balanceUSD: 0 });
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

  it('allows re-enrollment by replacing a cancelled course booking', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const courseRef = doc(db, 'courses', 'course-1');
    const bookingRef = doc(db, 'bookings', `booking_course_${USER_ID}_course-1`);
    const userRef = doc(db, 'users', USER_ID);

    await seedData(async (context) => {
      const seedDb = context.firestore();
      await setDoc(doc(seedDb, 'users', USER_ID), userProfile(USER_ID, 'user@example.com', 'user'));
      await setDoc(
        bookingRef,
        buildCourseEnrollmentBooking(USER_ID, 'course-1', {
          instructorName: 'Course',
          instructorAvatar: '',
          date: '2026-12-01',
          time: '09:00',
          durationHours: 2,
          totalPrice: 100,
          notes: '',
          status: 'cancelled',
        })
      );
      await setDoc(doc(seedDb, 'availability_slots', bookingRef.id), {
        bookingId: bookingRef.id,
        instructorId: 'course_course-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 2,
        slotType: 'lesson',
      });
    });

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        transaction.update(userRef, { balanceUSD: 0 });
        transaction.set(
          bookingRef,
          buildCourseEnrollmentBooking(USER_ID, 'course-1', {
            instructorName: 'Course',
            instructorAvatar: '',
            date: '2026-12-01',
            time: '09:00',
            durationHours: 2,
            totalPrice: 100,
            notes: '',
            status: 'confirmed',
          })
        );
        transaction.update(courseRef, { availableSeats: 1 });
      })
    );
  });

  it('allows the production enrollment transaction when a legacy cancelled booking exists', async () => {
    const db = testEnv
      .authenticatedContext(PROD_USER_ID, { email: 'user@example.com' })
      .firestore();
    const courseRef = doc(db, 'courses', PROD_COURSE_ID);
    const bookingRef = doc(db, 'bookings', prodBookingId(PROD_USER_ID, PROD_COURSE_ID));
    const userRef = doc(db, 'users', PROD_USER_ID);

    await seedData(async (context) => {
      const seedDb = context.firestore();
      await setDoc(doc(seedDb, 'users', PROD_USER_ID), {
        ...userProfile(PROD_USER_ID, 'user@example.com', 'user'),
        balanceUSD: 3860,
      });
      await setDoc(doc(seedDb, 'courses', PROD_COURSE_ID), buildProdCourseSeed(PROD_COURSE_ID, 3));
      await setDoc(
        doc(seedDb, 'bookings', bookingRef.id),
        buildCourseEnrollmentBooking(PROD_USER_ID, PROD_COURSE_ID, { status: 'cancelled' })
      );
      await setDoc(doc(seedDb, 'availability_slots', bookingRef.id), {
        bookingId: bookingRef.id,
        instructorId: `course_${PROD_COURSE_ID}`,
        date: '2026-12-02',
        time: '09:00',
        durationHours: 20,
        slotType: 'lesson',
      });
    });

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        transaction.update(userRef, { balanceUSD: 3661 });
        transaction.set(bookingRef, buildCourseEnrollmentBooking(PROD_USER_ID, PROD_COURSE_ID));
        transaction.update(courseRef, { availableSeats: 2 });
      })
    );
  });

  it('allows seat decrement when course totalSeats is missing', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const courseRef = doc(db, 'courses', 'course-no-total-seats');
    const bookingRef = doc(db, 'bookings', `booking_course_${USER_ID}_course-no-total-seats`);

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'courses', 'course-no-total-seats'), {
        title: 'Legacy Course',
        availableSeats: 2,
        price: 100,
      });
    });

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        transaction.update(courseRef, { availableSeats: 1 });
        transaction.set(bookingRef, {
          id: bookingRef.id,
          userId: USER_ID,
          instructorId: 'course_course-no-total-seats',
          instructorName: 'Legacy Course',
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

  it('allows balance decrease during course payment', async () => {
    const db = testEnv
      .authenticatedContext(PROD_USER_ID, { email: 'user@example.com' })
      .firestore();
    const userRef = doc(db, 'users', PROD_USER_ID);

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'users', PROD_USER_ID), {
        ...userProfile(PROD_USER_ID, 'user@example.com', 'user'),
        balanceUSD: 3860,
      });
    });

    await assertSucceeds(updateDoc(userRef, { balanceUSD: 3661 }));
  });

  it('blocks balance writes when balanceUSD was never set on the profile', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const userRef = doc(db, 'users', USER_ID);

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'users', USER_ID), {
        uid: USER_ID,
        email: 'user@example.com',
        displayName: USER_ID,
        role: 'user',
        avatarUrl: '',
      });
    });

    await assertFails(updateDoc(userRef, { balanceUSD: 50 }));
  });

  it('allows an admin to restore a course seat when cancelling another user booking', async () => {
    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    const courseRef = doc(adminDb, 'courses', 'course-1');
    const bookingRef = doc(adminDb, 'bookings', `booking_course_${USER_ID}_course-1`);
    const userRef = doc(adminDb, 'users', USER_ID);

    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com', 'user'));
      await setDoc(bookingRef, {
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
      await setDoc(courseRef, {
        title: 'Course',
        totalSeats: 2,
        availableSeats: 1,
        price: 100,
      });
    });

    await assertSucceeds(
      runTransaction(adminDb, async (transaction) => {
        transaction.update(bookingRef, { status: 'cancelled' });
        transaction.update(userRef, { balanceUSD: 200 });
        transaction.update(courseRef, { availableSeats: 2 });
      })
    );
  });
});
