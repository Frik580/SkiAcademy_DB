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
  limit,
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

  it('denies Admin client deletion of authoritative bookings and messages', async () => {
    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', 'booking-1', 'messages', 'message-1'), {
        senderId: ADMIN_ID,
        text: 'Protected history',
      });
    });

    await assertFails(deleteDoc(doc(adminDb, 'bookings', 'booking-1', 'messages', 'message-1')));
    await assertFails(deleteDoc(doc(adminDb, 'bookings', 'booking-1')));
    await assertSucceeds(getDoc(doc(adminDb, 'bookings', 'booking-1')));
  });

  it('preserves owner deletion of an eligible cancelled Course booking', async () => {
    const ownerDb = testEnv.authenticatedContext(USER_ID).firestore();
    const bookingId = `booking_course_${USER_ID}_course-legacy`;
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', bookingId), {
        id: bookingId,
        userId: USER_ID,
        courseId: 'course-legacy',
        instructorId: 'course_course-legacy',
        status: 'cancelled',
      });
    });

    await assertSucceeds(deleteDoc(doc(ownerDb, 'bookings', bookingId)));
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
      await setDoc(doc(db, 'settings', 'starter_credit'), { amountUsd: 250 });
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

  it('denies Admin and system-owner direct monetary profile changes', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { balanceUSD: 200 }));
    await assertFails(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { balanceUSD: 50 }));
    await assertFails(
      updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), {
        walletBalances: { USD: 200 },
        pendingWalletCredit: 100,
        lastRefundBookingId: 'booking-forged',
      })
    );
  });

  it('constrains initial balances and denies Admin delete-recreate bypasses', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const newUserDb = testEnv
      .authenticatedContext('new-user', { email: 'new-user@example.com' })
      .firestore();
    const claimantDb = testEnv
      .authenticatedContext('claimed-auth-uid', { email: 'contained@example.com' })
      .firestore();
    const clientId = 'client_contained_wallet';
    const clientProfile = {
      ...userProfile(clientId, 'contained@example.com'),
      balanceUSD: 250,
    };

    await assertFails(setDoc(doc(ownerDb, 'settings', 'starter_credit'), { amountUsd: 999_999 }));
    await assertFails(
      setDoc(doc(ownerDb, 'users', 'client_inflated_wallet'), {
        ...userProfile('client_inflated_wallet', 'inflated@example.com'),
        balanceUSD: 999_999,
      })
    );
    await assertFails(setDoc(doc(ownerDb, 'users', clientId), clientProfile));
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'users', clientId), clientProfile);
    });
    await assertFails(updateDoc(doc(ownerDb, 'users', clientId), { email: 'owner@example.com' }));
    await assertFails(deleteDoc(doc(ownerDb, 'users', clientId)));
    await assertSucceeds(deleteDoc(doc(claimantDb, 'users', clientId)));
    await assertFails(
      setDoc(doc(newUserDb, 'users', 'new-user'), {
        ...userProfile('new-user', 'new-user@example.com'),
        balanceUSD: 999_999,
      })
    );
    await assertSucceeds(
      setDoc(doc(newUserDb, 'users', 'new-user'), {
        ...userProfile('new-user', 'new-user@example.com'),
        balanceUSD: 250,
      })
    );
  });

  it('denies Admin client ledger creation and deletion', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const ledgerRef = doc(ownerDb, 'wallet_ledger', 'wl_refund_booking-1');

    await assertFails(
      setDoc(ledgerRef, {
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
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'wallet_ledger', 'wl_refund_booking-1'), {
        id: 'wl_refund_booking-1',
        userId: USER_ID,
        amount: 100,
        balanceAfter: 200,
        type: 'refund',
        createdAt: '2026-12-01T10:00:00.000Z',
      });
    });
    await assertFails(deleteDoc(ledgerRef));
  });

  it('denies Admin client guest-wallet mutation while keeping it readable', async () => {
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const guestWalletRef = doc(ownerDb, 'settings', 'guest_wallet');

    await assertFails(setDoc(guestWalletRef, { balanceUSD: 500 }));
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'settings', 'guest_wallet'), { balanceUSD: 100 });
    });
    await assertSucceeds(getDoc(guestWalletRef));
    await assertFails(updateDoc(guestWalletRef, { balanceUSD: 0 }));
  });

  it('denies direct browser access to canonical Wallet, Payment, and MonetaryEvent authority', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', OTHER_USER_ID, 'wallet', 'state'), {
        accountId: OTHER_USER_ID,
        currency: 'KZT',
        balance: 10_000,
        revision: 1,
        eventRevision: 1,
      });
      await setDoc(doc(db, 'payments', 'payment-rules-finance-1'), {
        paymentId: 'payment-rules-finance-1',
        currency: 'KZT',
        revision: 1,
      });
      await setDoc(doc(db, 'monetary_events', 'event-rules-finance-1'), {
        eventId: 'event-rules-finance-1',
        currency: 'KZT',
        walletBalanceDelta: 10_000,
      });
    });

    const walletRef = doc(adminDb, 'users', OTHER_USER_ID, 'wallet', 'state');
    const paymentRef = doc(adminDb, 'payments', 'payment-rules-finance-1');
    const eventRef = doc(adminDb, 'monetary_events', 'event-rules-finance-1');
    await assertFails(getDoc(walletRef));
    await assertFails(getDoc(paymentRef));
    await assertFails(getDoc(eventRef));
    await assertFails(updateDoc(walletRef, { balance: 999_999 }));
    await assertFails(updateDoc(paymentRef, { paidAmount: 999_999 }));
    await assertFails(deleteDoc(eventRef));
    await assertFails(
      setDoc(doc(adminDb, 'monetary_events', 'event-rules-forged'), {
        eventId: 'event-rules-forged',
        walletBalanceDelta: 999_999,
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

  it('denies Admin and Owner client role mutation; role changes are command-only', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { role: 'admin' }));
    await assertFails(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { role: 'admin' }));
  });
});

