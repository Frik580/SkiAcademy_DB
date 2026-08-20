import { FirebaseError } from 'firebase/app';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOTS_COLLECTION } from '../../src/domain/availability';
import { AVAILABILITY_HOUR_LOCKS_COLLECTION, buildHourLockIds } from '@ski-academy/shared-domain';
import {
  CALLABLE_INSTRUCTOR_ID,
  clearCallableFirestore,
  ensureCallableSignedInUser,
  getCallableFirestore,
  getCallableFunctions,
  getCallableUserId,
  getRulesTestEnv,
  promoteCallableUserToAdmin,
  readCallableGuestWalletBalance,
  readCallableUserBalance,
  seedCallableBaseFixtures,
  seedCallableCourse,
  seedCallableUserProfile,
  setupCallableIntegrationEnvironment,
  teardownCallableIntegrationEnvironment,
} from './callableTestEnv';

const lessonPayload = (overrides: Record<string, unknown> = {}) => ({
  instructorId: CALLABLE_INSTRUCTOR_ID,
  instructorName: 'Callable Instructor',
  instructorAvatar: '',
  date: '2026-12-04',
  time: '10:00',
  durationHours: 2,
  status: 'confirmed',
  difficulty: 'beginner',
  ...overrides,
});

describe('bookingLogic callable transactions', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await setupCallableIntegrationEnvironment();
    await ensureCallableSignedInUser();
    await seedCallableBaseFixtures();
    await seedCallableUserProfile(500);
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

  it('rejects a reused booking ID with a different payload and a new idempotency key', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    await createBooking(
      lessonPayload({ id: 'booking-id-reuse', idempotencyKey: 'create-original' })
    );

    await expect(
      createBooking(
        lessonPayload({
          id: 'booking-id-reuse',
          time: '14:00',
          idempotencyKey: 'create-overwrite',
        })
      )
    ).rejects.toMatchObject({
      code: 'functions/already-exists',
      message: expect.stringContaining('A booking with this ID already exists'),
    } satisfies Partial<FirebaseError>);

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', 'booking-id-reuse'));
    expect(booking.data()?.time).toBe('10:00');
    expect(await readCallableUserBalance()).toBe(400);
  });

  it('does not let createGuestBooking overwrite an existing paid booking', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');

    await createBooking(
      lessonPayload({ id: 'booking-paid-protected', idempotencyKey: 'paid-protected' })
    );

    await expect(
      createGuestBooking({
        id: 'booking-paid-protected',
        userId: 'guest_overwrite',
        instructorId: CALLABLE_INSTRUCTOR_ID,
        instructorName: 'Callable Instructor',
        date: '2026-12-04',
        time: '15:00',
        durationHours: 1,
        difficulty: 'beginner',
        idempotencyKey: 'guest-overwrite',
      })
    ).rejects.toMatchObject({
      code: 'functions/already-exists',
    } satisfies Partial<FirebaseError>);

    const booking = await getDoc(doc(getCallableFirestore(), 'bookings', 'booking-paid-protected'));
    expect(booking.data()?.userId).toBe(getCallableUserId());
    expect(booking.data()?.isGuest).not.toBe(true);
    expect(booking.data()?.time).toBe('10:00');
    expect(booking.data()?.status).toBe('confirmed');
  });

  it('settles guest confirm onto school guest wallet and refunds there when unlinked', async () => {
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const cancelBooking = httpsCallable(getCallableFunctions(), 'cancelBooking');
    const db = getCallableFirestore();
    const bookingId = 'booking-guest-cancel-unlinked';

    await createGuestBooking({
      id: bookingId,
      userId: 'guest_cancel_unlinked',
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      date: '2026-12-05',
      time: '08:00',
      durationHours: 2,
      difficulty: 'beginner',
      idempotencyKey: 'guest-cancel-unlinked-create',
    });

    await promoteCallableUserToAdmin(500);
    await confirmBooking({ bookingId, idempotencyKey: 'guest-cancel-unlinked-confirm' });

    const topUp = await getDoc(doc(db, 'wallet_ledger', `wl_top_up_guest_${bookingId}`));
    const payment = await getDoc(doc(db, 'wallet_ledger', `wl_lesson_payment_${bookingId}`));
    expect(topUp.data()).toMatchObject({
      userId: 'school_guest',
      type: 'top_up',
      amount: 100,
    });
    expect(payment.data()).toMatchObject({
      userId: 'school_guest',
      type: 'lesson_payment',
      amount: -100,
    });
    expect(await readCallableGuestWalletBalance()).toBe(0);
    expect(await readCallableUserBalance()).toBe(500);

    const cancelled = await cancelBooking({
      bookingId,
      idempotencyKey: 'guest-cancel-unlinked-cancel',
    });
    expect(cancelled.data).toEqual({ refunded: 100, alreadyCancelled: false });

    const refund = await getDoc(doc(db, 'wallet_ledger', `wl_refund_${bookingId}`));
    expect(refund.data()).toMatchObject({
      userId: 'school_guest',
      type: 'refund',
      amount: 100,
    });
    expect(await readCallableGuestWalletBalance()).toBe(100);
    expect(await readCallableUserBalance()).toBe(500);

    const secondCancel = await cancelBooking({
      bookingId,
      idempotencyKey: 'guest-cancel-unlinked-cancel-2',
    });
    expect(secondCancel.data).toEqual({ refunded: 0, alreadyCancelled: true });
    expect(await readCallableGuestWalletBalance()).toBe(100);
  });

  it('does not charge when linking a confirmed guest booking and refunds the client on cancel', async () => {
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const linkGuestBooking = httpsCallable(getCallableFunctions(), 'linkGuestBooking');
    const cancelBooking = httpsCallable(getCallableFunctions(), 'cancelBooking');
    const targetUserId = getCallableUserId();
    const db = getCallableFirestore();
    const bookingId = 'booking-guest-link';

    await createGuestBooking({
      id: bookingId,
      userId: 'guest_link_user',
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      date: '2026-12-05',
      time: '09:00',
      durationHours: 2,
      difficulty: 'beginner',
      idempotencyKey: 'guest-link-create',
    });

    await promoteCallableUserToAdmin(500);
    await confirmBooking({ bookingId, idempotencyKey: 'guest-link-confirm' });

    expect(
      (await getDoc(doc(db, 'wallet_ledger', `wl_lesson_payment_${bookingId}`))).data()
    ).toMatchObject({
      userId: 'school_guest',
      amount: -100,
    });
    expect(await readCallableGuestWalletBalance()).toBe(0);

    const first = await linkGuestBooking({
      bookingId,
      targetUserId,
      idempotencyKey: 'guest-link-1',
    });
    expect(first.data).toEqual({ newBalance: 500 });
    expect(await readCallableUserBalance()).toBe(500);

    const second = await linkGuestBooking({
      bookingId,
      targetUserId,
      idempotencyKey: 'guest-link-2',
    });
    expect(second.data).toEqual({ newBalance: 500 });
    expect(await readCallableUserBalance()).toBe(500);

    const booking = await getDoc(doc(db, 'bookings', bookingId));
    expect(booking.data()).toMatchObject({
      userId: targetUserId,
      isGuest: false,
      status: 'confirmed',
    });

    const cancelled = await cancelBooking({
      bookingId,
      idempotencyKey: 'guest-link-cancel',
    });
    expect(cancelled.data).toEqual({ refunded: 100, alreadyCancelled: false });
    expect(await readCallableUserBalance()).toBe(600);
    expect(await readCallableGuestWalletBalance()).toBe(0);

    const refund = await getDoc(doc(db, 'wallet_ledger', `wl_refund_${bookingId}`));
    expect(refund.data()).toMatchObject({
      userId: targetUserId,
      type: 'refund',
      amount: 100,
    });
  });

  it('does not charge when linking a confirmed guest course and refunds the client on cancel', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const linkGuestBooking = httpsCallable(getCallableFunctions(), 'linkGuestBooking');
    const cancelBooking = httpsCallable(getCallableFunctions(), 'cancelBooking');
    const targetUserId = getCallableUserId();
    const courseId = 'guest-course-confirmed-link';
    const db = getCallableFirestore();

    await seedCallableCourse(courseId);
    const enrolled = await enroll({
      courseId,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      language: 'en',
      idempotencyKey: 'guest-course-confirmed-create',
    });
    const bookingId = (enrolled.data as { bookingId: string }).bookingId;

    await promoteCallableUserToAdmin(500);
    await confirmBooking({ bookingId, idempotencyKey: 'guest-course-confirmed-confirm' });

    expect(
      (await getDoc(doc(db, 'wallet_ledger', `wl_course_payment_${bookingId}`))).data()
    ).toMatchObject({
      userId: 'school_guest',
      amount: -200,
      type: 'course_payment',
    });
    expect(await readCallableGuestWalletBalance()).toBe(0);

    const linked = await linkGuestBooking({
      bookingId,
      targetUserId,
      idempotencyKey: 'guest-course-confirmed-link',
    });
    expect(linked.data).toEqual({ newBalance: 500 });
    expect(await readCallableUserBalance()).toBe(500);

    const cancelled = await cancelBooking({
      bookingId,
      idempotencyKey: 'guest-course-confirmed-cancel',
    });
    expect(cancelled.data).toEqual({ refunded: 200, alreadyCancelled: false });
    expect(await readCallableUserBalance()).toBe(700);
    expect(await readCallableGuestWalletBalance()).toBe(0);
    expect((await getDoc(doc(db, 'wallet_ledger', `wl_refund_${bookingId}`))).data()).toMatchObject(
      {
        userId: targetUserId,
        type: 'refund',
        amount: 200,
      }
    );
  });

  it('charges the linked client when a pending guest lesson is confirmed', async () => {
    const createGuestBooking = httpsCallable(getCallableFunctions(), 'createGuestBooking');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const linkGuestBooking = httpsCallable(getCallableFunctions(), 'linkGuestBooking');
    const targetUserId = getCallableUserId();

    await createGuestBooking({
      id: 'booking-guest-link-pending',
      userId: 'guest_link_pending',
      instructorId: CALLABLE_INSTRUCTOR_ID,
      instructorName: 'Callable Instructor',
      date: '2026-12-06',
      time: '11:00',
      durationHours: 2,
      difficulty: 'beginner',
      idempotencyKey: 'guest-link-pending-create',
    });

    await promoteCallableUserToAdmin(500);
    const linked = await linkGuestBooking({
      bookingId: 'booking-guest-link-pending',
      targetUserId,
      idempotencyKey: 'guest-link-pending-1',
    });
    expect(linked.data).toEqual({ newBalance: 500 });
    expect(await readCallableUserBalance()).toBe(500);

    await confirmBooking({
      bookingId: 'booking-guest-link-pending',
      idempotencyKey: 'guest-link-pending-confirm',
    });
    expect(await readCallableUserBalance()).toBe(400);

    await confirmBooking({
      bookingId: 'booking-guest-link-pending',
      idempotencyKey: 'guest-link-pending-confirm-2',
    });
    expect(await readCallableUserBalance()).toBe(400);

    const booking = await getDoc(
      doc(getCallableFirestore(), 'bookings', 'booking-guest-link-pending')
    );
    expect(booking.data()).toMatchObject({
      userId: targetUserId,
      isGuest: false,
      status: 'confirmed',
    });
    const ledger = await getDoc(
      doc(getCallableFirestore(), 'wallet_ledger', 'wl_lesson_payment_booking-guest-link-pending')
    );
    expect(ledger.exists()).toBe(true);
    expect(ledger.data()).toMatchObject({
      userId: targetUserId,
      amount: -100,
      type: 'lesson_payment',
    });
    expect(
      (
        await getDoc(
          doc(getCallableFirestore(), 'wallet_ledger', 'wl_top_up_guest_booking-guest-link-pending')
        )
      ).exists()
    ).toBe(false);
    expect(await readCallableGuestWalletBalance()).toBe(0);
  });

  it('charges the linked client when a pending guest course is confirmed', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');
    const confirmBooking = httpsCallable(getCallableFunctions(), 'confirmBooking');
    const linkGuestBooking = httpsCallable(getCallableFunctions(), 'linkGuestBooking');
    const targetUserId = getCallableUserId();
    const courseId = 'guest-course-link-confirm';

    await seedCallableCourse(courseId);
    const enrolled = await enroll({
      courseId,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      language: 'en',
      idempotencyKey: 'guest-course-link-create',
    });
    const bookingId = (enrolled.data as { bookingId: string }).bookingId;

    await promoteCallableUserToAdmin(500);
    const linked = await linkGuestBooking({
      bookingId,
      targetUserId,
      idempotencyKey: 'guest-course-link-1',
    });
    expect(linked.data).toEqual({ newBalance: 500 });
    expect(await readCallableUserBalance()).toBe(500);

    await confirmBooking({ bookingId, idempotencyKey: 'guest-course-link-confirm' });
    expect(await readCallableUserBalance()).toBe(300);

    const ledger = await getDoc(
      doc(getCallableFirestore(), 'wallet_ledger', `wl_course_payment_${bookingId}`)
    );
    expect(ledger.exists()).toBe(true);
    expect(ledger.data()).toMatchObject({
      userId: targetUserId,
      amount: -200,
      type: 'course_payment',
      courseId,
    });
    expect(
      (
        await getDoc(doc(getCallableFirestore(), 'wallet_ledger', `wl_top_up_guest_${bookingId}`))
      ).exists()
    ).toBe(false);
    expect(await readCallableGuestWalletBalance()).toBe(0);
  });

  it('releases hour locks when an admin completes a lesson', async () => {
    const createBooking = httpsCallable(getCallableFunctions(), 'createBooking');
    const completeBooking = httpsCallable(getCallableFunctions(), 'completeBooking');
    const db = getCallableFirestore();
    const bookingId = 'booking-complete-locks';

    await createBooking(lessonPayload({ id: bookingId, idempotencyKey: 'complete-create' }));
    await promoteCallableUserToAdmin(400);

    const lockIds = buildHourLockIds({
      instructorId: CALLABLE_INSTRUCTOR_ID,
      date: '2026-12-04',
      time: '10:00',
      durationHours: 2,
    });
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      true
    );

    const first = await completeBooking({ bookingId, idempotencyKey: 'complete-1' });
    expect(first.data).toEqual({ bookingId, status: 'completed' });

    expect((await getDoc(doc(db, 'bookings', bookingId))).data()?.status).toBe('completed');
    expect((await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId))).exists()).toBe(false);
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      false
    );
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[1]))).exists()).toBe(
      false
    );

    const second = await completeBooking({ bookingId, idempotencyKey: 'complete-2' });
    expect(second.data).toEqual({ bookingId, status: 'completed' });
    expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
      false
    );
  });

  describe('interactive planner addBooking', () => {
    it('lets an admin create a break without a system user profile', async () => {
      const addBooking = httpsCallable(getCallableFunctions(), 'addBooking');
      const db = getCallableFirestore();
      const bookingId = 'planner-block-break';

      await promoteCallableUserToAdmin(500);

      const result = await addBooking({
        userId: 'system_block_break',
        booking: lessonPayload({
          id: bookingId,
          userId: 'system_block_break',
          durationHours: 1,
          time: '12:00',
          totalPrice: 0,
          notes: 'Break',
        }),
        idempotencyKey: 'planner-break-1',
      });

      expect(result.data).toEqual({ bookingId, totalPrice: 0, newBalance: 0 });
      expect((await getDoc(doc(db, 'bookings', bookingId))).data()).toMatchObject({
        userId: 'system_block_break',
        instructorId: CALLABLE_INSTRUCTOR_ID,
        time: '12:00',
        durationHours: 1,
        totalPrice: 0,
        status: 'confirmed',
      });
      expect(
        (await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId))).data()
      ).toMatchObject({
        bookingId,
        slotType: 'block',
      });
      const lockIds = buildHourLockIds({
        instructorId: CALLABLE_INSTRUCTOR_ID,
        date: '2026-12-04',
        time: '12:00',
        durationHours: 1,
      });
      expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
        true
      );
      expect(await readCallableUserBalance()).toBe(500);
    });

    it('lets an admin create a day off without a system user profile', async () => {
      const addBooking = httpsCallable(getCallableFunctions(), 'addBooking');
      const db = getCallableFirestore();
      const bookingId = 'planner-block-day-off';

      await promoteCallableUserToAdmin(500);

      const result = await addBooking({
        userId: 'system_block_day_off',
        booking: lessonPayload({
          id: bookingId,
          userId: 'system_block_day_off',
          time: '08:00',
          durationHours: 11,
          totalPrice: 0,
          notes: 'Day off',
        }),
        idempotencyKey: 'planner-day-off-1',
      });

      expect(result.data).toEqual({ bookingId, totalPrice: 0, newBalance: 0 });
      expect((await getDoc(doc(db, 'bookings', bookingId))).data()).toMatchObject({
        userId: 'system_block_day_off',
        time: '08:00',
        durationHours: 11,
        totalPrice: 0,
        status: 'confirmed',
      });
      expect(
        (await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId))).data()
      ).toMatchObject({
        bookingId,
        slotType: 'block',
        durationHours: 11,
      });
      const lockIds = buildHourLockIds({
        instructorId: CALLABLE_INSTRUCTOR_ID,
        date: '2026-12-04',
        time: '08:00',
        durationHours: 11,
      });
      expect(lockIds).toHaveLength(11);
      expect((await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[0]))).exists()).toBe(
        true
      );
      expect(
        (await getDoc(doc(db, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockIds[10]))).exists()
      ).toBe(true);
      expect(await readCallableUserBalance()).toBe(500);
    });

    it('lets an admin book a paid lesson for a registered client', async () => {
      const addBooking = httpsCallable(getCallableFunctions(), 'addBooking');
      const db = getCallableFirestore();
      const clientId = 'planner-client-1';
      const bookingId = 'planner-client-lesson';

      await getRulesTestEnv().withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', clientId), {
          uid: clientId,
          email: 'planner-client@example.com',
          displayName: 'Planner Client',
          role: 'user',
          avatarUrl: '',
          balanceUSD: 200,
        });
      });
      await promoteCallableUserToAdmin(500);

      const result = await addBooking({
        userId: clientId,
        booking: lessonPayload({
          id: bookingId,
          userId: clientId,
          durationHours: 2,
          time: '10:00',
          notes: 'Admin planner booking',
        }),
        idempotencyKey: 'planner-client-lesson-1',
      });

      expect(result.data).toEqual({ bookingId, totalPrice: 100, newBalance: 100 });
      expect((await getDoc(doc(db, 'bookings', bookingId))).data()).toMatchObject({
        userId: clientId,
        instructorId: CALLABLE_INSTRUCTOR_ID,
        durationHours: 2,
        totalPrice: 100,
        status: 'confirmed',
      });
      expect(
        (await getDoc(doc(db, AVAILABILITY_SLOTS_COLLECTION, bookingId))).data()
      ).toMatchObject({
        bookingId,
        slotType: 'lesson',
      });
      expect((await getDoc(doc(db, 'users', clientId))).data()?.balanceUSD).toBe(100);
      expect(await readCallableUserBalance()).toBe(500);
    });

    it('rejects interactive planner addBooking from a non-admin', async () => {
      const addBooking = httpsCallable(getCallableFunctions(), 'addBooking');

      await expect(
        addBooking({
          userId: 'system_block_break',
          booking: lessonPayload({
            id: 'planner-break-denied',
            userId: 'system_block_break',
            durationHours: 1,
            time: '13:00',
            totalPrice: 0,
          }),
          idempotencyKey: 'planner-break-denied-1',
        })
      ).rejects.toMatchObject({
        code: 'functions/permission-denied',
      });
    });
  });
});
