import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  BookingSchema,
  BookingIdSchema,
  CourseEnrollmentSchema,
  CourseEnrollmentIdSchema,
  PaymentSchema,
  MonetaryEventSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  monetaryEventIdFromCommandEffect,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalCourseDeliveryFixtures,
} from '@ski-academy/shared-domain/testing';
import {
  syncGuestConfirmationWork,
  syncGuestConfirmationWrite,
  processGuestConfirmationWork,
  GUEST_CONFIRMATION_WORK_COLLECTION,
  WORK_LEASE_MS,
  workReadMetrics,
} from './guestConfirmationWork';
import {
  beginGuestConfirmationBackfill,
  cutoverGuestConfirmationQueue,
  rollbackGuestConfirmationQueue,
  readGuestConfirmationControl,
  runGuestConfirmationRecoveryPage,
  GUEST_CONFIRMATION_CONTROL_PATH,
  RECOVERY_INTERVAL_MS,
  GUEST_CONFIRMATION_QUARANTINE_COLLECTION,
  repairGuestConfirmationQuarantinePage,
} from './guestConfirmationRecovery';
import { runScheduledGuestConfirmationReconciliation } from './guestConfirmationScheduler';
import { reconcileGuestConfirmationLifecycleMismatchAfterCommand } from '../finance/financeCorrectionCommands';
import { discoverFullyFundedGuestConfirmationSweepPaymentIds } from './guestConfirmationReconciliationSweep';

const now = new Date('2026-01-01T12:00:00Z');
const at = timestampFromDate(now);
let app: App;
let db: Firestore;
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const collections = [
  'bookings',
  'course_enrollments',
  'payments',
  'monetary_events',
  'courses',
  'admin_issues',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  GUEST_CONFIRMATION_WORK_COLLECTION,
  'migration_control',
  GUEST_CONFIRMATION_QUARANTINE_COLLECTION,
];

function booking(id: string, status: 'pending' | 'cancelled' | 'confirmed' = 'cancelled') {
  const bookingId = BookingIdSchema.parse(id);
  return BookingSchema.parse({
    ...canonicalBookingCollaborationFixtures.guestPendingBooking,
    bookingId,
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 3,
    updatedAt: at,
    occurrence:
      status === 'pending'
        ? {
            ...canonicalBookingCollaborationFixtures.guestPendingBooking.occurrence,
            interval: {
              startsAt: timestampFromDate(new Date('2026-01-02T12:00:00Z')),
              endsAt: timestampFromDate(new Date('2026-01-02T13:00:00Z')),
            },
          }
        : canonicalBookingCollaborationFixtures.guestPendingBooking.occurrence,
    lifecycle:
      status === 'cancelled'
        ? { status, cancelledAt: at, reasonCode: 'reservation_expired' }
        : status === 'confirmed'
          ? { status }
          : { status, reservationExpiresAt: timestampFromDate(new Date('2026-01-02T12:00:00Z')) },
  });
}
function payment(subject: ReturnType<typeof booking>, funded = true) {
  return PaymentSchema.parse({
    paymentId: subject.paymentId,
    subjectType: 'booking',
    subjectId: subject.bookingId,
    currency: 'KZT',
    originalPrice: 12000,
    price: 12000,
    paidAmount: funded ? 12000 : 0,
    refundedAmount: 0,
    retainedAmount: funded ? 12000 : 0,
    settledAmount: funded ? 12000 : 0,
    writtenOffAmount: 0,
    outstandingAmount: funded ? 0 : 12000,
    paymentStatus: funded ? 'paid' : 'unpaid',
    incrementalRequirements: [],
    revision: funded ? 2 : 1,
    eventRevision: funded ? 1 : 0,
    createdAt: at,
    updatedAt: at,
  });
}
async function seed(
  id: string,
  funded = true,
  status: 'pending' | 'cancelled' | 'confirmed' = 'cancelled'
) {
  const subject = booking(id, status);
  const p = payment(subject, funded);
  await db.doc(`bookings/${id}`).set(subject);
  await db.doc(`payments/${p.paymentId}`).set(p);
  if (funded) await seedEvent(p);
  return { subject, payment: p };
}
async function seedEvent(p: ReturnType<typeof payment>) {
  const commandId = CommandIdSchema.parse(`command_${p.paymentId}_fund`);
  const event = MonetaryEventSchema.parse({
    eventId: monetaryEventIdFromCommandEffect(commandId, 0),
    eventKind: 'manual_payment',
    currency: 'KZT',
    paymentId: p.paymentId,
    subjectType: p.subjectType,
    subjectId: p.subjectId,
    paymentEffect: {
      paidAmountDelta: 12000,
      settledAmountDelta: 12000,
      outstandingAmountDelta: -12000,
    },
    sourceKind: 'manual_external',
    manualReference: 'emulator-fixture',
    actor: { kind: 'system', systemActorId: 'system_guest_work_fixture' },
    commandId,
    correlationId: CorrelationIdSchema.parse('correlation_guest_work_fixture'),
    paymentEventRevision: 1,
    occurredAt: at,
    recordedAt: at,
  });
  await db.doc(`monetary_events/${event.eventId}`).set(event);
}
async function work(paymentId: string) {
  return (await db.doc(`${GUEST_CONFIRMATION_WORK_COLLECTION}/${paymentId}`).get()).data()!;
}
async function prepareQueue() {
  await beginGuestConfirmationBackfill(
    db,
    'emulator: three triggers active and index configuration checked'
  );
  for (let i = 0; i < 50; i++) {
    await runGuestConfirmationRecoveryPage(db, now, { backfill: true, pageSize: 2 });
    if ((await readGuestConfirmationControl(db))!.backfillPass === 2) break;
  }
  const control = (await readGuestConfirmationControl(db))!;
  await cutoverGuestConfirmationQueue(
    db,
    control.epoch,
    'emulator: transfer and trigger validation'
  );
  await db
    .doc(GUEST_CONFIRMATION_CONTROL_PATH)
    .update({ nextRecoveryAtMs: now.getTime() + RECOVERY_INTERVAL_MS });
}