describe('T32.8A identity authority containment', () => {
  const catalogId = 'instructor-catalog-1';
  const participantId = 'participant-identity-1';
  const managementId = 'management-identity-1';
  const blockId = 'block-identity-1';
  const relationshipId = 'relationship-identity-1';

  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com'),
        lifecycle: { status: 'active' },
        revision: 1,
      });
      await setDoc(doc(db, 'users', OTHER_USER_ID), {
        ...userProfile(OTHER_USER_ID, 'other@example.com'),
        lifecycle: { status: 'active' },
        revision: 1,
      });
      await setDoc(doc(db, 'users', ADMIN_ID), userProfile(ADMIN_ID, 'admin@example.com', 'admin'));
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID), {
        ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
        instructorId: catalogId,
        isInstructor: true,
      });
      await setDoc(doc(db, 'instructors', catalogId), {
        id: catalogId,
        instructorId: catalogId,
        name: 'Catalog Coach',
        specialty: 'ski',
        pricePerHour: 50,
        bio: 'Canonical catalog',
        avatarUrl: '',
        isAvailable: true,
        rating: 5,
        reviewsCount: 1,
        phoneNumber: '+10000000000',
        revision: 1,
      });
      await setDoc(doc(db, 'participants', participantId), {
        participantId,
        displayName: 'Dependent',
        lifecycle: { status: 'active' },
        revision: 1,
        management: { kind: 'unmanaged_guest' },
      });
      await setDoc(doc(db, 'participant_management', managementId), {
        participantManagementId: managementId,
        participantId,
        accountId: OTHER_USER_ID,
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
      });
      await setDoc(doc(db, 'participant_blocks', blockId), {
        participantBlockId: blockId,
        participantId,
        instructorId: catalogId,
        status: 'active',
        revision: 1,
      });
      await setDoc(doc(db, 'instructor_relationships', relationshipId), {
        instructorRelationshipId: relationshipId,
        accountId: INSTRUCTOR_USER_ID,
        instructorId: catalogId,
        status: 'active',
        revision: 1,
      });
      await setDoc(doc(db, 'settings', 'starter_credit'), { amountUsd: 250 });
    });
  });

  it('denies Admin direct disable/enable of Account lifecycle', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const target = doc(adminDb, 'users', OTHER_USER_ID);

    await assertFails(updateDoc(target, { lifecycle: { status: 'disabled' } }));
    await assertFails(
      updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { lifecycle: { status: 'disabled' } })
    );
    await assertFails(updateDoc(target, { lifecycle: { status: 'active' } }));
  });

  it('denies Owner and Admin client writes of role and systemRole', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { role: 'admin' }));
    await assertFails(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { role: 'admin' }));
    await assertFails(updateDoc(doc(userDb, 'users', USER_ID), { role: 'admin' }));
    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { systemRole: 'owner' }));
    await assertFails(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { systemRole: 'owner' }));
    await assertFails(updateDoc(doc(userDb, 'users', USER_ID), { systemRole: 'owner' }));
    await assertFails(
      setDoc(doc(userDb, 'users', USER_ID), {
        ...userProfile(USER_ID, 'user@example.com'),
        systemRole: 'owner',
        balanceUSD: 250,
      })
    );
  });

  it('denies client writes of instructor identity fields on Account', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();

    const forgedDb = testEnv
      .authenticatedContext('user-forged-instructor', { email: 'forged@example.com' })
      .firestore();

    await assertFails(updateDoc(doc(adminDb, 'users', OTHER_USER_ID), { instructorId: catalogId }));
    await assertFails(updateDoc(doc(ownerDb, 'users', OTHER_USER_ID), { isInstructor: true }));
    await assertFails(updateDoc(doc(userDb, 'users', USER_ID), { instructorId: catalogId }));
    await assertFails(
      setDoc(doc(forgedDb, 'users', 'user-forged-instructor'), {
        ...userProfile('user-forged-instructor', 'forged@example.com'),
        instructorId: catalogId,
        isInstructor: true,
        balanceUSD: 250,
      })
    );
  });

  it('denies Admin client create/update/delete of Instructor catalog authority', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();
    const catalogRef = doc(adminDb, 'instructors', catalogId);

    await assertFails(
      setDoc(doc(adminDb, 'instructors', 'instructor-forged'), {
        id: 'instructor-forged',
        name: 'Forged',
        isAvailable: true,
        rating: 5,
        reviewsCount: 0,
      })
    );
    await assertFails(updateDoc(catalogRef, { isAvailable: false }));
    await assertFails(updateDoc(catalogRef, { name: 'Hijacked catalog' }));
    await assertFails(updateDoc(doc(ownerDb, 'instructors', catalogId), { pricePerHour: 1 }));
    await assertFails(deleteDoc(catalogRef));
    await assertSucceeds(getDoc(catalogRef));
  });

  it('denies Admin client assign/revoke of ParticipantManagement and archive/block bypass', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext(OWNER_ID, { email: 'owner@example.com' })
      .firestore();

    await assertFails(
      setDoc(doc(adminDb, 'participant_management', 'management-forged'), {
        participantManagementId: 'management-forged',
        participantId,
        accountId: ADMIN_ID,
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, 'participant_management', managementId), {
        accountId: ADMIN_ID,
        authority: 'self',
        revision: 99,
      })
    );
    await assertFails(deleteDoc(doc(adminDb, 'participant_management', managementId)));
    await assertFails(
      updateDoc(doc(adminDb, 'participants', participantId), { lifecycle: { status: 'archived' } })
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'participants', participantId), { lifecycle: { status: 'active' } })
    );
    await assertFails(updateDoc(doc(adminDb, 'participant_blocks', blockId), { status: 'ended' }));
    await assertFails(
      setDoc(doc(adminDb, 'participant_blocks', 'block-forged'), {
        participantBlockId: 'block-forged',
        status: 'active',
      })
    );
    await assertFails(deleteDoc(doc(adminDb, 'participant_blocks', blockId)));
    await assertFails(
      updateDoc(doc(adminDb, 'instructor_relationships', relationshipId), { status: 'ended' })
    );
    await assertFails(getDoc(doc(adminDb, 'participants', participantId)));
    await assertFails(getDoc(doc(adminDb, 'participant_management', managementId)));
  });

  it('still allows required self-service /users and /instructors writes', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const instructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const newUserDb = testEnv
      .authenticatedContext('new-identity-user', { email: 'new-identity@example.com' })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(userDb, 'users', USER_ID), {
        displayName: 'Self Service Name',
        phoneNumber: '+15551212',
        avatarUrl: 'https://example.com/self.jpg',
        hideProgressTracking: true,
        dismissedReviewIds: ['booking-review-1'],
      })
    );
    await assertSucceeds(updateDoc(doc(userDb, 'users', USER_ID), { balanceUSD: 50 }));
    await assertSucceeds(
      updateDoc(doc(instructorDb, 'users', OTHER_USER_ID), {
        level: 2,
        skillScores: { carving: 4 },
        skillComments: { carving: 'Solid' },
      })
    );
    await assertSucceeds(
      updateDoc(doc(instructorDb, 'instructors', catalogId), { phoneNumber: '+19998887777' })
    );
    await assertSucceeds(
      updateDoc(doc(userDb, 'instructors', catalogId), { rating: 4.5, reviewsCount: 2 })
    );
    await assertSucceeds(
      setDoc(doc(newUserDb, 'users', 'new-identity-user'), {
        ...userProfile('new-identity-user', 'new-identity@example.com'),
        isClientActive: true,
        level: 1,
        balanceUSD: 250,
      })
    );
  });

  it('allows an active Account to change the approved self presentation subset', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();

    await assertSucceeds(
      updateDoc(doc(userDb, 'users', USER_ID), {
        displayName: 'Active Self Name',
        phoneNumber: '+15550001111',
        avatarUrl: 'https://example.com/active.jpg',
        hideProgressTracking: true,
        hasCompletedOnboarding: true,
        todaySkillItemIds: ['skill-1'],
        completedTodayTaskIds: ['task-1'],
        completedTodayDate: '2026-08-31',
        customTodayTasks: [{ id: 'custom-1', title: 'Stretch' }],
        dismissedTodayTaskIds: ['task-2'],
        dismissedReviewIds: ['booking-review-active'],
      })
    );
    await assertSucceeds(getDoc(doc(userDb, 'users', USER_ID)));
  });

  it('denies leftover self-service writes when Account lifecycle is disabled', async () => {
    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), {
        lifecycle: { status: 'disabled', disabledAt: '2026-08-31T00:00:00.000Z' },
      });
    });

    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const instructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const profileRef = doc(userDb, 'users', USER_ID);

    await assertSucceeds(getDoc(profileRef));
    await assertFails(updateDoc(profileRef, { displayName: 'Disabled Name' }));
    await assertFails(updateDoc(profileRef, { phoneNumber: '+15550002222' }));
    await assertFails(updateDoc(profileRef, { avatarUrl: 'https://example.com/disabled.jpg' }));
    await assertFails(updateDoc(profileRef, { hideProgressTracking: true }));
    await assertFails(updateDoc(profileRef, { dismissedReviewIds: ['booking-review-disabled'] }));
    await assertFails(updateDoc(profileRef, { completedTodayTaskIds: ['task-disabled'] }));
    await assertFails(updateDoc(profileRef, { balanceUSD: 50 }));
    await assertFails(updateDoc(profileRef, { lifecycle: { status: 'active' } }));
    await assertFails(updateDoc(profileRef, { role: 'admin' }));
    await assertFails(updateDoc(profileRef, { systemRole: 'owner' }));
    await assertFails(updateDoc(profileRef, { instructorId: catalogId }));
    await assertFails(updateDoc(profileRef, { isInstructor: true }));
    await assertFails(
      setDoc(profileRef, {
        ...userProfile(USER_ID, 'user@example.com'),
        displayName: 'Replaced After Disable',
      })
    );
    await assertSucceeds(
      updateDoc(doc(instructorDb, 'users', USER_ID), {
        level: 2,
        skillScores: { carving: 4 },
        skillComments: { carving: 'Target disable does not freeze evaluation' },
      })
    );
  });

  it('fails closed for malformed or unknown Account lifecycle on self-service writes', async () => {
    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const profileRef = doc(userDb, 'users', USER_ID);

    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), {
        lifecycle: { status: 'archived' },
      });
    });
    await assertFails(updateDoc(profileRef, { displayName: 'Unknown Lifecycle' }));

    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), { lifecycle: {} });
    });
    await assertFails(updateDoc(profileRef, { phoneNumber: '+15550003333' }));

    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), { lifecycle: 'disabled' });
    });
    await assertFails(updateDoc(profileRef, { balanceUSD: 50 }));
  });

  it('restores self-service after Admin SDK enable_account and does not freeze other-actor writes', async () => {
    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), {
        lifecycle: { status: 'disabled', disabledAt: '2026-08-31T00:00:00.000Z' },
      });
      await updateDoc(doc(context.firestore(), 'users', INSTRUCTOR_USER_ID), {
        lifecycle: { status: 'disabled', disabledAt: '2026-08-31T00:00:00.000Z' },
      });
    });

    const userDb = testEnv.authenticatedContext(USER_ID, { email: 'user@example.com' }).firestore();
    const instructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();
    const reviewerDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();

    await assertFails(updateDoc(doc(userDb, 'users', USER_ID), { displayName: 'Still Disabled' }));

    await seedData(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', USER_ID), {
        lifecycle: { status: 'active' },
        revision: 2,
      });
    });

    await assertSucceeds(
      updateDoc(doc(userDb, 'users', USER_ID), { displayName: 'Reenabled Name' })
    );
    await assertSucceeds(updateDoc(doc(userDb, 'users', USER_ID), { phoneNumber: '+15550004444' }));
    await assertSucceeds(updateDoc(doc(userDb, 'users', USER_ID), { balanceUSD: 50 }));

    await assertSucceeds(
      updateDoc(doc(instructorDb, 'users', USER_ID), {
        level: 3,
        skillScores: { carving: 5 },
        skillComments: { carving: 'Still evaluable' },
      })
    );
    await assertSucceeds(
      updateDoc(doc(reviewerDb, 'instructors', catalogId), { rating: 4.2, reviewsCount: 3 })
    );
  });

  it('allows Admin SDK identity writes that canonical commands use', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'users', OTHER_USER_ID), {
        lifecycle: { status: 'disabled' },
        role: 'admin',
        instructorId: catalogId,
        isInstructor: true,
        revision: 2,
      });
      await updateDoc(doc(db, 'instructors', catalogId), {
        isAvailable: false,
        name: 'Server Catalog',
      });
      await updateDoc(doc(db, 'participants', participantId), {
        lifecycle: { status: 'archived' },
      });
      await updateDoc(doc(db, 'participant_management', managementId), { status: 'ended' });
      await updateDoc(doc(db, 'participant_blocks', blockId), { status: 'ended' });
      await setDoc(doc(db, 'instructors', 'instructor-server-created'), {
        instructorId: 'instructor-server-created',
        name: 'Server Created',
        isAvailable: true,
        revision: 1,
      });
    });

    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'users', OTHER_USER_ID)));
    await assertSucceeds(getDoc(doc(adminDb, 'instructors', catalogId)));
    await assertSucceeds(getDoc(doc(adminDb, 'instructors', 'instructor-server-created')));
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

  it('allows Admin message edits but contains destructive message deletion', async () => {
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
    await assertFails(
      deleteDoc(doc(adminDb, 'bookings', 'booking-chat-1', 'messages', 'message-admin'))
    );
  });
});

