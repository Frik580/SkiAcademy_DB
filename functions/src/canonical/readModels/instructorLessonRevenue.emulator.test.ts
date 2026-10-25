import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  TestActorSchema,
  TestActorAssignmentSchema,
  TestSessionSchema,
} from '@ski-academy/shared-domain';
import {
  revenueAccount,
  revenueAt,
  revenueAudit,
  revenueBooking,
  revenuePayment,
} from '../../../../tests/helpers/instructorRevenueFixtures';
import {
  reconcileInstructorLessonRevenue,
  syncInstructorLessonRevenue,
  syncInstructorLessonRevenuePayment,
} from './instructorLessonRevenueProjection';
import { createResolveInstructorLessonRevenueHandler } from './resolveInstructorLessonRevenueCallable';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
let app: App;
let db: Firestore;
const summaryPath = 'instructor_lesson_revenue/live/instructors/revenue_instructor';
const summary = async () => (await db.doc(summaryPath).get()).data();
async function seed(id = 'revenue_booking', patch = {}) {
  await db.doc(`bookings/${id}`).set(revenueBooking(id));
  await db.doc(`payments/payment_${id}`).set(revenuePayment(id, patch));
}

describeEmulator('instructor revenue transactions and callable authorization', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'instructor-revenue-tests');
    db = getFirestore(app);
  });
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ski-school-e2e/databases/(default)/documents`,
      { method: 'DELETE' }
    );
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('sums unique bookings, survives concurrent duplicate hot/history events and reordered keys', async () => {
    await seed();
    await seed('revenue_two', { refundedAmount: 2000, retainedAmount: 8000 });
    await Promise.all([
      syncInstructorLessonRevenue(db, 'revenue_booking'),
      syncInstructorLessonRevenue(db, 'revenue_booking'),
    ]);
    await syncInstructorLessonRevenue(db, 'revenue_two');
    expect(await summary()).toMatchObject({ retainedAmount: 18000, unavailableCount: 0 });
    const before = await summary();
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toEqual(before);
    const row = await db.doc('instructor_lesson_revenue_contributions/revenue_booking').get();
    await row.ref.set(Object.fromEntries(Object.entries(row.data()!).reverse()));
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toEqual(before);
  });

  it('uses latest Payment revision for refund/correction even when an older event arrives later', async () => {
    await seed();
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    await db.doc('payments/payment_revenue_booking').set(
      revenuePayment('revenue_booking', {
        refundedAmount: 4000,
        retainedAmount: 6000,
        revision: 2,
      })
    );
    await syncInstructorLessonRevenuePayment(db, revenuePayment(), revenuePayment());
    expect(await summary()).toMatchObject({ retainedAmount: 6000 });
    await db.doc('payments/payment_revenue_booking').set(
      revenuePayment('revenue_booking', {
        paidAmount: 15000,
        originalPrice: 15000,
        price: 15000,
        retainedAmount: 15000,
        settledAmount: 15000,
        revision: 3,
      })
    );
    await syncInstructorLessonRevenuePayment(db, undefined, revenuePayment());
    expect(await summary()).toMatchObject({ retainedAmount: 15000 });
    await db.doc('payments/payment_revenue_booking').set(
      revenuePayment('revenue_booking', {
        refundedAmount: 10000,
        retainedAmount: 0,
        revision: 4,
      })
    );
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toMatchObject({ retainedAmount: 0, unavailableCount: 0 });
  });

  it('moves one contribution atomically on reassignment, status correction, and deletion', async () => {
    await seed();
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    const original = revenueBooking();
    await db.doc('bookings/revenue_booking').set(
      revenueBooking('revenue_booking', {
        occurrence: { ...original.occurrence, instructorId: 'new_instructor' },
        revision: 2,
      })
    );
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toMatchObject({ retainedAmount: 0 });
    const moved = db.doc('instructor_lesson_revenue/live/instructors/new_instructor');
    expect((await moved.get()).data()).toMatchObject({ retainedAmount: 10000 });
    await db
      .doc('bookings/revenue_booking')
      .update({ lifecycle: { status: 'no_show', noShowAt: revenueAt }, revision: 3 });
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect((await moved.get()).data()).toMatchObject({ retainedAmount: 0 });
    await db.doc('bookings/revenue_booking').delete();
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(
      (await db.doc('instructor_lesson_revenue_contributions/revenue_booking').get()).exists
    ).toBe(false);
  });

  it('withholds incomplete money and recovers after Payment restoration; ignores courses', async () => {
    await db.doc('bookings/revenue_booking').set(revenueBooking());
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toMatchObject({ retainedAmount: 0, unavailableCount: 1 });
    await db
      .doc('payments/payment_revenue_booking')
      .set({ ...revenuePayment(), retainedAmount: 50 });
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toMatchObject({ unavailableCount: 1 });
    await db.doc('payments/payment_revenue_booking').set(revenuePayment());
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    expect(await summary()).toMatchObject({ retainedAmount: 10000, unavailableCount: 0 });
    await syncInstructorLessonRevenuePayment(db, undefined, {
      subjectType: 'course_enrollment',
      subjectId: 'course_enrollment_x',
    });
    expect(await summary()).toMatchObject({ retainedAmount: 10000 });
  });

  it('hides previously loaded totals for malformed attribution and restores via reconciliation', async () => {
    await seed();
    await reconcileInstructorLessonRevenue(db);
    await db.doc('bookings/revenue_booking').update({ dataScope: 'broken_scope' });
    expect(await syncInstructorLessonRevenue(db, 'revenue_booking')).toEqual({ blocked: true });
    expect(await summary()).toMatchObject({ retainedAmount: 0, unavailableCount: 1 });
    expect((await db.doc('instructor_lesson_revenue/state').get()).data()?.ready).toBe(true);
    await expect(reconcileInstructorLessonRevenue(db)).rejects.toThrow('attribution unavailable');
    await db.doc('bookings/revenue_booking').set(revenueBooking());
    await reconcileInstructorLessonRevenue(db);
    expect(await summary()).toMatchObject({ retainedAmount: 10000, unavailableCount: 0 });
  });

  it('backfills >100 rows and repairs missed events, orphan contributions and a deleted/corrupt summary', async () => {
    const batch = db.batch();
    for (let index = 0; index < 103; index++) {
      const id = `revenue_${String(index).padStart(3, '0')}`;
      batch.set(db.doc(`bookings/${id}`), revenueBooking(id));
      batch.set(db.doc(`payments/payment_${id}`), revenuePayment(id));
    }
    await batch.commit();
    await reconcileInstructorLessonRevenue(db);
    expect(await summary()).toMatchObject({ retainedAmount: 1030000 });
    await db.doc('bookings/revenue_000').delete();
    await db.doc(summaryPath).delete();
    await reconcileInstructorLessonRevenue(db);
    expect(await summary()).toMatchObject({ retainedAmount: 1020000 });
    await db.doc(summaryPath).update({ retainedAmount: 999 });
    await reconcileInstructorLessonRevenue(db);
    expect(await summary()).toMatchObject({ retainedAmount: 1020000 });
    expect((await db.doc('instructor_lesson_revenue/state').get()).data()?.ready).toBe(true);
  }, 180000);

  it('derives identity from auth.uid; reload/login resolve the same projection; denies spoofing/disabled accounts', async () => {
    await db.doc('users/revenue_coach').set(revenueAccount());
    const handler = createResolveInstructorLessonRevenueHandler(db);
    const request = {
      auth: { uid: 'revenue_coach' },
      data: { idempotencyKey: 'read:revenue' },
    } as never;
    const result = await handler(request);
    expect(result).toEqual({ summaryPath, statePath: 'instructor_lesson_revenue/state' });
    expect(await handler(request)).toEqual(result);
    await expect(handler({ data: {} } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handler({ auth: { uid: 'revenue_coach' }, data: { instructorId: 'another' } } as never)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      handler({
        auth: { uid: 'revenue_coach' },
        data: { requestedTestSessionId: 'test_other' },
      } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('users/revenue_coach').update({ 'lifecycle.status': 'disabled' });
    await expect(handler(request)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('isolates live and product_test, each session, and scope-mismatched Payments', async () => {
    const scope = { dataScope: 'test', testSessionId: 'test_revenue' };
    await seed();
    await syncInstructorLessonRevenue(db, 'revenue_booking');
    await db.doc('bookings/test_booking').set(revenueBooking('test_booking', scope));
    await db.doc('payments/payment_test_booking').set(revenuePayment('test_booking', scope));
    await syncInstructorLessonRevenue(db, 'test_booking');
    expect(await summary()).toMatchObject({ retainedAmount: 10000 });
    const testSummary = db.doc(
      'instructor_lesson_revenue/test_test_revenue/instructors/revenue_instructor'
    );
    expect((await testSummary.get()).data()).toMatchObject({
      retainedAmount: 10000,
      unavailableCount: 0,
    });
    await db.doc('payments/payment_test_booking').update({ testSessionId: 'test_another' });
    await syncInstructorLessonRevenue(db, 'test_booking');
    expect((await testSummary.get()).data()).toMatchObject({
      retainedAmount: 0,
      unavailableCount: 1,
    });
    await db.doc('users/revenue_coach').set({ ...revenueAccount(), dataScope: 'test' });
    await db.doc('test_actors/revenue_coach').set(
      TestActorSchema.parse({
        accountId: 'revenue_coach',
        participantIds: ['revenue_participant'],
        instructorId: 'revenue_instructor',
        kind: 'test_instructor',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: revenueAt,
        updatedAt: revenueAt,
        audit: revenueAudit,
      })
    );
    await db.doc('test_actor_assignments/revenue_coach').set(
      TestActorAssignmentSchema.parse({
        accountId: 'revenue_coach',
        activeTestSessionId: 'test_revenue',
        revision: 1,
        updatedAt: revenueAt,
        audit: revenueAudit,
      })
    );
    await db.doc('test_sessions/test_revenue').set(
      TestSessionSchema.parse({
        testSessionId: 'test_revenue',
        schemaVersion: 1,
        status: 'active',
        label: 'Revenue Test',
        createdByAccountId: 'revenue_admin',
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 1,
        revision: 1,
        createdAt: revenueAt,
        updatedAt: revenueAt,
        audit: revenueAudit,
      })
    );
    const handler = createResolveInstructorLessonRevenueHandler(db);
    expect((await handler({ auth: { uid: 'revenue_coach' }, data: {} } as never)).summaryPath).toBe(
      testSummary.path
    );
    await db.doc('test_sessions/test_revenue').update({ status: 'locked' });
    await expect(
      handler({ auth: { uid: 'revenue_coach' }, data: {} } as never)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