describe.skipIf(!emulator)(
  'guest confirmation incremental queue (Firestore Emulator integration)',
  () => {
    beforeAll(() => {
      app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'guest-work-tests');
      db = getFirestore(app);
    });
    afterAll(async () => {
      await deleteApp(app);
    });
    beforeEach(async () => {
      vi.restoreAllMocks();
      for (const collection of collections) await db.recursiveDelete(db.collection(collection));
    });

    it('preserves the legacy sweep until explicitly proven ready', async () => {
      await seed('booking_legacy');
      const result = await runScheduledGuestConfirmationReconciliation(db, now);
      expect(result.candidateSource).toBe('legacy_sweep');
      expect(result.reconciled).toBe(1);
      await beginGuestConfirmationBackfill(db, 'emulator evidence');
      const control = (await readGuestConfirmationControl(db))!;
      await expect(cutoverGuestConfirmationQueue(db, control.epoch, 'checked')).rejects.toThrow(
        'not ready'
      );
      expect((await readGuestConfirmationControl(db))!.mode).toBe('legacy');
    });

    it('performs no subject/payment reads for an empty ready queue', async () => {
      await prepareQueue();
      const result = await runScheduledGuestConfirmationReconciliation(db, now);
      expect(result).toMatchObject({
        candidateSource: 'queue',
        workDocsRead: 0,
        recoveryDocsRead: 0,
        subjectDocsRead: 0,
        paymentLookupReads: 0,
        controlDocsRead: 1,
        canonicalDocsRead: 0,
      });
    });

    it('removes repeated reads of 21 unchanged subjects and payments on ordinary runs', async () => {
      for (let i = 0; i < 21; i++)
        await seed(`booking_unchanged_${String(i).padStart(2, '0')}`, false);
      const before = await discoverFullyFundedGuestConfirmationSweepPaymentIds(db);
      await prepareQueue();
      const after = await runScheduledGuestConfirmationReconciliation(db, now);
      expect(before).toMatchObject({ subjectDocsRead: 21, paymentLookupReads: 21 });
      expect(after).toMatchObject({
        workDocsRead: 0,
        subjectDocsRead: 0,
        paymentLookupReads: 0,
        recoveryDocsRead: 0,
      });
      console.log(
        JSON.stringify({
          measurement: '21_unchanged',
          before: {
            subjectDocsRead: before.subjectDocsRead,
            paymentLookupReads: before.paymentLookupReads,
          },
          after,
        })
      );
      await db.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ nextRecoveryAtMs: 0 });
      const recovery = await runScheduledGuestConfirmationReconciliation(db, now);
      expect(recovery).toMatchObject({
        recoveryDocsRead: 21,
        subjectDocsRead: 21,
        paymentLookupReads: 21,
        workDocsRead: 21,
        controlDocsRead: 3,
        canonicalDocsRead: 0,
      });
      console.log(JSON.stringify({ measurement: '21_unchanged_recovery', ...recovery }));
    });

    it('queues new full funding and cancelled paid bookings; completion stays out of the due query', async () => {
      const { subject, payment: unpaid } = await seed('booking_new_funding', false);
      await syncGuestConfirmationWrite(db, 'bookings', subject.bookingId, undefined, subject, now);
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).empty).toBe(true);
      const funded = payment(subject);
      await db.doc(`payments/${funded.paymentId}`).set(funded);
      await seedEvent(funded);
      await syncGuestConfirmationWrite(db, 'payments', funded.paymentId, unpaid, funded, now);
      const result = await processGuestConfirmationWork(db, now);
      expect(result).toMatchObject({ reconciled: 1, failed: 0, workCandidatesSelected: 1 });
      expect((await work(funded.paymentId)).status).toBe('complete');
      const repeat = await processGuestConfirmationWork(db, now);
      expect(repeat.workDocsRead).toBe(0);
      expect((await db.collection('admin_issues').get()).size).toBe(1);
      console.log(JSON.stringify({ measurement: 'one_new_financial_event_worker', ...result }));
    });

    it('reconciles paid enrollment cancellation through the canonical command', async () => {
      const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_withdrawn');
      const enrollment = CourseEnrollmentSchema.parse({
        ...canonicalCourseDeliveryFixtures.guestPendingEnrollment,
        enrollmentId,
        paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
        revision: 3,
        updatedAt: at,
        lifecycle: { status: 'cancelled', cancelledAt: at, reasonCode: 'reservation_expired' },
      });
      const p = PaymentSchema.parse({
        ...payment(booking('booking_enrollment_template')),
        paymentId: enrollment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollmentId,
      });
      await db.doc(`course_enrollments/${enrollmentId}`).set(enrollment);
      await db.doc(`payments/${p.paymentId}`).set(p);
      await seedEvent(p);
      await syncGuestConfirmationWrite(
        db,
        'course_enrollments',
        enrollmentId,
        undefined,
        enrollment,
        now
      );
      const result = await processGuestConfirmationWork(db, now);
      expect(result.reconciled).toBe(1);
      expect((await work(p.paymentId)).status).toBe('complete');
    });

    it('blocks schema-invalid guest withdrawal and refuses cutover without weakening canonical lifecycle policy', async () => {
      const enrollment = canonicalCourseDeliveryFixtures.guestPendingEnrollment;
      const p = PaymentSchema.parse({
        ...payment(booking('booking_withdrawn_template')),
        paymentId: enrollment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollment.enrollmentId,
      });
      await db
        .doc(`course_enrollments/${enrollment.enrollmentId}`)
        .set({ ...enrollment, updatedAt: at, lifecycle: { status: 'withdrawn', withdrawnAt: at } });
      await db.doc(`payments/${p.paymentId}`).set(p);
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      expect((await work(p.paymentId)).status).toBe('blocked');
      const reconcile = vi.fn();
      await processGuestConfirmationWork(db, now, { reconcile });
      expect(reconcile).not.toHaveBeenCalled();
      expect((await work(p.paymentId)).status).toBe('blocked');
      await beginGuestConfirmationBackfill(db, 'emulator evidence');
      await runGuestConfirmationRecoveryPage(db, now, { backfill: true });
      await runGuestConfirmationRecoveryPage(db, now, { backfill: true });
      const control = (await readGuestConfirmationControl(db))!;
      await expect(cutoverGuestConfirmationQueue(db, control.epoch, 'checked')).rejects.toThrow(
        'blocked'
      );
    });

    it('coalesces concurrent and duplicate events without resetting completed work', async () => {
      const { subject, payment: p } = await seed('booking_duplicate');
      await Promise.all(
        Array.from({ length: 5 }, () =>
          syncGuestConfirmationWrite(db, 'bookings', subject.bookingId, undefined, subject, now)
        )
      );
      expect((await work(p.paymentId)).generation).toBe(1);
      await processGuestConfirmationWork(db, now);
      const metrics = workReadMetrics();
      expect(await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now }, metrics)).toBe(
        'unchanged'
      );
      expect((await work(p.paymentId)).status).toBe('complete');
      expect(metrics).toMatchObject({ workDocsRead: 1, subjectDocsRead: 1, paymentLookupReads: 1 });
    });

    it.each(['payment_first', 'subject_first'])(
      'handles %s delivery and late stale events using current source',
      async (order) => {
        const { subject, payment: p } = await seed(`booking_${order}`, false, 'confirmed');
        const cancelled = booking(subject.bookingId);
        const funded = payment(cancelled);
        if (order === 'payment_first') {
          await db.doc(`payments/${p.paymentId}`).set(funded);
          await syncGuestConfirmationWrite(db, 'payments', p.paymentId, p, funded, now);
          await db.doc(`bookings/${subject.bookingId}`).set(cancelled);
          await syncGuestConfirmationWrite(
            db,
            'bookings',
            subject.bookingId,
            subject,
            cancelled,
            now
          );
        } else {
          await db.doc(`bookings/${subject.bookingId}`).set(cancelled);
          await syncGuestConfirmationWrite(
            db,
            'bookings',
            subject.bookingId,
            subject,
            cancelled,
            now
          );
          await db.doc(`payments/${p.paymentId}`).set(funded);
          await syncGuestConfirmationWrite(db, 'payments', p.paymentId, p, funded, now);
        }
        await seedEvent(funded);
        await processGuestConfirmationWork(db, now);
        await syncGuestConfirmationWrite(
          db,
          'bookings',
          subject.bookingId,
          undefined,
          subject,
          now
        );
        expect((await work(p.paymentId)).status).toBe('complete');
        expect((await db.collection('admin_issues').get()).size).toBe(1);
      }
    );

    it('preserves a new generation delivered while the worker is running', async () => {
      const { subject, payment: p } = await seed('booking_generation');
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      await processGuestConfirmationWork(db, now, {
        reconcile: async () => {
          await db.doc(`bookings/${subject.bookingId}`).update({ revision: 4 });
          await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
          return 'aligned';
        },
      });
      expect(await work(p.paymentId)).toMatchObject({ status: 'pending', leaseToken: null });
      expect((await work(p.paymentId)).generation).toBeGreaterThan(1);
      expect((await processGuestConfirmationWork(db, now)).reconciled).toBe(1);
    });

    it('detects changed payment revision even before its event has been delivered', async () => {
      const { payment: p } = await seed('booking_undelivered_revision');
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      await processGuestConfirmationWork(db, now, {
        reconcile: async () => {
          await db.doc(`payments/${p.paymentId}`).update({ revision: 3 });
          return 'aligned';
        },
      });
      expect(await work(p.paymentId)).toMatchObject({
        status: 'pending',
        nextAttemptAtMs: now.getTime(),
      });
      expect((await processGuestConfirmationWork(db, now)).reconciled).toBe(1);
    });

    it('allows only one concurrent worker to claim a payment', async () => {
      const fixture = await seed('booking_concurrent_workers');
      await syncGuestConfirmationWork(db, { paymentId: fixture.payment.paymentId, now });
      const results = await Promise.all([
        processGuestConfirmationWork(db, now),
        processGuestConfirmationWork(db, now),
      ]);
      expect(results.reduce((sum, result) => sum + result.workCandidatesSelected, 0)).toBe(1);
      expect((await db.collection('admin_issues').get()).size).toBe(1);
    });

    it('backs off failures and restores progress without hot reads', async () => {
      const { payment: p } = await seed('booking_retry');
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      const result = await processGuestConfirmationWork(db, now, {
        reconcile: async () => {
          throw new Error('transient');
        },
      });
      expect(result).toMatchObject({ failed: 1, retried: 1 });
      expect(await work(p.paymentId)).toMatchObject({
        status: 'pending',
        attempts: 1,
        nextAttemptAtMs: now.getTime() + 30000,
      });
      expect((await processGuestConfirmationWork(db, now)).workDocsRead).toBe(0);
      expect(
        (await processGuestConfirmationWork(db, new Date(now.getTime() + 30000))).reconciled
      ).toBe(1);
    });

    it('keeps exhausted work on a daily retry without recovery or duplicate events resetting backoff', async () => {
      const fixture = await seed('booking_exhausted');
      await prepareQueue();
      await db
        .doc(`${GUEST_CONFIRMATION_WORK_COLLECTION}/${fixture.payment.paymentId}`)
        .update({ attempts: 7 });
      await processGuestConfirmationWork(db, now, {
        reconcile: async () => {
          throw new Error('transient');
        },
      });
      const blocked = await work(fixture.payment.paymentId);
      expect(blocked).toMatchObject({
        status: 'blocked',
        attempts: 8,
        nextAttemptAtMs: now.getTime() + 86400000,
      });
      await syncGuestConfirmationWork(db, { paymentId: fixture.payment.paymentId, now });
      await db.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ nextRecoveryAtMs: 0 });
      await runGuestConfirmationRecoveryPage(db, now);
      expect((await work(fixture.payment.paymentId)).nextAttemptAtMs).toBe(blocked.nextAttemptAtMs);
      expect((await processGuestConfirmationWork(db, now)).workDocsRead).toBe(0);
    });

    it('recovers expired leases after a crash following command commit without duplicate financial effects', async () => {
      const { payment: p } = await seed('booking_crash');
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      let failFinish = false;
      const wrapped = new Proxy(db, {
        get(target, key) {
          if (key === 'runTransaction')
            return (...args: Parameters<typeof db.runTransaction>) => {
              if (failFinish) throw new Error('simulated process crash before work completion');
              return target.runTransaction(...args);
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await expect(
        processGuestConfirmationWork(wrapped, now, {
          reconcile: async (input) => {
            const outcome = await reconcileGuestConfirmationLifecycleMismatchAfterCommand(input);
            failFinish = true;
            return outcome;
          },
        })
      ).rejects.toThrow('simulated process crash');
      expect((await work(p.paymentId)).leaseToken).toBeTruthy();
      expect(
        (await processGuestConfirmationWork(db, new Date(now.getTime() + WORK_LEASE_MS))).skipped
      ).toBe(1);
      expect((await work(p.paymentId)).status).toBe('complete');
      expect((await db.collection('admin_issues').get()).size).toBe(1);
      expect((await db.collection('monetary_events').get()).size).toBe(1);
    });

    it('keeps a funded pending subject scheduled until a factual time boundary', async () => {
      const { payment: p } = await seed('booking_pending', true, 'pending');
      await syncGuestConfirmationWork(db, { paymentId: p.paymentId, now });
      const result = await processGuestConfirmationWork(db, now);
      expect(result.failed).toBe(0);
      const current = await work(p.paymentId);
      expect(current.status).toBe('pending');
      expect(current.nextAttemptAtMs).toBeGreaterThan(now.getTime());
      expect((await processGuestConfirmationWork(db, now)).workDocsRead).toBe(0);
      const later = await processGuestConfirmationWork(db, new Date(current.nextAttemptAtMs));
      expect(later.workCandidatesSelected).toBe(1);
    });

    it('uses durable recovery cursors, coalesces recovery/event races, and eventually wraps old ranges', async () => {
      for (const id of ['booking_b', 'booking_c', 'booking_d']) await seed(id);
      await prepareQueue();
      await db.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ nextRecoveryAtMs: 0 });
      await runGuestConfirmationRecoveryPage(db, now, { pageSize: 1 });
      expect((await readGuestConfirmationControl(db))!.recovery.bookings.after).toBe('booking_b');
      // This insertion is behind the cursor and deliberately has no event.
      const inserted = await seed('booking_a');
      const time2 = new Date(now.getTime() + RECOVERY_INTERVAL_MS);
      await Promise.all([
        runGuestConfirmationRecoveryPage(db, time2, { pageSize: 1 }),
        syncGuestConfirmationWork(db, { paymentId: inserted.payment.paymentId, now: time2 }),
      ]);
      expect((await readGuestConfirmationControl(db))!.recovery.bookings.after).toBe('booking_c');
      for (let i = 2; i < 6; i++)
        await runGuestConfirmationRecoveryPage(
          db,
          new Date(now.getTime() + i * RECOVERY_INTERVAL_MS),
          { pageSize: 1 }
        );
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).size).toBe(4);
    });

    it('does not advance a recovery cursor if page processing fails and resumes after lease expiration', async () => {
      const { payment: p } = await seed('booking_broken_page');
      await beginGuestConfirmationBackfill(db, 'emulator evidence');
      const original = db.runTransaction.bind(db);
      vi.spyOn(db, 'runTransaction')
        .mockImplementationOnce(original)
        .mockImplementationOnce(async () => {
          throw new Error('simulated sync failure');
        });
      await expect(runGuestConfirmationRecoveryPage(db, now, { backfill: true })).rejects.toThrow(
        'simulated sync failure'
      );
      vi.restoreAllMocks();
      expect((await readGuestConfirmationControl(db))!.backfill.bookings.after).toBeNull();
      const result = await runGuestConfirmationRecoveryPage(
        db,
        new Date(now.getTime() + WORK_LEASE_MS),
        { backfill: true }
      );
      expect(result.applied).toBe(true);
      expect((await work(p.paymentId)).status).toBe('pending');
    });

    it('quarantines a corrupt first subject while recovering the next range and blocking unsafe cutover', async () => {
      await prepareQueue();
      const corrupt = await seed('booking_a_corrupt');
      const missed = await seed('booking_b_missed');
      await db.doc(`bookings/${corrupt.subject.bookingId}`).update({ paymentId: '' });
      await db.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ nextRecoveryAtMs: 0 });
      const first = await runGuestConfirmationRecoveryPage(db, now, { pageSize: 1 });
      expect(first).toMatchObject({ quarantined: 1, applied: true, failed: false });
      const second = await runGuestConfirmationRecoveryPage(
        db,
        new Date(now.getTime() + RECOVERY_INTERVAL_MS),
        { pageSize: 1 }
      );
      expect(second.applied).toBe(true);
      expect((await work(missed.payment.paymentId)).status).toBe('pending');
      const control = (await readGuestConfirmationControl(db))!;
      await rollbackGuestConfirmationQueue(db);
      await expect(cutoverGuestConfirmationQueue(db, control.epoch, 'checked')).rejects.toThrow(
        'blocked'
      );
      await db
        .doc(`bookings/${corrupt.subject.bookingId}`)
        .update({ paymentId: corrupt.payment.paymentId });
      expect((await repairGuestConfirmationQuarantinePage(db, now)).cleared).toBe(1);
      expect((await work(corrupt.payment.paymentId)).status).toBe('pending');
    });

    it('continues due work if a runtime recovery page fails', async () => {
      await prepareQueue();
      const current = await seed('booking_recovery_failure');
      await syncGuestConfirmationWork(db, { paymentId: current.payment.paymentId, now });
      await db.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ nextRecoveryAtMs: 0 });
      const original = db.runTransaction.bind(db);
      vi.spyOn(db, 'runTransaction')
        .mockImplementationOnce(original)
        .mockImplementationOnce(async () => {
          throw new Error('simulated recovery failure');
        });
      const result = await runScheduledGuestConfirmationReconciliation(db, now);
      expect(result).toMatchObject({ recoveryFailed: true, reconciled: 1 });
      expect((await readGuestConfirmationControl(db))!.recovery.bookings.after).toBeNull();
    });

    it('isolates a malformed work document and continues the batch', async () => {
      const current = await seed('booking_after_poison_work');
      await syncGuestConfirmationWork(db, { paymentId: current.payment.paymentId, now });
      await db
        .doc(`${GUEST_CONFIRMATION_WORK_COLLECTION}/invalid_work`)
        .set({ status: 'pending', nextAttemptAtMs: 0 });
      const result = await processGuestConfirmationWork(db, now);
      expect(result).toMatchObject({ failed: 1, reconciled: 1 });
      expect(
        (await db.doc(`${GUEST_CONFIRMATION_WORK_COLLECTION}/invalid_work`).get()).get(
          'nextAttemptAtMs'
        )
      ).toBeGreaterThan(now.getTime());
    });

    it('paginates quarantine repair beyond 25 unrepaired markers to a deleted subject', async () => {
      for (let i = 0; i < 25; i++) {
        const suffix = String(i).padStart(2, '0');
        const path = `bookings/booking_corrupt_${suffix}`;
        await db.doc(path).set({ attribution: { bookingOrigin: 'guest' }, paymentId: '' });
        await db
          .doc(`${GUEST_CONFIRMATION_QUARANTINE_COLLECTION}/marker_${suffix}`)
          .set({ subjectPath: path });
      }
      await db
        .doc(`${GUEST_CONFIRMATION_QUARANTINE_COLLECTION}/marker_25`)
        .set({ subjectPath: 'bookings/booking_deleted' });
      const first = await repairGuestConfirmationQuarantinePage(db, now);
      expect(first).toMatchObject({
        scanned: 25,
        cleared: 0,
        truncated: true,
        nextCursor: 'marker_24',
      });
      const second = await repairGuestConfirmationQuarantinePage(db, now, first.nextCursor!);
      expect(second).toMatchObject({ scanned: 1, cleared: 1, truncated: false });
    });

    it('checks old documents across two passes, requires explicit evidence, and rolls back without deleting work', async () => {
      const fixture = await seed('booking_old_2020');
      const historicalAt = timestampFromDate(new Date('2020-01-01T00:00:00Z'));
      await db.doc('bookings/booking_old_2020').set(
        BookingSchema.parse({
          ...fixture.subject,
          createdAt: historicalAt,
          updatedAt: historicalAt,
          lifecycle: {
            status: 'cancelled',
            cancelledAt: historicalAt,
            reasonCode: 'reservation_expired',
          },
          occurrence: {
            ...fixture.subject.occurrence,
            serviceParty: { ...fixture.subject.occurrence.serviceParty, frozenAt: historicalAt },
            interval: {
              startsAt: timestampFromDate(new Date('2020-01-15T04:00:00Z')),
              endsAt: timestampFromDate(new Date('2020-01-15T05:00:00Z')),
            },
          },
        })
      );
      await beginGuestConfirmationBackfill(db, 'emulator evidence');
      const dry = await runGuestConfirmationRecoveryPage(db, now, { backfill: true, dryRun: true });
      expect(dry.recoveryDocsRead).toBe(1);
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).empty).toBe(true);
      await runGuestConfirmationRecoveryPage(db, now, { backfill: true });
      await runGuestConfirmationRecoveryPage(db, now, { backfill: true });
      const control = (await readGuestConfirmationControl(db))!;
      expect(control.backfillPass).toBe(2);
      expect(control.mode).toBe('legacy');
      await expect(cutoverGuestConfirmationQueue(db, control.epoch, '')).rejects.toThrow(
        'evidence'
      );
      await cutoverGuestConfirmationQueue(db, control.epoch, 'verified');
      await rollbackGuestConfirmationQueue(db);
      expect((await readGuestConfirmationControl(db))!.mode).toBe('legacy');
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).size).toBe(1);
      await beginGuestConfirmationBackfill(db, 'new deployment evidence after rollback', {
        restart: true,
        now,
      });
      expect(await readGuestConfirmationControl(db)).toMatchObject({
        backfillPass: 0,
        readyEvidence: null,
      });
      await expect(cutoverGuestConfirmationQueue(db, control.epoch, 'stale proof')).rejects.toThrow(
        'not ready'
      );
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).size).toBe(1);
    });

    it('keeps TEST scoped financial state out of the LIVE reconciliation queue', async () => {
      const fixture = await seed('booking_test_scope');
      const scope = { dataScope: 'test', testSessionId: 'test_session_guest_work' };
      await db.doc(`bookings/${fixture.subject.bookingId}`).update(scope);
      await db.doc(`payments/${fixture.payment.paymentId}`).update(scope);
      expect(
        await syncGuestConfirmationWork(db, { paymentId: fixture.payment.paymentId, now })
      ).toBe('ignored');
      expect((await db.collection(GUEST_CONFIRMATION_WORK_COLLECTION).get()).empty).toBe(true);
    });
  }
);