const CANONICAL_CHAT_CUSTOMER_ID = 'account_canonical_chat_customer';
const CANONICAL_CHAT_PARTICIPANT_ID = 'participant_canonical_chat_01';
const CANONICAL_CHAT_MANAGEMENT_ID = 'management_canonical_chat_01';
const CANONICAL_CHAT_BOOKING_ID = 'booking_canonical_chat_01';
const CANONICAL_CHAT_INSTRUCTOR_ID = 'instructor_canonical_chat_01';
const CANONICAL_CHAT_INSTRUCTOR_USER_ID = 'user_instructor_canonical_chat';

const canonicalChatTimestamp = {
  seconds: 1_735_689_600,
  nanoseconds: 0,
};

function canonicalChatAudit() {
  return {
    createdByCommandId: 'command_canonical_chat_fixture',
    lastChangedByCommandId: 'command_canonical_chat_fixture',
    correlationId: 'correlation_canonical_chat_fixture',
  };
}

function canonicalChatBookingFixture(bookingId = CANONICAL_CHAT_BOOKING_ID) {
  return {
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: CANONICAL_CHAT_CUSTOMER_ID },
    },
    party: {
      kind: 'individual',
      participantIds: [CANONICAL_CHAT_PARTICIPANT_ID],
    },
    occurrence: {
      occurrenceId: 'occurrence_canonical_chat_fixture',
      instructorId: CANONICAL_CHAT_INSTRUCTOR_ID,
      interval: {
        startsAt: canonicalChatTimestamp,
        endsAt: { seconds: 1_735_693_200, nanoseconds: 0 },
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: {
        participantIds: [CANONICAL_CHAT_PARTICIPANT_ID],
        frozenAt: canonicalChatTimestamp,
      },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: 'payment_canonical_chat_fixture',
    payerAccountId: CANONICAL_CHAT_CUSTOMER_ID,
    revision: 1,
    createdAt: canonicalChatTimestamp,
    updatedAt: canonicalChatTimestamp,
    audit: canonicalChatAudit(),
  };
}

