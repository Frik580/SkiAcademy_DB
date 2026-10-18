import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { initializeEmulatorTestEnvironment } from '../helpers/firebaseEmulatorTestEnv';
import { readRepoFile } from '../helpers/readRepoFile';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
let env: RulesTestEnvironment;
const ownPath = 'instructor_lesson_revenue/live/instructors/coach_1';
const testPath = 'instructor_lesson_revenue/test_test_revenue/instructors/coach_1';
const profile = { instructorId: 'coach_1', lifecycle: { status: 'active' }, dataScope: 'live' };

describeEmulator('instructor revenue sanitized exact-document permissions', () => {
  beforeAll(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
    env = await initializeEmulatorTestEnvironment({
      projectId: 'demo-ski-school-e2e',
      firestore: { host, port: Number(port), rules: readRepoFile('firestore.rules') },
    });
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/coach_account'), profile);
      await setDoc(doc(db, 'users/stranger'), {
        instructorId: 'coach_2',
        lifecycle: { status: 'active' },
      });
      await setDoc(doc(db, ownPath), { retainedAmount: 12000, unavailableCount: 0, revision: 1 });
      await setDoc(doc(db, testPath), { retainedAmount: 9000, unavailableCount: 0, revision: 1 });
      await setDoc(doc(db, 'instructor_lesson_revenue/state'), { ready: true });
      await setDoc(doc(db, 'instructor_lesson_revenue_contributions/booking_private'), {
        paymentRevision: 3,
      });
      await setDoc(doc(db, 'payments/payment_private'), { payerAccountId: 'private_customer' });
    });
  });
  afterAll(async () => {
    if (env) await env.cleanup();
  });

  it('permits only own exact total and readiness, including an empty own projection', async () => {
    const db = env.authenticatedContext('coach_account').firestore();
    await assertSucceeds(getDoc(doc(db, ownPath)));
    await assertSucceeds(getDoc(doc(db, 'instructor_lesson_revenue/state')));
    await assertFails(getDocs(collection(db, 'instructor_lesson_revenue/live/instructors')));
    await assertFails(getDoc(doc(db, 'instructor_lesson_revenue/live/instructors/coach_2')));
    await env.withSecurityRulesDisabled(async (c) =>
      setDoc(doc(c.firestore(), 'users/coach_account'), { ...profile, instructorId: 'empty_coach' })
    );
    await assertSucceeds(getDoc(doc(db, 'instructor_lesson_revenue/live/instructors/empty_coach')));
  });

  it('denies anonymous, other instructors, disabled accounts, raw payments/contributions and all writes', async () => {
    const db = env.authenticatedContext('coach_account').firestore();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ownPath)));
    await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(), ownPath)));
    await assertFails(getDoc(doc(db, 'payments/payment_private')));
    await assertFails(getDoc(doc(db, 'instructor_lesson_revenue_contributions/booking_private')));
    await assertFails(setDoc(doc(db, ownPath), { retainedAmount: 999 }));
    await assertFails(setDoc(doc(db, 'instructor_lesson_revenue/state'), { ready: true }));
    await assertFails(updateDoc(doc(db, 'users/coach_account'), { instructorId: 'coach_2' }));
    await env.withSecurityRulesDisabled(async (c) =>
      updateDoc(doc(c.firestore(), 'users/coach_account'), { 'lifecycle.status': 'disabled' })
    );
    await assertFails(getDoc(doc(db, ownPath)));
  });

  it('separates live/product_test and rechecks assignment, actor allowlist and active session', async () => {
    const db = env.authenticatedContext('coach_account').firestore();
    await assertFails(getDoc(doc(db, testPath)));
    await env.withSecurityRulesDisabled(async (c) => {
      const admin = c.firestore();
      await setDoc(doc(admin, 'users/coach_account'), { ...profile, dataScope: 'test' });
      await setDoc(doc(admin, 'test_actors/coach_account'), {
        accountId: 'coach_account',
        allowed: true,
        dataScope: 'test',
      });
      await setDoc(doc(admin, 'test_actor_assignments/coach_account'), {
        accountId: 'coach_account',
        activeTestSessionId: 'test_revenue',
      });
      await setDoc(doc(admin, 'test_sessions/test_revenue'), { status: 'active' });
    });
    await assertSucceeds(getDoc(doc(db, testPath)));
    await assertFails(getDoc(doc(db, ownPath)));
    await assertFails(
      getDoc(doc(db, 'instructor_lesson_revenue/test_test_other/instructors/coach_1'))
    );
    await env.withSecurityRulesDisabled(async (c) =>
      updateDoc(doc(c.firestore(), 'test_sessions/test_revenue'), { status: 'locked' })
    );
    await assertFails(getDoc(doc(db, testPath)));
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'test_sessions/test_revenue'), { status: 'active' });
      await updateDoc(doc(c.firestore(), 'test_actors/coach_account'), { allowed: false });
    });
    await assertFails(getDoc(doc(db, testPath)));
  });
});
