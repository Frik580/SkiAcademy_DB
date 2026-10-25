import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  BookingIdSchema,
  BookingSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  MonetaryEventSchema,
  PaymentSchema,
  createOpenAdminIssue,
  financialReconciliationMismatchIdentity,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
  AdminIssueSchema,
  AccountIdSchema,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalCourseDeliveryFixtures,
} from '@ski-academy/shared-domain/testing';
import { sweepGuestConfirmationLifecycleMismatches } from './guestConfirmationReconciliationSweep';

const PROJECT_ID = 'ski-academy-guest-confirmation-sweep-test';
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const mismatchAt = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));
const historicalAt = timestampFromDate(new Date('2020-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'bookings',
  'payments',
  'course_enrollments',
  'courses',
  'admin_issues',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'monetary_events',
] as const;

function fundedPayment(input: {
  readonly paymentId: string;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly createdAt?: ReturnType<typeof timestampFromDate>;
}) {
  const at = input.createdAt ?? createdAt;
  return PaymentSchema.parse({
    paymentId: input.paymentId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    currency: 'KZT',
    originalPrice: 12_000,
    price: 12_000,
    paidAmount: 12_000,
    refundedAmount: 0,
    retainedAmount: 12_000,
    settledAmount: 12_000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    incrementalRequirements: [],
    revision: 2,
    eventRevision: 1,
    createdAt: at,
    updatedAt: at,
  });
}

function fundingEvent(input: {
  readonly paymentId: string;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly createdAt?: ReturnType<typeof timestampFromDate>;
}) {
  const at = input.createdAt ?? createdAt;
  const commandId = CommandIdSchema.parse(`command_${input.paymentId}_fund`);
  return MonetaryEventSchema.parse({
    eventId: monetaryEventIdFromCommandEffect(commandId, 0),
    eventKind: 'manual_payment',
    currency: 'KZT',
    paymentId: input.paymentId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    paymentEffect: {
      paidAmountDelta: 12_000,
      settledAmountDelta: 12_000,
      outstandingAmountDelta: -12_000,
    },
    sourceKind: 'manual_external',
    manualReference: `${input.paymentId}-funded`,
    actor: { kind: 'system', systemActorId: 'system_guest_sweep_fixture' },
    commandId,
    correlationId: CorrelationIdSchema.parse('correlation_guest_sweep_fixture_01'),
    paymentEventRevision: 1,
    occurredAt: at,
    recordedAt: at,
  });
}

async function seedFundedSubjectPayment(input: {
  readonly paymentId: string;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly createdAt?: ReturnType<typeof timestampFromDate>;
}) {
  const payment = fundedPayment(input);
  const event = fundingEvent(input);
  await firestore.collection('payments').doc(payment.paymentId).set(payment);
  await firestore.collection('monetary_events').doc(event.eventId).set(event);
  return payment;
}

function cancelledGuestBooking(input: {
  readonly bookingId: ReturnType<typeof BookingIdSchema.parse>;
  readonly updatedAt?: ReturnType<typeof timestampFromDate>;
}) {
  const at = input.updatedAt ?? mismatchAt;
  const created = input.updatedAt ?? createdAt;
  const paymentId = paymentIdFromBookingId(input.bookingId);
  const template = canonicalBookingCollaborationFixtures.guestPendingBooking;
  return BookingSchema.parse({
    ...template,
    bookingId: input.bookingId,
    paymentId,
    occurrence: {
      ...template.occurrence,
      interval: input.updatedAt
        ? {
            startsAt: timestampFromDate(new Date('2020-01-15T04:00:00.000Z')),
            endsAt: timestampFromDate(new Date('2020-01-15T05:00:00.000Z')),
          }
        : template.occurrence.interval,
      serviceParty: {
        participantIds: [...template.occurrence.serviceParty.participantIds],
      },
    },
    lifecycle: {
      status: 'cancelled',
      cancelledAt: at,
      reasonCode: 'reservation_expired',
    },
    revision: 3,
    createdAt: created,
    updatedAt: at,
  });
}

function confirmedGuestBooking(bookingId: ReturnType<typeof BookingIdSchema.parse>) {
  const paymentId = paymentIdFromBookingId(bookingId);
  return BookingSchema.parse({
    ...canonicalBookingCollaborationFixtures.guestPendingBooking,
    bookingId,
    paymentId,
    lifecycle: { status: 'confirmed' },
    revision: 2,
    updatedAt: mismatchAt,
  });
}

function cancelledGuestEnrollment(input: {
  readonly enrollmentId: ReturnType<typeof CourseEnrollmentIdSchema.parse>;
}) {
  const paymentId = paymentIdFromCourseEnrollmentId(input.enrollmentId);
  return CourseEnrollmentSchema.parse({
    ...canonicalCourseDeliveryFixtures.guestPendingEnrollment,
    enrollmentId: input.enrollmentId,
    paymentId,
    lifecycle: {
      status: 'cancelled',
      cancelledAt: mismatchAt,
      reasonCode: 'reservation_expired',
    },
    revision: 2,
    updatedAt: mismatchAt,
  });
}

async function clearCollections(collections: readonly string[]): Promise<void> {
  for (const collectionName of collections) {
    const snapshot = await firestore.collection(collectionName).get();
    const batch = firestore.batch();
    for (const document of snapshot.docs) {
      batch.delete(document.ref);
    }
    if (snapshot.size > 0) {
      await batch.commit();
    }
  }
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'guest confirmation reconciliation sweep (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    }, 30_000);

    afterAll(async () => {
      if (app) {
        await deleteApp(app);
      }
    });

    beforeEach(async () => {
      await clearCollections([...COLLECTIONS_TO_CLEAR]);
    }, 30_000);

    it('does not scan historical fully-paid non-guest Payments on an empty guest run', async () => {
      for (let index = 0; index < 30; index += 1) {
        const bookingId = `booking_nonguest_history_${index}`;
        const payment = fundedPayment({
          paymentId: `payment_nonguest_history_${index}`,
          subjectType: 'booking',
          subjectId: bookingId,
        });
        await firestore.collection('payments').doc(payment.paymentId).set(payment);
      }

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.scannedCandidates).toBe(0);
      expect(result.fullyFundedCandidates).toBe(0);
      expect(result.scannedPayments).toBe(0);
      expect(result.paymentLookupReads).toBe(0);
      expect(result.reconciled).toBe(0);
      expect(result.truncated).toBe(false);
      expect((await firestore.collection('admin_issues').get()).size).toBe(0);
    }, 30_000);

    it('selects and reconciles a funded guest lesson mismatch and stays idempotent', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_lesson_01');
      const booking = cancelledGuestBooking({ bookingId });
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      });

      const first = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      const replay = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:05:00.000Z')
      );

      expect(first.scannedPayments).toBe(1);
      expect(first.workCandidatesSelected).toBe(1);
      expect(first.reconciled).toBe(1);
      expect(replay.workCandidatesSelected).toBe(0);
      expect(replay.alreadyOpenSkipped).toBe(1);
      expect(replay.outcomes).toEqual([]);
      expect(replay.reconciled).toBe(0);
      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(1);
      expect(issues.docs[0]?.data()).toMatchObject({
        kind: 'financial_reconciliation_mismatch',
        reconciliationScope: 'guest_confirmation_lifecycle',
        lifecycle: { status: 'open' },
        revision: 1,
      });
      expect((await firestore.collection('monetary_events').get()).size).toBe(1);
    }, 30_000);

    it('selects and reconciles a funded guest course-enrollment mismatch', async () => {
      const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_guest_sweep_01');
      const enrollment = cancelledGuestEnrollment({ enrollmentId });
      await firestore.collection('course_enrollments').doc(enrollmentId).set(enrollment);
      await seedFundedSubjectPayment({
        paymentId: enrollment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollmentId,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.scannedPayments).toBe(1);
      expect(result.reconciled).toBe(1);
      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(1);
      expect(issues.docs[0]?.data()).toMatchObject({
        kind: 'financial_reconciliation_mismatch',
        reconciliationScope: 'guest_confirmation_lifecycle',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
        lifecycle: { status: 'open' },
      });
    }, 30_000);

    it('records a funded pending guest course enrollment past reservation expiry as a lifecycle mismatch', async () => {
      const enrollmentId = CourseEnrollmentIdSchema.parse(
        'course_enrollment_guest_sweep_pending_01'
      );
      const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
      const enrollment = CourseEnrollmentSchema.parse({
        ...canonicalCourseDeliveryFixtures.guestPendingEnrollment,
        enrollmentId,
        paymentId,
        revision: 1,
      });
      await firestore
        .collection('courses')
        .doc(canonicalCourseDeliveryFixtures.course.courseId)
        .set(canonicalCourseDeliveryFixtures.course);
      await firestore.collection('course_enrollments').doc(enrollmentId).set(enrollment);
      await seedFundedSubjectPayment({
        paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollmentId,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-15T12:00:00.000Z')
      );
      expect(result.scannedPayments).toBe(1);
      expect(result.reconciled).toBe(1);
      expect(
        (await firestore.collection('course_enrollments').doc(enrollmentId).get()).data()?.lifecycle
          .status
      ).toBe('pending');
      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(1);
      expect(issues.docs[0]?.data()).toMatchObject({
        kind: 'financial_reconciliation_mismatch',
        reconciliationScope: 'guest_confirmation_lifecycle',
      });
    }, 30_000);

    it('does not reconcile an already consistent confirmed guest Payment', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_confirmed_01');
      const booking = confirmedGuestBooking(bookingId);
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.scannedCandidates).toBe(0);
      expect(result.scannedPayments).toBe(0);
      expect(result.reconciled).toBe(0);
      expect((await firestore.collection('admin_issues').get()).size).toBe(0);
    }, 30_000);

    it('still discovers a historical funded guest mismatch', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_historical_01');
      const booking = cancelledGuestBooking({ bookingId, updatedAt: historicalAt });
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
        createdAt: historicalAt,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.scannedPayments).toBe(1);
      expect(result.reconciled).toBe(1);
      expect((await firestore.collection('admin_issues').get()).size).toBe(1);
    }, 30_000);

    it('does not select an OPEN guest_confirmation_lifecycle issue or run reconciliation', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_open_issue_01');
      const booking = cancelledGuestBooking({ bookingId });
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      });
      const issue = createOpenAdminIssue({
        identity: financialReconciliationMismatchIdentity({
          subjectKind: 'booking',
          subjectId: bookingId,
          reconciliationScope: 'guest_confirmation_lifecycle',
        }),
        now: mismatchAt,
        correlationId: CorrelationIdSchema.parse('correlation_guest_sweep_open_seed_01'),
        commandId: CommandIdSchema.parse('command_guest_sweep_open_seed_01'),
      });
      await firestore.collection('admin_issues').doc(issue.issueId).set(issue);

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.alreadyOpenSkipped).toBe(1);
      expect(result.workCandidatesSelected).toBe(0);
      expect(result.outcomes).toEqual([]);
      expect(result.reconciled).toBe(0);
      expect((await firestore.collection('admin_issues').doc(issue.issueId).get()).data()).toMatchObject({
        revision: 1,
        lifecycle: { status: 'open' },
      });
      expect((await firestore.collection('monetary_events').get()).size).toBe(1);
    }, 30_000);

    it('selects a RESOLVED guest_confirmation_lifecycle issue so reconciliation can reopen it', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_resolved_issue_01');
      const booking = cancelledGuestBooking({ bookingId });
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      });
      const open = createOpenAdminIssue({
        identity: financialReconciliationMismatchIdentity({
          subjectKind: 'booking',
          subjectId: bookingId,
          reconciliationScope: 'guest_confirmation_lifecycle',
        }),
        now: mismatchAt,
        correlationId: CorrelationIdSchema.parse('correlation_guest_sweep_resolved_seed_01'),
        commandId: CommandIdSchema.parse('command_guest_sweep_resolved_seed_01'),
      });
      const resolved = AdminIssueSchema.parse({
        ...open,
        lifecycle: {
          status: 'resolved',
          openedAt: mismatchAt,
          lastDetectedAt: mismatchAt,
          resolvedAt: mismatchAt,
          resolution: {
            reason: 'Temporarily acknowledged without changing the mismatch',
            resolvedByAccountId: AccountIdSchema.parse('account_admin_fixture_01'),
          },
        },
        revision: 2,
      });
      await firestore.collection('admin_issues').doc(resolved.issueId).set(resolved);

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z')
      );
      expect(result.alreadyOpenSkipped).toBe(0);
      expect(result.workCandidatesSelected).toBe(1);
      expect(result.reconciled).toBe(1);
      expect((await firestore.collection('admin_issues').doc(resolved.issueId).get()).data()).toMatchObject({
        lifecycle: { status: 'open' },
        revision: 3,
      });
    }, 30_000);

    it('reaches older unrepaired booking work in the same run after newer already-open rows', async () => {
      for (let index = 0; index < 3; index += 1) {
        const bookingId = BookingIdSchema.parse(`booking_guest_sweep_starvation_open_${index}`);
        const booking = cancelledGuestBooking({
          bookingId,
          updatedAt: timestampFromDate(new Date(`2026-01-01T11:0${3 - index}:00.000Z`)),
        });
        await firestore.collection('bookings').doc(bookingId).set(booking);
        await seedFundedSubjectPayment({
          paymentId: booking.paymentId,
          subjectType: 'booking',
          subjectId: bookingId,
        });
        const issue = createOpenAdminIssue({
          identity: financialReconciliationMismatchIdentity({
            subjectKind: 'booking',
            subjectId: bookingId,
            reconciliationScope: 'guest_confirmation_lifecycle',
          }),
          now: mismatchAt,
          correlationId: CorrelationIdSchema.parse(`correlation_guest_sweep_starvation_open_${index}`),
          commandId: CommandIdSchema.parse(`command_guest_sweep_starvation_open_${index}`),
        });
        await firestore.collection('admin_issues').doc(issue.issueId).set(issue);
      }
      const olderId = BookingIdSchema.parse('booking_guest_sweep_starvation_work_01');
      const older = cancelledGuestBooking({ bookingId: olderId, updatedAt: historicalAt });
      await firestore.collection('bookings').doc(olderId).set(older);
      await seedFundedSubjectPayment({
        paymentId: older.paymentId,
        subjectType: 'booking',
        subjectId: olderId,
        createdAt: historicalAt,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z'),
        { maxCandidates: 2, pageSize: 2 }
      );
      expect(result.alreadyOpenSkipped).toBe(3);
      expect(result.workCandidatesSelected).toBe(1);
      expect(result.reconciled).toBe(1);
      expect((await firestore.collection('admin_issues').get()).size).toBe(4);
    }, 30_000);

    it('reaches a course-enrollment work candidate after already-open booking streams', async () => {
      const bookingId = BookingIdSchema.parse('booking_guest_sweep_cross_stream_open_01');
      const booking = cancelledGuestBooking({ bookingId });
      await firestore.collection('bookings').doc(bookingId).set(booking);
      await seedFundedSubjectPayment({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      });
      const bookingIssue = createOpenAdminIssue({
        identity: financialReconciliationMismatchIdentity({
          subjectKind: 'booking',
          subjectId: bookingId,
          reconciliationScope: 'guest_confirmation_lifecycle',
        }),
        now: mismatchAt,
        correlationId: CorrelationIdSchema.parse('correlation_guest_sweep_cross_stream_open_01'),
        commandId: CommandIdSchema.parse('command_guest_sweep_cross_stream_open_01'),
      });
      await firestore.collection('admin_issues').doc(bookingIssue.issueId).set(bookingIssue);

      const enrollmentId = CourseEnrollmentIdSchema.parse(
        'course_enrollment_guest_sweep_cross_stream_01'
      );
      const enrollment = cancelledGuestEnrollment({ enrollmentId });
      await firestore.collection('course_enrollments').doc(enrollmentId).set(enrollment);
      await seedFundedSubjectPayment({
        paymentId: enrollment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollmentId,
      });

      const result = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T12:00:00.000Z'),
        { maxCandidates: 1 }
      );
      expect(result.alreadyOpenSkipped).toBe(1);
      expect(result.workCandidatesSelected).toBe(1);
      expect(result.reconciled).toBe(1);
      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(2);
      expect(
        issues.docs.some(
          (doc) =>
            doc.data().subjectRef?.subjectKind === 'course_enrollment' &&
            doc.data().subjectRef?.enrollmentId === enrollmentId
        )
      ).toBe(true);
    }, 30_000);
  }
);