async function seedCanonicalChatFixture() {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', CANONICAL_CHAT_CUSTOMER_ID), {
      accountId: CANONICAL_CHAT_CUSTOMER_ID,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: canonicalChatTimestamp,
      updatedAt: canonicalChatTimestamp,
      audit: canonicalChatAudit(),
      email: 'customer-canonical-chat@example.com',
      displayName: 'Canonical Chat Customer',
      role: 'user',
    });
    await setDoc(doc(db, 'users', CANONICAL_CHAT_INSTRUCTOR_USER_ID), {
      ...userProfile(CANONICAL_CHAT_INSTRUCTOR_USER_ID, 'instructor-canonical-chat@example.com'),
      instructorId: CANONICAL_CHAT_INSTRUCTOR_ID,
    });
    await setDoc(doc(db, 'instructors', CANONICAL_CHAT_INSTRUCTOR_ID), {
      id: CANONICAL_CHAT_INSTRUCTOR_ID,
      name: 'Canonical Chat Instructor',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    });
    await setDoc(doc(db, 'participants', CANONICAL_CHAT_PARTICIPANT_ID), {
      participantId: CANONICAL_CHAT_PARTICIPANT_ID,
      displayName: 'Canonical Chat Participant',
      age: { kind: 'age_years', years: 30 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: {
        kind: 'managed',
        participantManagementId: CANONICAL_CHAT_MANAGEMENT_ID,
      },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: canonicalChatTimestamp,
      updatedAt: canonicalChatTimestamp,
      audit: canonicalChatAudit(),
    });
    await setDoc(doc(db, 'participant_management', CANONICAL_CHAT_MANAGEMENT_ID), {
      participantManagementId: CANONICAL_CHAT_MANAGEMENT_ID,
      participantId: CANONICAL_CHAT_PARTICIPANT_ID,
      accountId: CANONICAL_CHAT_CUSTOMER_ID,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: canonicalChatTimestamp,
      updatedAt: canonicalChatTimestamp,
      audit: canonicalChatAudit(),
    });
    await setDoc(doc(db, 'participant_management_active_owner', CANONICAL_CHAT_PARTICIPANT_ID), {
      participantId: CANONICAL_CHAT_PARTICIPANT_ID,
      accountId: CANONICAL_CHAT_CUSTOMER_ID,
      participantManagementId: CANONICAL_CHAT_MANAGEMENT_ID,
      managementRevision: 1,
      updatedAt: canonicalChatTimestamp,
      lastChangedByCommandId: 'command_canonical_chat_fixture',
      correlationId: 'correlation_canonical_chat_fixture',
    });
    await setDoc(doc(db, 'bookings', CANONICAL_CHAT_BOOKING_ID), canonicalChatBookingFixture());
  });
}

