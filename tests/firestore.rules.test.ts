import {
  assertFails,
  assertSucceeds,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  cleanupEmulatorTestEnvironment,
  initializeEmulatorTestEnvironment,
} from './helpers/firebaseEmulatorTestEnv';
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
import { addHourLocksToBatch } from './helpers/hourLockFixtures';
import { readRepoFile } from './helpers/readRepoFile';

const PROJECT_ID = 'ski-academy-rules-test';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ADMIN_ID = 'admin-1';
const OWNER_ID = 'owner-1';
const INSTRUCTOR_USER_ID = 'instructor-user-1';
const INSTRUCTOR_USER_ID_2 = 'instructor-user-2';

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
  testEnv = await initializeEmulatorTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readRepoFile('firestore.rules'),
    },
  });
}, 30_000);

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
  await cleanupEmulatorTestEnvironment(testEnv);
}, 30_000);

describe('bookings', () => {
  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'instructors', 'instructor-1'), {
        id: 'instructor-1',
        name: 'Instructor',
        specialty: 'ski',
        pricePerHour: 50,
        bio: 'Test instructor',
        avatarUrl: '',
        isAvailable: true,
        rating: 5,
        reviewsCount: 0,
      });
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
    await assertSucceeds(
      getDoc(doc(anonymousDb, 'availability_hour_locks', 'instructor-1__2026-12-01__09:00'))
    );
  });

  it('rejects anonymous guest booking creates because they belong to Callables', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const bookingRef = doc(anonymousDb, 'bookings', 'guest_book_test_1');
    const slotRef = doc(anonymousDb, 'availability_slots', 'guest_book_test_1');
    const guestBooking = {
      id: 'guest_book_test_1',
      userId: 'guest_1234567890',
      instructorId: 'instructor-1',
      instructorName: 'Instructor',
      instructorAvatar: '',
      date: '2026-12-02',
      time: '14:00',
      durationHours: 2,
      totalPrice: 100,
      status: 'pending',
      difficulty: 'beginner',
      isGuest: true,
      guestName: 'Walk-in Guest',
      guestPhone: '+1234567890',
      guestEmail: 'guest@example.com',
    };

    const createBatch = writeBatch(anonymousDb);
    createBatch.set(bookingRef, guestBooking);
    addHourLocksToBatch(createBatch, anonymousDb, guestBooking);
    createBatch.set(slotRef, {
      bookingId: 'guest_book_test_1',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '14:00',
      durationHours: 2,
      slotType: 'lesson',
    });

    await assertFails(createBatch.commit());
  });

  it('rejects anonymous guest course enrollment requests', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'courses', 'course-guest-1'), {
        id: 'course-guest-1',
        title: 'Guest Course',
        duration: '5 days',
        description: 'Test course',
        dates: '01.12.2026',
        totalSeats: 10,
        availableSeats: 5,
        price: 250,
        bgImageUrl: '',
      });
    });

    const guestCourseBooking = {
      id: 'guest_course_test_1',
      userId: 'guest_1234567890',
      courseId: 'course-guest-1',
      instructorId: 'course_course-guest-1',
      instructorName: 'Group Course Request',
      instructorAvatar: '',
      date: '01.12.2026',
      time: 'Group schedule',
      durationHours: 10,
      totalPrice: 250,
      status: 'pending',
      difficulty: 'intermediate',
      isGuest: true,
      guestName: 'Walk-in Guest',
      guestPhone: '+1234567890',
      guestEmail: 'guest@example.com',
      notes: 'Guest course request',
    };

    await assertFails(
      setDoc(doc(anonymousDb, 'bookings', guestCourseBooking.id), guestCourseBooking)
    );
  });

  it('requires lesson bookings and availability slots to change atomically', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore();
    const bookingRef = doc(db, 'bookings', 'booking-2');
    const slotRef = doc(db, 'availability_slots', 'booking-2');
    const confirmedBooking = {
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
    const pendingBooking = { ...confirmedBooking, status: 'pending' };

    await assertFails(setDoc(bookingRef, confirmedBooking));

    const confirmedCreateBatch = writeBatch(db);
    confirmedCreateBatch.set(bookingRef, confirmedBooking);
    addHourLocksToBatch(confirmedCreateBatch, db, confirmedBooking);
    confirmedCreateBatch.set(slotRef, {
      bookingId: 'booking-2',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      slotType: 'lesson',
    });
    await assertFails(confirmedCreateBatch.commit());

    await assertFails(setDoc(bookingRef, pendingBooking));

    const createBatch = writeBatch(db);
    createBatch.set(bookingRef, pendingBooking);
    addHourLocksToBatch(createBatch, db, pendingBooking);
    createBatch.set(slotRef, {
      bookingId: 'booking-2',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      slotType: 'lesson',
    });
    await assertFails(createBatch.commit());

    await seedData(async (context) => {
      const seedDb = context.firestore();
      const seedBatch = writeBatch(seedDb);
      seedBatch.set(doc(seedDb, 'bookings', 'booking-2'), pendingBooking);
      addHourLocksToBatch(seedBatch, seedDb, pendingBooking);
      seedBatch.set(doc(seedDb, 'availability_slots', 'booking-2'), {
        bookingId: 'booking-2',
        instructorId: 'instructor-1',
        date: '2026-12-02',
        time: '10:00',
        durationHours: 2,
        slotType: 'lesson',
      });
      await seedBatch.commit();
    });

    await assertFails(updateDoc(bookingRef, { date: '2026-12-03' }));

    const rescheduleBatch = writeBatch(db);
    rescheduleBatch.update(bookingRef, { date: '2026-12-03' });
    rescheduleBatch.update(slotRef, { date: '2026-12-03' });
    rescheduleBatch.delete(doc(db, 'availability_hour_locks', 'instructor-1__2026-12-02__10:00'));
    rescheduleBatch.delete(doc(db, 'availability_hour_locks', 'instructor-1__2026-12-02__11:00'));
    rescheduleBatch.set(doc(db, 'availability_hour_locks', 'instructor-1__2026-12-03__10:00'), {
      instructorId: 'instructor-1',
      date: '2026-12-03',
      time: '10:00',
      bookingId: 'booking-2',
    });
    rescheduleBatch.set(doc(db, 'availability_hour_locks', 'instructor-1__2026-12-03__11:00'), {
      instructorId: 'instructor-1',
      date: '2026-12-03',
      time: '11:00',
      bookingId: 'booking-2',
    });
    await assertFails(rescheduleBatch.commit());

    const cancelBatch = writeBatch(db);
    cancelBatch.update(bookingRef, { status: 'cancelled' });
    cancelBatch.delete(slotRef);
    await assertFails(cancelBatch.commit());
  });

  it('rejects lesson bookings with a manipulated totalPrice', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore();
    const bookingRef = doc(db, 'bookings', 'booking-tampered');
    const slotRef = doc(db, 'availability_slots', 'booking-tampered');
    const booking = {
      id: 'booking-tampered',
      userId: USER_ID,
      instructorId: 'instructor-1',
      instructorName: 'Instructor',
      instructorAvatar: '',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      totalPrice: 0,
      status: 'confirmed',
      difficulty: 'beginner',
    };

    const createBatch = writeBatch(db);
    createBatch.set(bookingRef, booking);
    createBatch.set(slotRef, {
      bookingId: 'booking-tampered',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      slotType: 'lesson',
    });
    await assertFails(createBatch.commit());
  });

  it('rejects availability slots without a matching hour lock', async () => {
    const db = testEnv.authenticatedContext(USER_ID).firestore();
    const bookingRef = doc(db, 'bookings', 'booking-no-lock');
    const slotRef = doc(db, 'availability_slots', 'booking-no-lock');
    const booking = {
      id: 'booking-no-lock',
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

    const createBatch = writeBatch(db);
    createBatch.set(bookingRef, booking);
    createBatch.set(slotRef, {
      bookingId: 'booking-no-lock',
      instructorId: 'instructor-1',
      date: '2026-12-02',
      time: '10:00',
      durationHours: 2,
      slotType: 'lesson',
    });
    await assertFails(createBatch.commit());
  });

  it('rejects client lifecycle status changes that belong to Callables', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();
    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    const otherDb = testEnv.authenticatedContext(OTHER_USER_ID).firestore();
    const bookingRef = doc(ownerDb, 'bookings', 'booking-1');

    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'bookings', 'booking-pending'), {
        id: 'booking-pending',
        userId: USER_ID,
        instructorId: 'instructor-1',
        date: '2026-12-04',
        time: '09:00',
        durationHours: 1,
        totalPrice: 50,
        status: 'pending',
      });
      await setDoc(doc(db, 'availability_slots', 'booking-pending'), {
        bookingId: 'booking-pending',
        instructorId: 'instructor-1',
        date: '2026-12-04',
        time: '09:00',
        durationHours: 1,
        slotType: 'lesson',
      });
      await setDoc(doc(db, 'bookings', 'guest_status_lock'), {
        id: 'guest_status_lock',
        userId: 'guest_lock',
        instructorId: 'instructor-1',
        date: '2026-12-05',
        time: '09:00',
        durationHours: 1,
        totalPrice: 50,
        status: 'pending',
        isGuest: true,
      });
    });

    await assertFails(updateDoc(bookingRef, { status: 'pending_cancellation' }));
    await assertFails(updateDoc(bookingRef, { status: 'completed' }));
    await assertFails(updateDoc(bookingRef, { cancellationReason: 'changed plans' }));
    await assertFails(
      updateDoc(doc(ownerDb, 'bookings', 'booking-pending'), { status: 'confirmed' })
    );
    await assertFails(
      updateDoc(doc(instructorDb, 'bookings', 'booking-pending'), { status: 'confirmed' })
    );
    await assertFails(updateDoc(doc(adminDb, 'bookings', 'booking-1'), { status: 'completed' }));
    await assertFails(
      updateDoc(doc(adminDb, 'bookings', 'guest_status_lock'), { status: 'confirmed' })
    );
    await assertFails(
      updateDoc(doc(otherDb, 'bookings', 'guest_status_lock'), { date: '2026-12-06' })
    );
    await assertFails(updateDoc(doc(adminDb, 'bookings', 'booking-1'), { date: '2026-12-08' }));
    await assertFails(deleteDoc(bookingRef));
  });

  it('still allows recommendation edits without changing booking status', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();

    await assertSucceeds(
      updateDoc(doc(ownerDb, 'bookings', 'booking-1'), {
        completedRecommendationIds: ['rec-1'],
      })
    );
    await assertSucceeds(
      updateDoc(doc(instructorDb, 'bookings', 'booking-1'), {
        recommendations: [{ id: 'rec-1', text: 'Practice carving' }],
      })
    );
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

  it('blocks client wallet self-credits through pendingWalletCredit staging', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertFails(updateDoc(profileRef, { pendingWalletCredit: 100 }));
    await assertFails(
      updateDoc(profileRef, {
        balanceUSD: 200,
        pendingWalletCredit: 0,
      })
    );
  });

  it('blocks atomic client wallet credits', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(db, 'users', USER_ID);

    await assertFails(
      updateDoc(profileRef, {
        balanceUSD: 150,
        pendingWalletCredit: 0,
      })
    );
  });

  it('allows admins to increase a client balance', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertSucceeds(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { balanceUSD: 200 }));
  });

  it('allows admins to append wallet ledger entries for other users', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertSucceeds(
      setDoc(doc(ownerDb, 'wallet_ledger', 'wl_refund_booking-1'), {
        id: 'wl_refund_booking-1',
        userId: USER_ID,
        amount: 100,
        balanceAfter: 200,
        type: 'refund',
        createdAt: '2026-12-01T10:00:00.000Z',
        bookingId: 'booking-1',
        subjectName: 'Coach A',
      })
    );
  });

  it('blocks users from appending wallet ledger entries for other users', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();

    await assertFails(
      setDoc(doc(userDb, 'wallet_ledger', 'wl_refund_booking-1'), {
        id: 'wl_refund_booking-1',
        userId: OTHER_USER_ID,
        amount: 100,
        balanceAfter: 200,
        type: 'refund',
        createdAt: '2026-12-01T10:00:00.000Z',
      })
    );
  });

  it('blocks client wallet top-up ledger entries', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();

    await assertFails(
      setDoc(doc(userDb, 'wallet_ledger', 'wl_top_up_manual'), {
        id: 'wl_top_up_manual',
        userId: USER_ID,
        amount: 100,
        balanceAfter: 200,
        type: 'top_up',
        createdAt: '2026-12-01T10:00:00.000Z',
      })
    );
  });

  it('rejects client payment ledger writes tied to a booking create', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const bookingId = `booking_course_${USER_ID}_course-ledger`;

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'courses', 'course-ledger'), {
        title: 'Course',
        totalSeats: 5,
        availableSeats: 5,
        price: 100,
      });
    });

    await assertFails(
      runTransaction(userDb, async (transaction) => {
        transaction.set(doc(userDb, 'bookings', bookingId), {
          id: bookingId,
          userId: USER_ID,
          courseId: 'course-ledger',
          instructorId: 'course_course-ledger',
          instructorName: 'Course',
          instructorAvatar: '',
          date: '2026-12-02',
          time: '10:00',
          durationHours: 2,
          totalPrice: 100,
          status: 'confirmed',
          difficulty: 'intermediate',
        });
        transaction.set(doc(userDb, 'wallet_ledger', `wl_course_payment_${bookingId}`), {
          id: `wl_course_payment_${bookingId}`,
          userId: USER_ID,
          amount: -100,
          balanceAfter: 0,
          type: 'course_payment',
          bookingId,
          createdAt: '2026-12-01T10:00:00.000Z',
        });
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

  it('allows the same actor to idempotently rewrite a level_up log', async () => {
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();
    const logRef = doc(instructorDb, 'activity_logs', `act_level_${USER_ID}_2`);

    await assertSucceeds(
      setDoc(logRef, {
        userId: USER_ID,
        actorId: INSTRUCTOR_USER_ID,
        type: 'level_up',
        timestamp: '2026-07-28T12:00:00.000Z',
        metadata: { oldLevel: 1, newLevel: 2 },
      })
    );

    await assertSucceeds(
      setDoc(logRef, {
        userId: USER_ID,
        actorId: INSTRUCTOR_USER_ID,
        type: 'level_up',
        timestamp: '2026-07-28T12:05:00.000Z',
        metadata: { oldLevel: 1, newLevel: 2 },
      })
    );
  });

  it('rejects type changes and deletes on activity logs', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const instructorDb = testEnv.authenticatedContext(INSTRUCTOR_USER_ID).firestore();

    await assertFails(
      updateDoc(doc(instructorDb, 'activity_logs', 'activity-1'), { type: 'review_created' })
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

  it('allows course group chat participants to read and create messages', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'courses', 'course-group-1'), {
        title: 'Group Course',
        totalSeats: 10,
        availableSeats: 9,
        price: 100,
        instructorIds: ['instructor-1'],
      });
      await setDoc(doc(db, 'bookings', `booking_course_${USER_ID}_course-group-1`), {
        id: `booking_course_${USER_ID}_course-group-1`,
        userId: USER_ID,
        courseId: 'course-group-1',
        instructorId: 'course_course-group-1',
        date: '2026-12-01',
        time: '09:00',
        durationHours: 4,
        totalPrice: 100,
        status: 'confirmed',
      });
    });

    const studentDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const instructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const otherDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();

    const message = {
      id: 'course-message-1',
      bookingId: 'course-group-1',
      senderId: USER_ID,
      senderName: USER_ID,
      senderAvatar: '',
      text: 'Question about the course',
      timestamp: '2026-12-01T09:00:00.000Z',
    };

    await assertSucceeds(
      setDoc(doc(studentDb, 'bookings', 'course-group-1', 'messages', 'course-message-1'), message)
    );
    await assertSucceeds(
      getDoc(doc(instructorDb, 'bookings', 'course-group-1', 'messages', 'course-message-1'))
    );
    await assertSucceeds(
      setDoc(doc(instructorDb, 'bookings', 'course-group-1', 'messages', 'course-message-2'), {
        ...message,
        id: 'course-message-2',
        senderId: INSTRUCTOR_USER_ID,
        text: 'Welcome to the course',
      })
    );
    await assertSucceeds(
      getDoc(doc(studentDb, 'bookings', 'course-group-1', 'messages', 'course-message-2'))
    );
    await assertFails(
      getDoc(doc(otherDb, 'bookings', 'course-group-1', 'messages', 'course-message-1'))
    );
  });

  it('shares course chat between all enrolled students and assigned instructors', async () => {
    const courseId = 'course-group-all';
    const studentOneBookingId = `booking_course_${USER_ID}_${courseId}`;
    const studentTwoBookingId = `booking_course_${OTHER_USER_ID}_${courseId}`;

    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(
        doc(db, 'users', OTHER_USER_ID),
        userProfile(OTHER_USER_ID, 'other@example.com')
      );
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID_2), {
        ...userProfile(INSTRUCTOR_USER_ID_2, 'instructor2@example.com'),
        instructorId: 'instructor-2',
      });
      await setDoc(doc(db, 'courses', courseId), {
        title: 'Shared Group Course',
        totalSeats: 10,
        availableSeats: 8,
        price: 100,
        instructorIds: ['instructor-1', 'instructor-2'],
      });
      await setDoc(doc(db, 'bookings', studentOneBookingId), {
        id: studentOneBookingId,
        userId: USER_ID,
        courseId,
        instructorId: `course_${courseId}`,
        date: '2026-12-01',
        time: '09:00',
        durationHours: 4,
        totalPrice: 100,
        status: 'confirmed',
      });
      await setDoc(doc(db, 'bookings', studentTwoBookingId), {
        id: studentTwoBookingId,
        userId: OTHER_USER_ID,
        courseId,
        instructorId: `course_${courseId}`,
        date: '2026-12-01',
        time: '09:00',
        durationHours: 4,
        totalPrice: 100,
        status: 'confirmed',
      });
    });

    const studentOneDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const studentTwoDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();
    const instructorOneDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const instructorTwoDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID_2, { email: 'instructor2@example.com' })
      .firestore();

    const sharedMessage = {
      id: 'shared-message-1',
      bookingId: courseId,
      senderId: USER_ID,
      senderName: USER_ID,
      senderAvatar: '',
      text: 'Hello everyone',
      timestamp: '2026-12-01T09:00:00.000Z',
    };

    await assertSucceeds(
      setDoc(doc(studentOneDb, 'bookings', courseId, 'messages', 'shared-message-1'), sharedMessage)
    );
    await assertSucceeds(
      getDoc(doc(studentTwoDb, 'bookings', courseId, 'messages', 'shared-message-1'))
    );
    await assertSucceeds(
      getDoc(doc(instructorOneDb, 'bookings', courseId, 'messages', 'shared-message-1'))
    );
    await assertSucceeds(
      setDoc(doc(instructorTwoDb, 'bookings', courseId, 'messages', 'shared-message-2'), {
        ...sharedMessage,
        id: 'shared-message-2',
        senderId: INSTRUCTOR_USER_ID_2,
        text: 'Reply from second instructor',
      })
    );
    await assertSucceeds(
      getDoc(doc(studentOneDb, 'bookings', courseId, 'messages', 'shared-message-2'))
    );

    const legacyMessage = {
      id: 'legacy-message-1',
      bookingId: studentOneBookingId,
      senderId: USER_ID,
      senderName: USER_ID,
      senderAvatar: '',
      text: 'Legacy path message',
      timestamp: '2026-12-01T09:05:00.000Z',
    };

    await assertSucceeds(
      setDoc(
        doc(studentOneDb, 'bookings', studentOneBookingId, 'messages', 'legacy-message-1'),
        legacyMessage
      )
    );
    await assertSucceeds(
      getDoc(doc(instructorOneDb, 'bookings', studentOneBookingId, 'messages', 'legacy-message-1'))
    );
    await assertSucceeds(
      getDoc(doc(instructorTwoDb, 'bookings', studentOneBookingId, 'messages', 'legacy-message-1'))
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

  it('rejects standalone seat changes and client enrollment transactions', async () => {
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

    await assertFails(
      runTransaction(db, async (transaction) => {
        const courseSnapshot = await transaction.get(courseRef);
        expect(courseSnapshot.exists()).toBe(true);

        transaction.update(userRef, { balanceUSD: 0 });
        transaction.update(courseRef, { availableSeats: 1 });
        transaction.set(bookingRef, {
          id: bookingRef.id,
          userId: USER_ID,
          courseId: 'course-1',
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

  it('rejects re-enrollment by replacing a cancelled course booking', async () => {
    const db = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const courseRef = doc(db, 'courses', 'course-1');
    const bookingRef = doc(db, 'bookings', `booking_course_${USER_ID}_course-1`);
    const userRef = doc(db, 'users', USER_ID);

    await seedData(async (context) => {
      const seedDb = context.firestore();
      await setDoc(doc(seedDb, 'users', USER_ID), userProfile(USER_ID, 'user@example.com', 'user'));
      await setDoc(
        doc(seedDb, 'bookings', bookingRef.id),
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

    await assertFails(
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

  it('rejects the production enrollment transaction because enrollment belongs to Callables', async () => {
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

    await assertFails(
      runTransaction(db, async (transaction) => {
        transaction.update(userRef, { balanceUSD: 3661 });
        transaction.set(bookingRef, buildCourseEnrollmentBooking(PROD_USER_ID, PROD_COURSE_ID));
        transaction.update(courseRef, { availableSeats: 2 });
      })
    );
  });

  it('rejects seat decrement without the enrollInCourse Callable', async () => {
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

    await assertFails(
      runTransaction(db, async (transaction) => {
        transaction.update(courseRef, { availableSeats: 1 });
        transaction.set(bookingRef, {
          id: bookingRef.id,
          userId: USER_ID,
          courseId: 'course-no-total-seats',
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

  it('rejects direct admin cancellation because cancellation belongs to the Callable transaction', async () => {
    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    const courseRef = doc(adminDb, 'courses', 'course-1');
    const bookingRef = doc(adminDb, 'bookings', `booking_course_${USER_ID}_course-1`);
    const userRef = doc(adminDb, 'users', USER_ID);

    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), userProfile(USER_ID, 'user@example.com', 'user'));
      await setDoc(doc(db, 'bookings', bookingRef.id), {
        id: bookingRef.id,
        userId: USER_ID,
        courseId: 'course-1',
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
      await setDoc(doc(db, 'courses', 'course-1'), {
        title: 'Course',
        totalSeats: 2,
        availableSeats: 1,
        price: 100,
      });
    });

    await assertFails(
      runTransaction(adminDb, async (transaction) => {
        transaction.update(bookingRef, { status: 'cancelled' });
        transaction.update(userRef, { balanceUSD: 200 });
        transaction.update(courseRef, { availableSeats: 2 });
      })
    );
  });
});
