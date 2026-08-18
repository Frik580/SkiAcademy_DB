import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearCallableFirestore,
  ensureCallableSignedInUser,
  getCallableFunctions,
  getCallableFirestore,
  seedCallableBaseFixtures,
  seedCallableCourse,
  seedCallableUserProfile,
  setupCallableIntegrationEnvironment,
  getRulesTestEnv,
  teardownCallableIntegrationEnvironment,
} from './callableTestEnv';

const COURSE_ID = 'guest-course-callable';

describe('createGuestCourseEnrollment callable', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await setupCallableIntegrationEnvironment();
  }, 60_000);

  beforeEach(async () => {
    await clearCallableFirestore();
    await ensureCallableSignedInUser();
    await seedCallableBaseFixtures();
    await seedCallableCourse(COURSE_ID);
  });

  afterAll(async () => {
    await teardownCallableIntegrationEnvironment();
  });

  it('creates the guest booking and reserves the course seat atomically', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');

    const { data } = await enroll({
      courseId: COURSE_ID,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      guestEmail: 'guest@example.com',
      language: 'en',
    });
    const result = data as { bookingId: string; availableSeats: number };

    expect(result.availableSeats).toBe(0);

    await getRulesTestEnv().withSecurityRulesDisabled(async (context: { firestore: () => any }) => {
      const db = context.firestore();
      const courseDoc = await getDoc(doc(db, 'courses', COURSE_ID));
      const bookingDoc = await getDoc(doc(db, 'bookings', result.bookingId));

      expect(courseDoc.data()?.availableSeats).toBe(0);
      expect(bookingDoc.data()).toMatchObject({
        courseId: COURSE_ID,
        status: 'pending',
        isGuest: true,
        guestName: 'Guest Skier',
      });
    });
  });

  it('returns the original result when a guest retry arrives after a lost response', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');

    const firstResponse = await enroll({
      courseId: COURSE_ID,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      guestEmail: 'guest@example.com',
      language: 'en',
      idempotencyKey: 'test-idempotency-key-1',
    });
    const firstResult = firstResponse.data as { bookingId: string; availableSeats: number };
    expect(firstResult.availableSeats).toBe(0);

    // The server has already completed the first request; the client retries with the same key.
    const secondResponse = await enroll({
      courseId: COURSE_ID,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      guestEmail: 'guest@example.com',
      language: 'en',
      idempotencyKey: 'test-idempotency-key-1',
    });
    const secondResult = secondResponse.data as { bookingId: string; availableSeats: number };
    expect(secondResult).toEqual(firstResult);
  });

  it('rejects a reused guest idempotency key with a different payload', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');
    const idempotencyKey = 'test-idempotency-key-conflict';

    await enroll({
      courseId: COURSE_ID,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      language: 'en',
      idempotencyKey,
    });

    await expect(
      enroll({
        courseId: 'another-course',
        guestName: 'Guest Skier',
        guestPhone: '+77000000000',
        language: 'en',
        idempotencyKey,
      })
    ).rejects.toMatchObject({
      code: 'functions/already-exists',
      message: expect.stringContaining('IDEMPOTENCY_KEY_CONFLICT'),
    });
  });

  it('handles concurrent guest requests with the same idempotency key atomically', async () => {
    const enroll = httpsCallable(getCallableFunctions(), 'createGuestCourseEnrollment');
    const input = {
      courseId: COURSE_ID,
      guestName: 'Guest Skier',
      guestPhone: '+77000000000',
      language: 'en' as const,
      idempotencyKey: 'test-idempotency-key-concurrent',
    };

    const [firstResponse, secondResponse] = await Promise.all([enroll(input), enroll(input)]);
    const firstResult = firstResponse.data as { bookingId: string; availableSeats: number };
    const secondResult = secondResponse.data as typeof firstResult;

    expect(secondResult).toEqual(firstResult);
    expect(
      (await getDoc(doc(getCallableFirestore(), 'courses', COURSE_ID))).data()?.availableSeats
    ).toBe(0);
  });

  it('enrolls an authenticated user with an atomic seat, balance, booking, and ledger update', async () => {
    await seedCallableUserProfile(500);
    const enroll = httpsCallable(getCallableFunctions(), 'enrollInCourse');

    const { data } = await enroll({ courseId: COURSE_ID, language: 'en' });
    const result = data as {
      bookingId: string;
      newBalance: number;
      availableSeats: number;
    };

    expect(result.newBalance).toBe(300);
    expect(result.availableSeats).toBe(0);
    expect(
      (await getDoc(doc(getCallableFirestore(), 'courses', COURSE_ID))).data()?.availableSeats
    ).toBe(0);
    expect(
      (await getDoc(doc(getCallableFirestore(), 'bookings', result.bookingId))).data()
    ).toMatchObject({
      courseId: COURSE_ID,
      status: 'confirmed',
    });
  });

  it('returns the original enrollment result when an authenticated retry arrives after success', async () => {
    await seedCallableUserProfile(500);
    const enroll = httpsCallable(getCallableFunctions(), 'enrollInCourse');

    const firstResponse = await enroll({ courseId: COURSE_ID, language: 'en' });
    const firstResult = firstResponse.data as {
      bookingId: string;
      newBalance: number;
      availableSeats: number;
    };
    const secondResponse = await enroll({ courseId: COURSE_ID, language: 'en' });
    const secondResult = secondResponse.data as typeof firstResult;

    expect(secondResult).toEqual(firstResult);
  });
});