describe('canonical booking chat messages', () => {
  beforeEach(async () => {
    await seedCanonicalChatFixture();
  });

  it('allows managing customer accounts to list and read canonical booking messages', async () => {
    const customerDb = testEnv
      .authenticatedContext(CANONICAL_CHAT_CUSTOMER_ID, {
        email: 'customer-canonical-chat@example.com',
      })
      .firestore();
    const message = {
      id: 'canonical-message-1',
      bookingId: CANONICAL_CHAT_BOOKING_ID,
      senderId: CANONICAL_CHAT_CUSTOMER_ID,
      senderName: CANONICAL_CHAT_CUSTOMER_ID,
      senderAvatar: '',
      text: 'Canonical booking chat works',
      timestamp: '2026-12-01T09:00:00.000Z',
    };

    await assertSucceeds(
      setDoc(
        doc(customerDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-1'),
        message
      )
    );
    await assertSucceeds(
      getDocs(collection(customerDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages'))
    );
    await assertSucceeds(
      getDoc(
        doc(customerDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-1')
      )
    );
  });

  it('denies unrelated students from canonical booking chat', async () => {
    const otherDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();

    await assertFails(
      getDocs(collection(otherDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages'))
    );
    await assertFails(
      getDoc(doc(otherDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-1'))
    );
    await assertFails(
      setDoc(
        doc(otherDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-2'),
        {
          id: 'canonical-message-2',
          bookingId: CANONICAL_CHAT_BOOKING_ID,
          senderId: OTHER_USER_ID,
          senderName: OTHER_USER_ID,
          senderAvatar: '',
          text: 'Should not send',
          timestamp: '2026-12-01T09:05:00.000Z',
        }
      )
    );
  });

  it('allows assigned canonical instructors and denies unrelated instructors', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(
        doc(db, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-1'),
        {
          id: 'canonical-message-1',
          bookingId: CANONICAL_CHAT_BOOKING_ID,
          senderId: CANONICAL_CHAT_CUSTOMER_ID,
          senderName: CANONICAL_CHAT_CUSTOMER_ID,
          senderAvatar: '',
          text: 'Canonical booking chat works',
          timestamp: '2026-12-01T09:00:00.000Z',
        }
      );
      await setDoc(doc(db, 'users', INSTRUCTOR_USER_ID), {
        ...userProfile(INSTRUCTOR_USER_ID, 'instructor@example.com'),
        instructorId: 'instructor-1',
      });
    });

    const instructorDb = testEnv
      .authenticatedContext(CANONICAL_CHAT_INSTRUCTOR_USER_ID, {
        email: 'instructor-canonical-chat@example.com',
      })
      .firestore();
    const unrelatedInstructorDb = testEnv
      .authenticatedContext(INSTRUCTOR_USER_ID, { email: 'instructor@example.com' })
      .firestore();

    await assertSucceeds(
      getDoc(
        doc(instructorDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-1')
      )
    );
    await assertSucceeds(
      setDoc(
        doc(
          instructorDb,
          'bookings',
          CANONICAL_CHAT_BOOKING_ID,
          'messages',
          'canonical-message-instructor'
        ),
        {
          id: 'canonical-message-instructor',
          bookingId: CANONICAL_CHAT_BOOKING_ID,
          senderId: CANONICAL_CHAT_INSTRUCTOR_USER_ID,
          senderName: CANONICAL_CHAT_INSTRUCTOR_USER_ID,
          senderAvatar: '',
          text: 'Instructor reply',
          timestamp: '2026-12-01T09:10:00.000Z',
        }
      )
    );
    await assertFails(
      getDoc(
        doc(
          unrelatedInstructorDb,
          'bookings',
          CANONICAL_CHAT_BOOKING_ID,
          'messages',
          'canonical-message-1'
        )
      )
    );
  });

  it('preserves Admin reads while containing canonical chat deletion', async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(
        doc(db, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-admin'),
        {
          id: 'canonical-message-admin',
          bookingId: CANONICAL_CHAT_BOOKING_ID,
          senderId: CANONICAL_CHAT_CUSTOMER_ID,
          senderName: CANONICAL_CHAT_CUSTOMER_ID,
          senderAvatar: '',
          text: 'Admin-managed message',
          timestamp: '2026-12-01T09:15:00.000Z',
        }
      );
    });

    const adminDb = testEnv.authenticatedContext(OWNER_ID).firestore();

    await assertSucceeds(
      getDoc(
        doc(adminDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-admin')
      )
    );
    await assertFails(
      deleteDoc(
        doc(adminDb, 'bookings', CANONICAL_CHAT_BOOKING_ID, 'messages', 'canonical-message-admin')
      )
    );
  });
});

// Mirrors production canonical lesson bookings (minimal occurrence, no legacy userId).
const PROD_SHAPED_ACCOUNT_ID = 'F5mwFT8KvAOkYHxlElpagT1yftr1';
const PROD_SHAPED_SELF_PARTICIPANT_ID =
  '29ea271f35c01d51545cd77e56c3d2fc5990712f40f49279d98a83eb127c67b2';
const PROD_SHAPED_DEPENDENT_PARTICIPANT_ID =
  '2df3b3f88bad9e47232a77a29813a5eb220bc2917f6495db87d3edc0d0323bd7';
const PROD_SHAPED_SELF_BOOKING_ID = 'booking_b30f2dfe00f04cdb85d5092902bf99d4';
const PROD_SHAPED_DEPENDENT_BOOKING_ID = 'booking_633eed84516f4459a8baba8a20af0667';
const PROD_SHAPED_INSTRUCTOR_ID = 'ins_elena';

function productionShapedCanonicalBooking(
  bookingId: string,
  participantId: string
): Record<string, unknown> {
  return {
    bookingId,
    payerAccountId: PROD_SHAPED_ACCOUNT_ID,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: PROD_SHAPED_ACCOUNT_ID },
    },
    party: {
      kind: 'individual',
      participantIds: [participantId],
    },
    occurrence: {
      instructorId: PROD_SHAPED_INSTRUCTOR_ID,
    },
    lifecycle: { status: 'confirmed' },
  };
}

async function seedProductionShapedCanonicalChatFixture() {
  await seedData(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', PROD_SHAPED_ACCOUNT_ID), {
      ...userProfile(PROD_SHAPED_ACCOUNT_ID, 'ksusha@test.ru'),
      accountId: PROD_SHAPED_ACCOUNT_ID,
    });
    await setDoc(doc(db, 'participant_management_active_owner', PROD_SHAPED_SELF_PARTICIPANT_ID), {
      participantId: PROD_SHAPED_SELF_PARTICIPANT_ID,
      accountId: PROD_SHAPED_ACCOUNT_ID,
      participantManagementId: 'management_prod_shaped_self',
      managementRevision: 1,
      updatedAt: canonicalChatTimestamp,
      lastChangedByCommandId: 'command_prod_shaped_fixture',
      correlationId: 'correlation_prod_shaped_fixture',
    });
    await setDoc(
      doc(db, 'participant_management_active_owner', PROD_SHAPED_DEPENDENT_PARTICIPANT_ID),
      {
        participantId: PROD_SHAPED_DEPENDENT_PARTICIPANT_ID,
        accountId: PROD_SHAPED_ACCOUNT_ID,
        participantManagementId: 'management_prod_shaped_dependent',
        managementRevision: 1,
        updatedAt: canonicalChatTimestamp,
        lastChangedByCommandId: 'command_prod_shaped_fixture',
        correlationId: 'correlation_prod_shaped_fixture',
      }
    );
    await setDoc(
      doc(db, 'bookings', PROD_SHAPED_SELF_BOOKING_ID),
      productionShapedCanonicalBooking(PROD_SHAPED_SELF_BOOKING_ID, PROD_SHAPED_SELF_PARTICIPANT_ID)
    );
    await setDoc(
      doc(db, 'bookings', PROD_SHAPED_DEPENDENT_BOOKING_ID),
      productionShapedCanonicalBooking(
        PROD_SHAPED_DEPENDENT_BOOKING_ID,
        PROD_SHAPED_DEPENDENT_PARTICIPANT_ID
      )
    );
  });
}

describe('production-shaped canonical booking chat messages', () => {
  beforeEach(async () => {
    await seedProductionShapedCanonicalChatFixture();
  });

  it('allows ksusha account to list and read messages on both production-shaped bookings', async () => {
    const customerDb = testEnv
      .authenticatedContext(PROD_SHAPED_ACCOUNT_ID, { email: 'ksusha@test.ru' })
      .firestore();

    for (const bookingId of [PROD_SHAPED_SELF_BOOKING_ID, PROD_SHAPED_DEPENDENT_BOOKING_ID]) {
      await assertSucceeds(getDocs(collection(customerDb, 'bookings', bookingId, 'messages')));
      await assertSucceeds(
        setDoc(doc(customerDb, 'bookings', bookingId, 'messages', `message-${bookingId}`), {
          id: `message-${bookingId}`,
          bookingId,
          senderId: PROD_SHAPED_ACCOUNT_ID,
          senderName: PROD_SHAPED_ACCOUNT_ID,
          senderAvatar: '',
          text: 'Production-shaped canonical chat',
          timestamp: '2026-12-01T09:00:00.000Z',
        })
      );
      await assertSucceeds(
        getDoc(doc(customerDb, 'bookings', bookingId, 'messages', `message-${bookingId}`))
      );
    }
  });

  it('denies unrelated accounts on production-shaped canonical bookings', async () => {
    const otherDb = testEnv
      .authenticatedContext(OTHER_USER_ID, { email: 'other@example.com' })
      .firestore();

    for (const bookingId of [PROD_SHAPED_SELF_BOOKING_ID, PROD_SHAPED_DEPENDENT_BOOKING_ID]) {
      await assertFails(getDocs(collection(otherDb, 'bookings', bookingId, 'messages')));
    }
  });

  it('denies direct client reads of participant_management_active_owner while rule get() still authorizes chat', async () => {
    const customerDb = testEnv
      .authenticatedContext(PROD_SHAPED_ACCOUNT_ID, { email: 'ksusha@test.ru' })
      .firestore();

    await assertFails(
      getDoc(
        doc(customerDb, 'participant_management_active_owner', PROD_SHAPED_SELF_PARTICIPANT_ID)
      )
    );
    await assertFails(
      getDoc(
        doc(customerDb, 'participant_management_active_owner', PROD_SHAPED_DEPENDENT_PARTICIPANT_ID)
      )
    );
    await assertFails(getDocs(collection(customerDb, 'participant_management_active_owner')));

    await assertSucceeds(
      getDocs(collection(customerDb, 'bookings', PROD_SHAPED_SELF_BOOKING_ID, 'messages'))
    );
    await assertSucceeds(
      getDocs(collection(customerDb, 'bookings', PROD_SHAPED_DEPENDENT_BOOKING_ID, 'messages'))
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

describe('courses canonical provisioning marker', () => {
  const CANONICAL_COURSE_ID = 'course-canonical-marker-1';
  const STRICT_COURSE_ID = 'course-strict-shape-1';
  const LEGACY_COURSE_ID = 'course-legacy-marker-1';
  const canonicalCourseData = (courseId: string, withMarker = false) => ({
    courseId,
    title: 'Canonical Course',
    price: 100_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: ['instructor-1'],
    startAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: { seconds: 1_700_010_000, nanoseconds: 0 },
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId: 'correlation_seed',
    },
    ...(withMarker
      ? { provisioningManifestFingerprint: 'fingerprint_canonical_marker_course' }
      : {}),
  });

  beforeEach(async () => {
    await seedData(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', ADMIN_ID), userProfile(ADMIN_ID, 'admin@example.com', 'admin'));
      await setDoc(
        doc(db, 'courses', CANONICAL_COURSE_ID),
        canonicalCourseData(CANONICAL_COURSE_ID, true)
      );
      await setDoc(doc(db, 'courses', STRICT_COURSE_ID), canonicalCourseData(STRICT_COURSE_ID));
      await setDoc(doc(db, 'courses', LEGACY_COURSE_ID), {
        title: 'Legacy Marker Course',
        totalSeats: 8,
        availableSeats: 8,
        price: 100,
        duration: '5 days',
        description: 'Legacy',
        dates: 'December',
        bgImageUrl: 'https://example.com/legacy.jpg',
        instructorIds: ['instructor-1'],
      });
    });
  });

  it('denies admin client update when canonical provisioning marker is present', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'courses', CANONICAL_COURSE_ID), {
        instructorIds: ['instructor-1'],
        description: 'Legacy contamination attempt',
      })
    );
  });

  it('denies Admin client replacement and deletion of protected canonical courses', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();

    await assertFails(
      setDoc(doc(adminDb, 'courses', CANONICAL_COURSE_ID), {
        title: 'Legacy replacement',
        totalSeats: 8,
        availableSeats: 8,
        price: 100,
      })
    );
    await assertFails(deleteDoc(doc(adminDb, 'courses', CANONICAL_COURSE_ID)));
    await assertFails(deleteDoc(doc(adminDb, 'courses', STRICT_COURSE_ID)));
  });

  it('denies legacy client creation of canonical identities and shapes', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const newCanonicalId = 'course-client-canonical-create';

    await assertFails(
      setDoc(doc(adminDb, 'courses', newCanonicalId), canonicalCourseData(newCanonicalId, true))
    );
    await assertFails(
      setDoc(
        doc(adminDb, 'courses', `${newCanonicalId}-strict`),
        canonicalCourseData(`${newCanonicalId}-strict`)
      )
    );
  });

  it('allows admin client update for legacy courses without canonical marker', async () => {
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'courses', LEGACY_COURSE_ID), {
        description: 'Updated legacy description',
      })
    );
    await assertSucceeds(deleteDoc(doc(adminDb, 'courses', LEGACY_COURSE_ID)));
    await assertSucceeds(
      setDoc(doc(adminDb, 'courses', 'course-new-legacy'), {
        id: 'course-new-legacy',
        title: 'New legacy course',
        totalSeats: 4,
        availableSeats: 4,
        price: 100,
        dates: 'December',
      })
    );
  });
});

describe('course_catalog_content', () => {
  const COURSE_ID = 'course-catalog-1';
  const catalogContent = {
    courseId: COURSE_ID,
    duration: '5 days',
    description: 'Public catalog description',
    dates: '01.12.2026',
    bgImageUrl: 'https://example.com/course.jpg',
    shortDescription: 'Learn carving',
    benefits: ['Small groups', 'Video analysis'],
    faq: [{ q: 'What level?', a: 'Intermediate' }],
  };

  beforeEach(async () => {
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'course_catalog_content', COURSE_ID), catalogContent);
      await setDoc(
        doc(context.firestore(), 'users', USER_ID),
        userProfile(USER_ID, 'user@example.com')
      );
      await setDoc(
        doc(context.firestore(), 'users', ADMIN_ID),
        userProfile(ADMIN_ID, 'admin@example.com', 'admin')
      );
    });
  });

  it('allows unauthenticated and authenticated reads by id and collection list', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const studentDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();

    await assertSucceeds(getDoc(doc(anonymousDb, 'course_catalog_content', COURSE_ID)));
    await assertSucceeds(getDoc(doc(studentDb, 'course_catalog_content', COURSE_ID)));
    await assertSucceeds(
      getDocs(query(collection(anonymousDb, 'course_catalog_content'), limit(50)))
    );
    await assertSucceeds(
      getDocs(query(collection(studentDb, 'course_catalog_content'), limit(50)))
    );
  });

  it('denies client create, update, and delete while keeping canonical courses protected', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const studentDb = testEnv
      .authenticatedContext(USER_ID, { email: 'user@example.com' })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext(ADMIN_ID, { email: 'admin@example.com' })
      .firestore();
    const contentRef = doc(studentDb, 'course_catalog_content', COURSE_ID);
    const courseRef = doc(studentDb, 'courses', COURSE_ID);

    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'courses', COURSE_ID), {
        title: 'Course',
        totalSeats: 5,
        availableSeats: 5,
        price: 100,
      });
    });

    await assertFails(
      setDoc(doc(anonymousDb, 'course_catalog_content', 'course-catalog-2'), catalogContent)
    );
    await assertFails(setDoc(contentRef, { ...catalogContent, description: 'Tampered copy' }));
    await assertFails(updateDoc(contentRef, { description: 'Student edit' }));
    await assertFails(deleteDoc(contentRef));

    await assertSucceeds(
      setDoc(doc(adminDb, 'course_catalog_content', 'course-catalog-admin'), {
        ...catalogContent,
        courseId: 'course-catalog-admin',
      })
    );

    await assertFails(updateDoc(courseRef, { availableSeats: 999 }));
    await assertFails(setDoc(courseRef, { title: 'Student course write', price: 1 }));
  });
});
